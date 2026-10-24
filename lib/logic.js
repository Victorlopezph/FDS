// Reglas fijas: permisos, porcentajes, estados, invitaciones y alertas.
export const TASK_STATUS = ['pendiente', 'curso', 'trabado', 'hecho'];
export const PRIORITIES = ['alta', 'media', 'baja'];
export const LEVELS = ['urgente', 'aviso', 'info', 'logro'];
const COLORS = ['lav', 'sky', 'peach', 'mint', 'butter', 'rose'];

export const newId = (p) => p + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
export const colorFor = (id) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

// ---------- Usuarios ----------
export function upsertUser(state, u) {
  let m = state.members.find((x) => x.id === u.id);
  if (!m) {
    state.members.push({ id: u.id, name: u.name, email: u.email || null, picture: u.picture || null, role: '', schedule: '', color: colorFor(u.id) });
    return true;
  }
  let changed = false;
  for (const k of ['email', 'picture']) if (u[k] && m[k] !== u[k]) { m[k] = u[k]; changed = true; }
  return changed;
}

function addToProject(state, project, userId) {
  if (project.members.includes(userId)) return false;
  project.members.push(userId);
  const name = state.members.find((m) => m.id === userId)?.name || 'Alguien';
  addAlert(state, { to: 'todos', level: 'info', message: `${name} se sumó a ${project.name}.`, audience: project.members, projectId: project.id });
  return true;
}

// Si te invitaron por mail, al entrar con Google quedás adentro del proyecto.
export function joinByEmail(state, user) {
  if (!user.email) return false;
  let changed = false;
  for (const p of state.projects) {
    if (p.invites?.includes(user.email)) {
      p.invites = p.invites.filter((e) => e !== user.email);
      addToProject(state, p, user.id);
      changed = true;
    }
  }
  return changed;
}

export function joinByCode(state, me, code) {
  const p = state.projects.find((x) => x.inviteCode === code);
  if (!p) return null;
  addToProject(state, p, me);
  return p;
}

export function invite(state, me, projectId, emailRaw) {
  const p = state.projects.find((x) => x.id === projectId && x.members.includes(me));
  if (!p) return { error: 'No tenés acceso a ese proyecto.' };
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Ese mail no parece válido.' };
  const existing = state.members.find((m) => m.email === email);
  if (existing) {
    if (p.members.includes(existing.id)) return { message: `${existing.name} ya está en el proyecto.` };
    addToProject(state, p, existing.id);
    return { message: `${existing.name} ya está adentro.` };
  }
  if (!p.invites.includes(email)) p.invites.push(email);
  return { message: `Listo. Cuando ${email} entre con Google, va a ver el proyecto.` };
}

export function createProject(state, me, { name, priority, deadline }) {
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) return { error: 'Ponele un nombre al proyecto.' };
  const p = {
    id: newId('p'), name: clean,
    priority: PRIORITIES.includes(priority) ? priority : 'media',
    deadline: okDate(deadline), ownerId: me, members: [me], invites: [], inviteCode: newId('i'),
  };
  state.projects.push(p);
  return { project: p };
}

// ---------- Gestión manual de proyectos, tareas e integrantes ----------
const myProject = (state, me, projectId) => state.projects.find((x) => x.id === projectId && x.members.includes(me));
const nameOfMember = (state, id) => state.members.find((m) => m.id === id)?.name || 'Alguien';

export function updateProject(state, me, { projectId, name, priority, deadline }) {
  const p = myProject(state, me, projectId);
  if (!p) return { error: 'No tenés acceso a ese proyecto.' };
  if (name !== undefined) {
    const clean = String(name).trim().slice(0, 60);
    if (!clean) return { error: 'Ponele un nombre al proyecto.' };
    p.name = clean;
  }
  if (PRIORITIES.includes(priority)) p.priority = priority;
  if (deadline !== undefined) p.deadline = okDate(deadline);
  return { message: 'Proyecto actualizado.' };
}

export function deleteProject(state, me, projectId) {
  const p = myProject(state, me, projectId);
  if (!p) return { error: 'No tenés acceso a ese proyecto.' };
  if (p.ownerId !== me) return { error: 'Solo quien creó el proyecto puede eliminarlo.' };
  state.projects = state.projects.filter((x) => x.id !== p.id);
  state.tasks = state.tasks.filter((t) => t.projectId !== p.id);
  state.alerts = state.alerts.filter((a) => a.projectId !== p.id);
  if (state.chats) delete state.chats[p.id];
  return { message: `Eliminaste ${p.name}.`, removed: true };
}

