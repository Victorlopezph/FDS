// Habilidades que cada uno puede elegir en su perfil, con palabras que las delatan en una tarea.
export const SKILLS = [
  { id: 'Frontend', words: ['pantalla', 'interfaz', 'front', 'login', 'react', 'css', 'html', 'vista', 'boton', 'formulario'] },
  { id: 'Backend', words: ['api', 'back', 'servidor', 'endpoint', 'pagos', 'pago', 'integracion', 'autenticacion', 'logica'] },
  { id: 'Base de datos', words: ['sql', 'base de datos', 'tabla', 'consulta', 'consultas', 'modelo de datos', 'diagrama entidad'] },
  { id: 'Diseño UX/UI', words: ['diseño', 'diseno', 'diseñar', 'disenar', 'ux', 'ui', 'mockup', 'logo', 'figma', 'prototipo', 'agenda', 'colores'] },
  { id: 'Mobile', words: ['android', 'ios', 'celular', 'movil', 'apk'] },
  { id: 'Testing', words: ['test', 'testing', 'prueba', 'pruebas', 'probar', 'bug', 'error', 'qa'] },
  { id: 'DevOps', words: ['deploy', 'vercel', 'hosting', 'dominio', 'ci', 'docker', 'publicar'] },
  { id: 'IA y datos', words: ['ia', 'modelo', 'prompt', 'agente', 'datos', 'estadistica', 'dashboard'] },
  { id: 'Documentación', words: ['informe', 'documento', 'documentacion', 'docs', 'readme', 'manual'] },
  { id: 'Presentación', words: ['pitch', 'presentacion', 'slides', 'demo', 'exponer', 'oratoria'] },
  { id: 'Investigación', words: ['investigar', 'investigacion', 'encuesta', 'entrevista', 'analisis', 'usuarios'] },
  { id: 'Marketing', words: ['redes', 'marketing', 'instagram', 'campaña', 'publicidad', 'contenido'] },
  { id: 'Redacción', words: ['texto', 'textos', 'redactar', 'redaccion', 'copy', 'mail', 'notificaciones'] },
  { id: 'Mapas y geo', words: ['mapa', 'mapas', 'ubicacion', 'ubicaciones', 'geolocalizacion'] },
  // Herramientas y tecnologías concretas
  { id: 'React', words: ['react', 'componente', 'componentes', 'next'] },
  { id: 'HTML y CSS', words: ['html', 'css', 'estilos', 'maquetado', 'responsive'] },
  { id: 'JavaScript', words: ['javascript', 'js', 'script'] },
  { id: 'Node.js', words: ['node', 'express', 'api'] },
  { id: 'Python', words: ['python', 'script', 'django', 'flask'] },
  { id: 'Java', words: ['java', 'spring'] },
  { id: 'SQL', words: ['sql', 'consulta', 'consultas', 'query'] },
  { id: 'Figma', words: ['figma', 'mockup', 'prototipo', 'wireframe'] },
  { id: 'Git y GitHub', words: ['git', 'github', 'repo', 'repositorio', 'merge'] },
  { id: 'Excel', words: ['excel', 'planilla', 'tabla'] },
  { id: 'Canva', words: ['canva', 'flyer', 'placa', 'posteo'] },
  { id: 'Edición de video', words: ['video', 'reel', 'edicion', 'editar'] },
  { id: 'Fotografía', words: ['foto', 'fotos', 'fotografia', 'imagen', 'imagenes'] },
  { id: 'Organización', words: ['organizar', 'planificar', 'cronograma', 'reunion', 'coordinar'] },
];

