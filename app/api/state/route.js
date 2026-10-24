import { getState, saveState, getPresence, storageMode } from '@/lib/store';
import { getSessionUser, unauthorized } from '@/lib/auth';
import {
  recompute, autoAlerts, statusSnapshot, viewFor, upsertUser, joinByEmail, joinByCode,
  invite, createProject, updateProject, deleteProject, addMember, removeMember, cancelInvite,
  createTask, updateTask, deleteTask, TASK_STATUS,
} from '@/lib/logic';
import { seedDemo } from '@/lib/seed';
import { cleanSkills } from '@/lib/skills';

export const dynamic = 'force-dynamic';

async function respond(state, user, extra = {}) {
  const view = viewFor(state, user.id);
  const all = await getPresence();
  const presence = Object.fromEntries(view.members.map((m) => [m.id, all[m.id] || 0]));
  return Response.json({ state: view, presence, storage: storageMode, user, ...extra });
}

export async function GET(req) {
  const user = getSessionUser(req);
  if (!user) return unauthorized();
  const state = await getState();
  const a = upsertUser(state, user);
  const b = joinByEmail(state, user);
  if (a || b) await saveState(state);
  // Recalcula al leer: así "En riesgo" aparece solo cuando se acerca la fecha.
  recompute(state);
  return respond(state, user);
}

export async function POST(req) {
  const user = getSessionUser(req);
  if (!user) return unauthorized();
  const me = user.id;
  const body = await req.json();
  const state = await getState();
  upsertUser(state, user);
  recompute(state);
  const before = statusSnapshot(state);
  let extra = {};

  switch (body.action) {
    case 'setTaskStatus': {
      const t = state.tasks.find((x) => x.id === body.taskId);
      const p = t && state.projects.find((x) => x.id === t.projectId);
      if (p?.members.includes(me) && TASK_STATUS.includes(body.status)) t.status = body.status;
      break;
    }
    case 'readAlerts':
      for (const a of state.alerts) if (a.audience?.includes(me) && !a.readBy.includes(me)) a.readBy.push(me);
      break;
    case 'createProject': {
      const r = createProject(state, me, body);
      extra = r.error ? { error: r.error } : { projectId: r.project.id };
      break;
    }
    case 'invite':
      extra = invite(state, me, body.projectId, body.email);
      break;
    case 'updateProject':
      extra = updateProject(state, me, body);
      break;
    case 'deleteProject':
      extra = deleteProject(state, me, body.projectId);
      break;
    case 'addMember':
      extra = addMember(state, me, body.projectId, body.userId);
      break;
    case 'removeMember':
      extra = removeMember(state, me, body.projectId, body.userId);
      break;
    case 'cancelInvite':
      extra = cancelInvite(state, me, body.projectId, body.email);
      break;
    case 'createTask':
      extra = createTask(state, me, body);
      break;
    case 'updateTask':
      extra = updateTask(state, me, body);
      break;
    case 'deleteTask':
      extra = deleteTask(state, me, body.taskId);
      break;
    case 'join': {
      const p = joinByCode(state, me, String(body.code || ''));
      extra = p ? { projectId: p.id, message: `Te sumaste a ${p.name}.` } : { error: 'El link de invitación no es válido.' };
      break;
    }
    case 'loadDemo':
      seedDemo(state, me);
      break;
    case 'updateProfile': {
      const m = state.members.find((x) => x.id === me);
      if (m) {
        if (typeof body.role === 'string') m.role = body.role.trim().slice(0, 40);
        if (typeof body.schedule === 'string') m.schedule = body.schedule.trim().slice(0, 80);
        if (typeof body.name === 'string' && body.name.trim()) m.name = body.name.trim().slice(0, 30);
        if (body.skills !== undefined) m.skills = cleanSkills(body.skills);
      }
      break;
    }
    default:
      return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  }

  recompute(state);
  autoAlerts(state, before);
  await saveState(state);
  return respond(state, user, extra);
}