export function addMember(state, me, projectId, userId) {
  const p = myProject(state, me, projectId);
  if (!p) return { error: 'No tenés acceso a ese proyecto.' };
  // Solo se puede sumar a alguien que ya comparte otro proyecto con vos
  const teammates = new Set(state.projects.filter((x) => x.members.includes(me)).flatMap((x) => x.members));
  if (!teammates.has(userId)) return { error: 'Esa persona no está en tu equipo. Invitala por mail o link.' };
  addToProject(state, p, userId);
  return { message: `${nameOfMember(state, userId)} se sumó al proyecto.` };
}

// El creador puede sacar a cualquiera; cualquiera puede salirse.
export function removeMember(state, me, projectId, userId) {
  const p = myProject(state, me, projectId);
  if (!p || !p.members.includes(userId)) return { error: 'No tenés acceso a ese proyecto.' };
  const leaving = userId === me;
  if (!leaving && p.ownerId !== me) return { error: 'Solo quien creó el proyecto puede sacar gente.' };
  if (leaving && p.members.length === 1) return deleteProject(state, me, projectId);

  p.members = p.members.filter((id) => id !== userId);
  if (p.ownerId === userId) p.ownerId = p.members[0]; // el proyecto pasa al siguiente integrante
  for (const t of state.tasks) if (t.projectId === p.id && t.assignee === userId) t.assignee = null;

  const who = nameOfMember(state, userId);
  addAlert(state, {
    to: 'todos', level: 'aviso', projectId: p.id, audience: p.members,
    message: leaving ? `${who} salió de ${p.name}. Sus tareas quedaron sin asignar.` : `${who} ya no está en ${p.name}. Sus tareas quedaron sin asignar.`,
  });
  if (!leaving) addAlert(state, { to: userId, level: 'info', message: `Te sacaron del proyecto ${p.name}.`, audience: [userId] });
  return { message: leaving ? `Saliste de ${p.name}.` : `Sacaste a ${who}.`, removed: leaving };
}

export function cancelInvite(state, me, projectId, email) {
  const p = myProject(state, me, projectId);
  if (!p) return { error: 'No tenés acceso a ese proyecto.' };
  p.invites = p.invites.filter((e) => e !== email);
  return { message: 'Invitación cancelada.' };
}

function taskFields(t, data, project) {
  if (data.title !== undefined) {
    const clean = String(data.title).trim().slice(0, 120);
    if (!clean) return 'Escribí qué hay que hacer.';
    t.title = clean;
  }
  if (data.assignee !== undefined) {
    if (data.assignee && !project.members.includes(data.assignee)) return 'Esa persona no está en el proyecto.';
    t.assignee = data.assignee || null;
  }
  if (TASK_STATUS.includes(data.status)) t.status = data.status;
  if (PRIORITIES.includes(data.priority)) t.priority = data.priority;
  if (data.deadline !== undefined) t.deadline = okDate(data.deadline);
  return null;
}

export function createTask(state, me, data) {
  const p = myProject(state, me, data.projectId);
  if (!p) return { error: 'No tenés acceso a ese proyecto.' };
  const t = { id: newId('t'), projectId: p.id, title: '', assignee: null, status: 'pendiente', priority: 'media', deadline: null };
  const err = taskFields(t, { title: data.title ?? '', ...data }, p);
  if (err) return { error: err };
  state.tasks.push(t);
  if (t.assignee && t.assignee !== me) {
    addAlert(state, { to: t.assignee, level: 'info', projectId: p.id, audience: [t.assignee],
      message: `${nameOfMember(state, me)} te asignó "${t.title}" en ${p.name}.` });
  }
  return { message: 'Tarea creada.' };
}

