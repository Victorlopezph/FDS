// "Modo sin IA": agente por reglas para cuando no hay clave de IA configurada.
// Entiende frases típicas ("terminé X", "me trabé con Y", "hay que hacer Z", "el viernes no puedo")
// y devuelve el mismo formato que la IA, así el resto de la app no cambia.
import { suggestAssignee } from './skills';
import { todayISO } from './seed';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOP = new Set(['para', 'con', 'que', 'los', 'las', 'del', 'una', 'uno', 'por', 'como', 'esta', 'este', 'esto', 'pero', 'todo', 'toda', 'hacer', 'tarea', 'parte', 'cosa', 'tema', 'ahora', 'tambien', 'despues', 'antes', 'hoy', 'manana', 'semana', 'ya']);
const stems = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5));

const DONE = /(termin|listo|lista|hice|complet|ya esta|cerre|subi |entregu|resolv|arregl)/;
const BLOCK = /(trab|bloque|problema|no (me )?(sale|funciona|anda|carga)|error|no puedo con|no se como|atasc)/;
const PROGRESS = /(empece|arranque|estoy (con|haciendo)|sigo con|trabajando en|avanzando|empezando)/;
const ABSENT = /(no (puedo|voy a|podre) (venir|ir|estar|trabajar|conectarme)|no vengo|falto|no estoy disponible)/;
const NEWTASK = /(hay que|falta(?:ria)? |tenemos que|habria que|hace falta|necesitamos|agreg(a|uen) (una )?tarea)/;

const DAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

function dateFrom(text) {
  const t = norm(text);
  if (/pasado manana/.test(t)) return todayISO(2);
  if (/manana/.test(t)) return todayISO(1);
  if (/\bhoy\b/.test(t)) return todayISO(0);
  const today = new Date(todayISO(0) + 'T12:00:00-03:00').getDay();
  for (let i = 0; i < 7; i++) {
    if (t.includes(DAYS[i])) return todayISO(((i - today + 7) % 7) || 7);
  }
  return null;
}

function bestTask(clause, tasks) {
  const words = stems(clause);
  let best = null;
  for (const t of tasks) {
    const score = stems(t.title).filter((w) => words.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { task: t, score };
  }
  return best?.task || null;
}

function cleanTitle(s) {
  const t = s.replace(/^(que |hacer |armar )?(la |el |los |las |un |una )?/i, '').replace(/\s+(para|antes de)\s+(el|la)?\s*(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|hoy).*$/i, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1, 90) : '';
}

// Responsable sugerido: habilidades primero, después el que tiene menos tareas abiertas.
function pickAssignee(title, people, tasks, exclude) {
  const pool = people.filter((m) => m.id !== exclude);
  const s = suggestAssignee(title, pool, tasks);
  if (s) return { member: s.member, why: `sabe ${s.match.join(' y ')}` };
  const open = (m) => tasks.filter((t) => t.assignee === m.id && t.status !== 'hecho').length;
  const m = [...pool].sort((a, b) => open(a) - open(b))[0];
  const n = m ? open(m) : 0;
  return m ? { member: m, why: n === 0 ? 'no tiene tareas abiertas' : `es quien menos tareas tiene (${n})` } : null;
}

export function offlineAnalyze(view, text, me) {
  const project = view.projects[0];
  const people = view.members;
  const tasks = view.tasks;
  const autor = people.find((m) => m.id === me);
  const name = autor?.name || 'Alguien';
  const out = { nuevosProyectos: [], nuevasTareas: [], cambios: [], alertas: [] };
  const notes = [];
  const touched = new Set();

  const clauses = String(text).split(/[.;!?\n,]+|\s+y\s+(?=(?:me |ya |hay |el |la |los |las |ma[nñ]ana |hoy |no |empec|termin|arranq))|\s+pero\s+|\s+tambi[eé]n\s+/i)
    .map((c) => c.trim()).filter(Boolean);

  for (const clause of clauses) {
    const c = norm(clause);

    if (ABSENT.test(c)) {
      const when = (c.match(/(el |este )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo|manana|hoy)/) || [])[0] || 'unos días';
      out.alertas.push({ to: 'todos', level: 'aviso', message: `${name} avisó que ${when.trim()} no puede estar.` });
      const doneNow = new Set(out.cambios.filter((x) => x.status === 'hecho').map((x) => x.taskId));
      const urgent = tasks.filter((t) => t.assignee === me && t.status !== 'hecho' && !doneNow.has(t.id) && t.priority === 'alta');
      for (const t of urgent) {
        const pick = pickAssignee(t.title, people, tasks, me);
        if (pick) notes.push(`Sugerencia: pasarle "${t.title}" a ${pick.member.name} (${pick.why}).`);
      }
      notes.push(`Avisé al equipo que ${when.trim()} no estás.`);
      continue;
    }

    if (NEWTASK.test(c)) {
      const raw = clause.split(/hay que|falta(?:r[ií]a)? |tenemos que|habr[ií]a que|hace falta|necesitamos|agreg(?:a|uen) (?:una )?tarea/i).pop();
      const title = cleanTitle(raw || '');
      if (title.length > 2) {
        const pick = pickAssignee(title, people, tasks, null);
        const deadline = dateFrom(clause);
        out.nuevasTareas.push({ projectId: project.id, title, assignee: pick?.member.id || null, status: 'pendiente', priority: deadline ? 'alta' : 'media', deadline });
        notes.push(`Creé la tarea "${title}"${pick ? ` y se la di a ${pick.member.name} porque ${pick.why}` : ''}.`);
        continue;
      }
    }

    const task = bestTask(clause, tasks.filter((t) => !touched.has(t.id)));
    if (!task) continue;
    let status = null;
    if (BLOCK.test(c)) status = 'trabado';
    else if (DONE.test(c)) status = 'hecho';
    else if (PROGRESS.test(c)) status = 'curso';
    if (!status || status === task.status) continue;
    touched.add(task.id);
    out.cambios.push({ taskId: task.id, status });
    if (status === 'hecho') notes.push(`"${task.title}" pasó a Hecho.`);
    if (status === 'curso') notes.push(`"${task.title}" pasó a En curso.`);
    if (status === 'trabado') {
      notes.push(`"${task.title}" quedó Trabada.`);
      out.alertas.push({ to: 'todos', level: 'urgente', message: `${name} se trabó con "${task.title}". ¿Alguien puede ayudar?` });
    }
  }

  out.resumen = notes.length
    ? notes.join(' ')
    : 'No encontré tareas para actualizar. Probá nombrando la tarea, por ejemplo: "terminé el login" o "hay que hacer el logo".';
  return out;
}

