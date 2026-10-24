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
];

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