export function updateTask(state, me, data) {
  const t = state.tasks.find((x) => x.id === data.taskId);
  const p = t && myProject(state, me, t.projectId);
  if (!p) return { error: 'No tenés acceso a esa tarea.' };
  const prevAssignee = t.assignee;
  const copy = { ...t };
  const err = taskFields(copy, data, p);
  if (err) return { error: err };
  Object.assign(t, copy);
  if (t.assignee && t.assignee !== prevAssignee && t.assignee !== me) {
    addAlert(state, { to: t.assignee, level: 'info', projectId: p.id, audience: [t.assignee],
      message: `${nameOfMember(state, me)} te asignó "${t.title}" en ${p.name}.` });
  }
  return { message: 'Tarea guardada.' };
}

export function deleteTask(state, me, taskId) {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t || !myProject(state, me, t.projectId)) return { error: 'No tenés acceso a esa tarea.' };
  state.tasks = state.tasks.filter((x) => x.id !== taskId);
  return { message: 'Tarea eliminada.' };
}

// ---------- Lo que ve cada usuario ----------
export function viewFor(state, me) {
  const projects = state.projects.filter((p) => p.members.includes(me));
  const pids = new Set(projects.map((p) => p.id));
  const ids = new Set([me, ...projects.flatMap((p) => p.members)]);
  return {
    me,
    members: state.members.filter((m) => ids.has(m.id)),
    projects,
    tasks: state.tasks.filter((t) => pids.has(t.projectId)),
    alerts: state.alerts.filter((a) => a.audience?.includes(me)).slice(0, 50),
    chats: Object.fromEntries(projects.map((p) => [p.id, (state.chats?.[p.id] || []).slice(-60)])),
  };
}

// Vista de un solo proyecto: lo que ve el agente en el chat de ese proyecto.
export function projectView(state, me, projectId) {
  const v = viewFor(state, me);
  const p = v.projects.find((x) => x.id === projectId);
  if (!p) return null;
  return {
    me, projects: [p],
    members: v.members.filter((m) => p.members.includes(m.id)),
    tasks: v.tasks.filter((t) => t.projectId === p.id),
  };
}

export function addChat(state, projectId, msg) {
  state.chats ||= {};
  const list = (state.chats[projectId] ||= []);
  list.push({ id: newId('m'), createdAt: Date.now(), ...msg });
  if (list.length > 150) list.splice(0, list.length - 150);
}

// ---------- Porcentajes y estados ----------
export function recompute(state) {
  const now = Date.now();
  for (const p of state.projects) {
    const tasks = state.tasks.filter((t) => t.projectId === p.id);
    const done = tasks.filter((t) => t.status === 'hecho').length;
    p.progress = tasks.length ? Math.round((done * 100) / tasks.length) : 0;
    const days = p.deadline ? (new Date(p.deadline + 'T23:59:59-03:00') - now) / 86400000 : null;
    if (tasks.length && done === tasks.length) p.status = 'terminado';
    else if (tasks.some((t) => t.status === 'trabado')) p.status = 'trabado';
    else if (days !== null && (days < 0 || (days <= 3 && p.progress < 70))) p.status = 'riesgo';
    else p.status = 'marcha';
  }
  return state;
}

export function addAlert(state, { to, level, message, audience, projectId = null }) {
  state.alerts.unshift({ id: newId('a'), to, level, message, audience: [...new Set(audience)], projectId, createdAt: Date.now(), readBy: [] });
  state.alerts.length = Math.min(state.alerts.length, 300); // que no crezca sin límite
}

export function autoAlerts(state, before) {
  for (const p of state.projects) {
    if (!(p.id in before) || before[p.id] === p.status) continue;
    const base = { to: 'todos', audience: p.members, projectId: p.id };
    if (p.status === 'riesgo') addAlert(state, { ...base, level: 'aviso', message: `${p.name} pasó a En riesgo (${p.progress}% de avance).` });
    if (p.status === 'trabado') addAlert(state, { ...base, level: 'urgente', message: `${p.name} tiene tareas trabadas.` });
    if (p.status === 'terminado') addAlert(state, { ...base, level: 'logro', message: `¡${p.name} está terminado!` });
  }
}

export const statusSnapshot = (state) => Object.fromEntries(state.projects.map((p) => [p.id, p.status]));

const okDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