export function offlineChat(view, question, me) {
  const p = view.projects[0];
  const tasks = view.tasks;
  const people = view.members;
  const q = norm(question);
  const nameOf = (id) => people.find((m) => m.id === id)?.name || 'sin asignar';
  const open = tasks.filter((t) => t.status !== 'hecho');
  const blocked = tasks.filter((t) => t.status === 'trabado');

  // ¿Qué tiene / qué hizo una persona?
  const person = people.find((m) => q.includes(norm(m.name)));
  if (person && !/(a quien|quien puede|pasar|pasarle|asign)/.test(q)) {
    const mine = tasks.filter((t) => t.assignee === person.id);
    if (!mine.length) return `${person.name} no tiene tareas en ${p.name}.`;
    return `${person.name} tiene:\n` + mine.map((t) => `• ${t.title} (${t.status === 'curso' ? 'en curso' : t.status})`).join('\n');
  }

  // ¿A quién le paso X?
  if (/(a quien|quien puede|quien deberia|pasar|pasarle|asign|reasign)/.test(q)) {
    const task = bestTask(question, tasks);
    const title = task?.title || question;
    const pick = pickAssignee(title, people, tasks, task?.assignee);
    if (!pick) return 'No hay otra persona en el proyecto para asignarle. Invitá a alguien desde Integrantes.';
    return `Le daría ${task ? `"${task.title}"` : 'eso'} a ${pick.member.name}: ${pick.why}${pick.member.schedule ? ` y trabaja ${pick.member.schedule}` : ''}.`;
  }

  // Estado general
  const fecha = p.deadline ? p.deadline.split('-').reverse().slice(0, 2).join('/') : null;
  const lines = [`${p.name} va al ${p.progress}%${fecha ? ` (vence el ${fecha})` : ' (sin fecha límite)'}.`];
  if (blocked.length) lines.push(`Trabadas: ${blocked.map((t) => `${t.title} (${nameOf(t.assignee)})`).join(', ')}.`);
  if (open.length) lines.push(`Faltan ${open.length}: ${open.slice(0, 5).map((t) => t.title).join(', ')}${open.length > 5 ? '…' : ''}.`);
  else lines.push('¡No queda nada pendiente!');
  const load = people.map((m) => [m.name, open.filter((t) => t.assignee === m.id).length]).sort((a, b) => b[1] - a[1]);
  if (load[0]?.[1] > 0) lines.push(`Más cargado: ${load[0][0]} (${load[0][1]} ${load[0][1] === 1 ? 'tarea' : 'tareas'}).`);
  return lines.join('\n');
}