// Roles del desplegable, con las habilidades que se le sugieren a cada uno.
export const ROLES = [
  { id: 'Frontend', skills: ['Frontend', 'React', 'HTML y CSS', 'JavaScript', 'Diseño UX/UI', 'Testing', 'Git y GitHub'] },
  { id: 'Backend', skills: ['Backend', 'Node.js', 'Python', 'Java', 'Base de datos', 'SQL', 'DevOps', 'Git y GitHub'] },
  { id: 'Full stack', skills: ['Frontend', 'Backend', 'React', 'Node.js', 'Base de datos', 'SQL', 'DevOps', 'Git y GitHub'] },
  { id: 'Base de datos', skills: ['Base de datos', 'SQL', 'Backend', 'Python', 'IA y datos', 'Excel'] },
  { id: 'Mobile', skills: ['Mobile', 'Frontend', 'React', 'JavaScript', 'Java', 'Testing'] },
  { id: 'Diseño UX/UI', skills: ['Diseño UX/UI', 'Figma', 'Canva', 'Investigación', 'Presentación', 'HTML y CSS'] },
  { id: 'Testing / QA', skills: ['Testing', 'Documentación', 'Frontend', 'Backend', 'Git y GitHub'] },
  { id: 'DevOps', skills: ['DevOps', 'Git y GitHub', 'Backend', 'Node.js', 'Python'] },
  { id: 'Datos e IA', skills: ['IA y datos', 'Python', 'SQL', 'Excel', 'Investigación', 'Base de datos'] },
  { id: 'Líder de proyecto', skills: ['Organización', 'Presentación', 'Documentación', 'Investigación', 'Redacción', 'Excel'] },
  { id: 'Documentación', skills: ['Documentación', 'Redacción', 'Presentación', 'Organización'] },
  { id: 'Marketing y contenido', skills: ['Marketing', 'Redacción', 'Canva', 'Edición de video', 'Fotografía', 'Presentación'] },
  { id: 'Investigación', skills: ['Investigación', 'Excel', 'Redacción', 'Presentación', 'IA y datos'] },
];

export const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// "Lun, Mié y Vie · 18 a 22 h"  (los días van del 0=Lun al 6=Dom)
export function scheduleText(av) {
  if (!av?.days?.length) return '';
  const d = [...av.days].sort((a, b) => a - b);
  let days;
  if (d.length === 7) days = 'Todos los días';
  else if (d.join() === '0,1,2,3,4') days = 'Lun a Vie';
  else if (d.join() === '5,6') days = 'Fines de semana';
  else if (d.length >= 3 && d[d.length - 1] - d[0] === d.length - 1) days = `${DAYS[d[0]]} a ${DAYS[d[d.length - 1]]}`;
  else {
    const names = d.map((i) => DAYS[i]);
    days = names.length > 1 ? names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1] : names[0];
  }
  return `${days}, ${av.from} a ${av.to} h`;
}

export function cleanAvailability(av) {
  if (!av || !Array.isArray(av.days)) return null;
  const days = [...new Set(av.days.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))];
  const from = Math.min(23, Math.max(0, parseInt(av.from, 10) || 0));
  const to = Math.min(24, Math.max(from + 1, parseInt(av.to, 10) || from + 1));
  return days.length ? { days, from, to } : null;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ¿Qué habilidades pide el título de una tarea?
export function skillsForText(text) {
  const t = ' ' + norm(text).replace(/[^a-z0-9ñ ]/g, ' ') + ' ';
  // Palabras cortas: exactas. Largas: también al principio de otra ("prueba" -> "pruebas").
  return SKILLS.filter((s) => s.words.some((w) => t.includes(' ' + norm(w) + ' ') || (w.length >= 4 && t.includes(' ' + norm(w)))))
    .map((s) => s.id);
}

// Sugerencia de responsable: más habilidades que coinciden, después menos tareas abiertas.
export function suggestAssignee(title, people, tasks) {
  const wanted = skillsForText(title);
  const t = norm(title);
  const scored = people.map((m) => {
    const skills = m.skills || [];
    // Coincide si la habilidad está en la lista, o si una habilidad propia (personalizada) aparece en el título
    const match = skills.filter((s) => wanted.includes(s) || (s.length > 2 && t.includes(norm(s))));
    const open = tasks.filter((x) => x.assignee === m.id && x.status !== 'hecho').length;
    return { member: m, match, open };
  });
  const best = scored.filter((x) => x.match.length).sort((a, b) => b.match.length - a.match.length || a.open - b.open)[0];
  return best || null;
}

export function cleanSkills(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    const c = String(s || '').trim().slice(0, 25);
    if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c);
  }
  return out.slice(0, 12);
}