// ---------- Aplicar lo que devolvió el agente (solo dentro de los proyectos del usuario) ----------
export function applyAgentResult(state, r, me, onlyProjectId = null) {
  recompute(state);
  const before = statusSnapshot(state);
  const view = viewFor(state, me);
  const scope = onlyProjectId ? view.projects.filter((p) => p.id === onlyProjectId) : view.projects;
  const visible = new Map(scope.map((p) => [p.id, p]));
  const teamIds = onlyProjectId ? (scope[0]?.members || []) : view.members.map((m) => m.id);
  const idMap = {};

  for (const np of onlyProjectId ? [] : r.nuevosProyectos || []) {
    const { project } = createProject(state, me, np);
    if (project) { idMap[np.tempId] = project.id; visible.set(project.id, project); }
  }

  for (const nt of r.nuevasTareas || []) {
    const project = visible.get(idMap[nt.projectId] || nt.projectId);
    if (!project || !nt.title) continue;
    state.tasks.push({
      _touched: true, _prev: null,
      id: newId('t'), projectId: project.id, title: String(nt.title).slice(0, 120),
      assignee: project.members.includes(nt.assignee) ? nt.assignee : null,
      status: TASK_STATUS.includes(nt.status) ? nt.status : 'pendiente',
      priority: PRIORITIES.includes(nt.priority) ? nt.priority : 'media',
      deadline: okDate(nt.deadline),
    });
  }

  for (const c of r.cambios || []) {
    const t = state.tasks.find((x) => x.id === c.taskId);
    const project = t && visible.get(t.projectId);
    if (!project) continue;
    if (!t._touched) { t._touched = true; t._prev = t.assignee; }
    if (TASK_STATUS.includes(c.status)) t.status = c.status;
    if (c.assignee === null || project.members.includes(c.assignee)) t.assignee = c.assignee;
    if (c.deadline !== undefined) t.deadline = okDate(c.deadline);
    if (PRIORITIES.includes(c.priority)) t.priority = c.priority;
  }

  // Aviso siempre a quien le asignan algo (si el agente no le escribió ya)
  const alreadyWarned = new Set((r.alertas || []).map((a) => a.to));
  const assigned = [];
  for (const t of state.tasks) {
    if (t.assignee && t.assignee !== me && visible.has(t.projectId) && t._prev !== t.assignee && t._touched) assigned.push(t);
    delete t._prev; delete t._touched;
  }
  for (const t of assigned) {
    if (alreadyWarned.has(t.assignee)) continue;
    const p = visible.get(t.projectId);
    addAlert(state, { to: t.assignee, level: 'info', projectId: p.id, audience: [t.assignee],
      message: `Team lab te asignó "${t.title}" en ${p.name}.` });
  }

  for (const a of r.alertas || []) {
    if (!a.message) continue;
    const project = visible.get(idMap[a.projectId] || a.projectId) || (onlyProjectId ? scope[0] : null);
    const individual = teamIds.includes(a.to);
    addAlert(state, {
      to: individual ? a.to : 'todos',
      level: LEVELS.includes(a.level) ? a.level : 'info',
      message: String(a.message).slice(0, 300),
      audience: individual ? [a.to, me] : project ? project.members : teamIds,
      projectId: project?.id || null,
    });
  }

  recompute(state);
  autoAlerts(state, before);
  return state;
}

// Resumen compacto del equipo para darle contexto a la IA.
export function contextFor(view) {
  const nameOf = (id) => view.members.find((m) => m.id === id)?.name || 'sin asignar';
  return JSON.stringify({
    miembros: view.members.map(({ id, name, role, schedule, skills }) => ({
      id, name, rol: role || 'sin definir', horario: schedule || 'sin definir',
      habilidades: skills?.length ? skills : ['sin cargar'],
      tareasAbiertas: view.tasks.filter((t) => t.assignee === id && t.status !== 'hecho').length,
    })),
    proyectos: view.projects.map(({ id, name, priority, deadline, status, progress, members }) =>
      ({ id, name, prioridad: priority, fechaLimite: deadline || 'sin fecha', estado: status, avance: progress + '%', integrantes: members.map((m) => ({ id: m, nombre: nameOf(m) })) })),
    tareas: view.tasks.map(({ id, projectId, title, assignee, status, priority, deadline }) =>
      ({ id, projectId, title, responsable: assignee, nombreResponsable: nameOf(assignee), estado: status, prioridad: priority, fechaLimite: deadline })),
  });
}
