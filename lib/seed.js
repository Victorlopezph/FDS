// Proyectos de ejemplo para la demo, con compañeros ficticios. Las fechas se calculan desde hoy.
import { newId, addAlert } from './logic';

export function todayISO(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);
}

const DEMO_MEMBERS = [
  { id: 'demo-juan', name: 'Juan', role: 'Frontend', schedule: 'Lun a Jue, 18 a 22 h', color: 'sky', skills: ['Frontend', 'Mobile', 'Testing'] },
  { id: 'demo-lucia', name: 'Lucía', role: 'Diseño UX', schedule: 'Mar, Jue y Sáb, 10 a 16 h', color: 'peach', skills: ['Diseño UX/UI', 'Presentación', 'Mapas y geo'] },
  { id: 'demo-mateo', name: 'Mateo', role: 'Base de datos', schedule: 'Lun a Vie, 14 a 18 h', color: 'mint', skills: ['Base de datos', 'Backend', 'DevOps'] },
  { id: 'demo-sofia', name: 'Sofía', role: 'Testing y docs', schedule: 'Fines de semana, 10 a 18 h', color: 'butter', skills: ['Testing', 'Documentación', 'Investigación'] },
];

export function seedDemo(state, me) {
  for (const d of DEMO_MEMBERS) {
    const found = state.members.find((m) => m.id === d.id);
    if (!found) state.members.push({ ...d, email: null, picture: null });
    else if (!found.skills) found.skills = d.skills;
  }

  // Borra el ejemplo anterior de este usuario
  const old = new Set(state.projects.filter((p) => p.demo && p.ownerId === me).map((p) => p.id));
  state.projects = state.projects.filter((p) => !old.has(p.id));
  state.tasks = state.tasks.filter((t) => !old.has(t.projectId));
  state.alerts = state.alerts.filter((a) => !old.has(a.projectId));

  const P = (name, priority, deadline, others) => ({
    id: newId('p'), name, priority, deadline, ownerId: me, members: [me, ...others],
    invites: [], inviteCode: newId('i'), demo: true,
  });
  const p1 = P('App de turnos', 'alta', todayISO(3), ['demo-juan', 'demo-lucia']);
  const p2 = P('TP Base de Datos', 'alta', todayISO(2), ['demo-mateo', 'demo-sofia']);
  const p3 = P('Web inmobiliaria', 'media', todayISO(10), ['demo-juan', 'demo-lucia']);
  const p4 = P('Investigación de mercado', 'baja', null, ['demo-sofia']);
  state.projects.push(p1, p2, p3, p4);

  const t = (p, title, assignee, status, priority, deadline = null) =>
    state.tasks.push({ id: newId('t'), projectId: p.id, title, assignee, status, priority, deadline });
  t(p1, 'Pantalla de login', me, 'curso', 'alta', todayISO(1));
  t(p1, 'API de reservas', 'demo-juan', 'hecho', 'alta');
  t(p1, 'Integrar pagos', me, 'pendiente', 'alta', todayISO(3));
  t(p1, 'Diseño de la agenda', 'demo-lucia', 'hecho', 'media');
  t(p1, 'Notificaciones por mail', null, 'pendiente', 'baja');
  t(p2, 'Diagrama entidad-relación', 'demo-mateo', 'hecho', 'alta');
  t(p2, 'Consultas SQL del punto 3', 'demo-mateo', 'pendiente', 'alta', todayISO(1));
  t(p2, 'Informe final', 'demo-sofia', 'pendiente', 'media', todayISO(2));
  t(p3, 'Galería de propiedades', 'demo-juan', 'hecho', 'media');
  t(p3, 'Formulario de contacto', 'demo-juan', 'hecho', 'baja');
  t(p3, 'Mapa con ubicaciones', 'demo-lucia', 'curso', 'media', todayISO(7));
  t(p4, 'Encuesta a 20 usuarios', 'demo-sofia', 'curso', 'baja');

  addAlert(state, { to: 'todos', level: 'logro', message: 'Web inmobiliaria: galería y formulario terminados.', audience: p3.members, projectId: p3.id });
  addAlert(state, { to: 'todos', level: 'aviso', message: 'TP Base de Datos vence en 2 días y va atrasado.', audience: p2.members, projectId: p2.id });
  addAlert(state, { to: me, level: 'urgente', message: 'Tu pantalla de login vence mañana.', audience: [me], projectId: p1.id });
}
