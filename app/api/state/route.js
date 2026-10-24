import { getState, getPresence, mutateState, StorageUnavailableError, storageMode } from '@/lib/store';
import { getSessionUser, unauthorized } from '@/lib/auth';
import {
  recompute, autoAlerts, statusSnapshot, viewFor, upsertUser, joinByEmail, joinByCode,
  invite, createProject, updateProject, deleteProject, addMember, removeMember, cancelInvite,
  createTask, updateTask, deleteTask, TASK_STATUS,
} from '@/lib/logic';
import { seedDemo } from '@/lib/seed';
import { cleanSkills, cleanAvailability, scheduleText } from '@/lib/skills';

export const dynamic = 'force-dynamic';

async function respond(state, user, extra = {}) {
  const view = viewFor(state, user.id);
  const all = await getPresence();
  const presence = Object.fromEntries(view.members.map((member) => [member.id, all[member.id] || 0]));
  return Response.json({ state: view, presence, storage: storageMode, user, ...extra });
}

function storageErrorResponse(error) {
  const status = error instanceof StorageUnavailableError ? 503 : 500;
  return Response.json({ error: status === 503 ? 'El almacenamiento durable no está disponible.' : 'No se pudo guardar el estado.' }, { status });
}

export async function GET(req) {
  const user = getSessionUser(req);
  if (!user) return unauthorized();
  try {
    let state = await getState();
    const userChanged = upsertUser(state, user);
    const invitationChanged = joinByEmail(state, user);
    if (userChanged || invitationChanged) {
      ({ state } = await mutateState((current) => {
        upsertUser(current, user);
        joinByEmail(current, user);
        recompute(current);
      }));
    } else {
      recompute(state);
    }
    return respond(state, user);
  } catch (error) {
    return storageErrorResponse(error);
  }
}

export async function POST(req) {
  const user = getSessionUser(req);
  if (!user) return unauthorized();
  let body;
  try { body = await req.json(); } catch {
    return Response.json({ error: 'El cuerpo de la solicitud no es válido.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'El cuerpo de la solicitud no es válido.' }, { status: 400 });
  const actions = new Set([
    'setTaskStatus', 'readAlerts', 'createProject', 'invite', 'updateProject', 'deleteProject',
    'addMember', 'removeMember', 'cancelInvite', 'createTask', 'updateTask', 'deleteTask',
    'join', 'loadDemo', 'updateProfile',
  ]);
  if (!actions.has(body.action)) return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  const me = user.id;

  try {
    const { state, result } = await mutateState((current) => {
      upsertUser(current, user);
      recompute(current);
      const before = statusSnapshot(current);
      let extra = {};

      switch (body.action) {
        case 'setTaskStatus': {
          const task = current.tasks.find((item) => item.id === body.taskId);
          const project = task && current.projects.find((item) => item.id === task.projectId);
          if (project?.members.includes(me) && TASK_STATUS.includes(body.status)) {
            if (body.status === 'hecho') {
              task.status = 'hecho';
              task.progress = 100;
            } else if (body.status === 'pendiente' && task.progress > 0 && task.progress < 100) {
              task.status = 'curso';
            } else {
              if (body.status === 'pendiente' || task.progress >= 100) task.progress = 0;
              task.status = body.status;
            }
            task.version = (Number.isSafeInteger(task.version) && task.version >= 0 ? task.version : 0) + 1;
          }
          break;
        }
        case 'readAlerts':
          for (const alert of current.alerts) {
            if (!Array.isArray(alert.readBy)) alert.readBy = [];
            if (alert.audience?.includes(me) && !alert.readBy.includes(me)) alert.readBy.push(me);
          }
          break;
        case 'createProject': {
          const created = createProject(current, me, body);
          extra = created.error ? { error: created.error } : { projectId: created.project.id };
          break;
        }
        case 'invite': extra = invite(current, me, body.projectId, body.email); break;
        case 'updateProject': extra = updateProject(current, me, body); break;
        case 'deleteProject': extra = deleteProject(current, me, body.projectId); break;
        case 'addMember': extra = addMember(current, me, body.projectId, body.userId); break;
        case 'removeMember': extra = removeMember(current, me, body.projectId, body.userId); break;
        case 'cancelInvite': extra = cancelInvite(current, me, body.projectId, body.email); break;
        case 'createTask': extra = createTask(current, me, body); break;
        case 'updateTask': extra = updateTask(current, me, body); break;
        case 'deleteTask': extra = deleteTask(current, me, body.taskId); break;
        case 'join': {
          const project = joinByCode(current, me, String(body.code || ''));
          extra = project ? { projectId: project.id, message: `Te sumaste a ${project.name}.` } : { error: 'El link de invitación no es válido.' };
          break;
        }
        case 'loadDemo': seedDemo(current, me); break;
        case 'updateProfile': {
          const member = current.members.find((item) => item.id === me);
          if (member) {
            if (typeof body.role === 'string') member.role = body.role.trim().slice(0, 40);
            if (typeof body.schedule === 'string') member.schedule = body.schedule.trim().slice(0, 80);
            if (typeof body.name === 'string' && body.name.trim()) member.name = body.name.trim().slice(0, 30);
            if (body.skills !== undefined) member.skills = cleanSkills(body.skills);
            if (body.availability !== undefined) {
              member.availability = cleanAvailability(body.availability);
              member.schedule = scheduleText(member.availability);
            }
          }
          break;
        }
        default: break;
      }

      recompute(current);
      autoAlerts(current, before);
      return extra;
    });
    return respond(state, user, result || {});
  } catch (error) {
    return storageErrorResponse(error);
  }
}
