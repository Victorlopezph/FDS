// Llamada directa a la API de Claude (sin dependencias extra).
export async function claude({ system, messages, maxTokens = 1500 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Falta ANTHROPIC_API_KEY en las variables de entorno de Vercel.');

  // La API pide que los turnos alternen: juntamos mensajes seguidos del mismo rol.
  const merged = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + m.content;
    else merged.push({ role: m.role, content: m.content });
  }
  while (merged.length && merged[0].role !== 'user') merged.shift();

  const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const r = await fetch(`${base}/v1/messages`, {
    signal: AbortSignal.timeout(55000),
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: maxTokens,
      system,
      messages: merged,
    }),
  }).catch((e) => {
    throw new Error(e.name === 'TimeoutError'
      ? 'Claude tardó demasiado en responder. Probá de nuevo.'
      : 'No se pudo conectar con Claude. Revisá la conexión.');
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'Error al llamar a Claude');
  return j.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}

export function parseJSON(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('La IA no devolvió JSON');
  return JSON.parse(text.slice(start, end + 1));
}

export function hoy() {
  const tz = 'America/Argentina/Buenos_Aires';
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const largo = new Date().toLocaleDateString('es-AR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${largo} (${iso})`;
}
