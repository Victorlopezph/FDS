// Llamada a Claude. Usa, en este orden:
// 1. ANTHROPIC_API_KEY (clave propia de Anthropic)
// 2. AI Gateway de Vercel (AI_GATEWAY_API_KEY, o USE_AI_GATEWAY=true para usar el token OIDC del proyecto)
// Si no hay ninguna, aiConfigured() da false y la app usa el "modo sin IA" (lib/offline.js).
export function aiConfigured() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.USE_AI_GATEWAY === 'true');
}

export async function claude({ system, messages, maxTokens = 1500, req }) {
  let url, headers, model;
  if (process.env.ANTHROPIC_API_KEY) {
    url = `${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`;
    headers = { 'x-api-key': process.env.ANTHROPIC_API_KEY };
    model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  } else {
    const token = process.env.AI_GATEWAY_API_KEY || req?.headers.get('x-vercel-oidc-token') || process.env.VERCEL_OIDC_TOKEN;
    if (!token) throw new Error('No hay IA configurada.');
    url = 'https://ai-gateway.vercel.sh/v1/messages';
    headers = { Authorization: `Bearer ${token}` };
    model = process.env.AI_GATEWAY_MODEL || 'anthropic/claude-sonnet-5.5';
  }

  // La API pide que los turnos alternen: juntamos mensajes seguidos del mismo rol.
  const merged = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + m.content;
    else merged.push({ role: m.role, content: m.content });
  }
  while (merged.length && merged[0].role !== 'user') merged.shift();

  const r = await fetch(url, {
    signal: AbortSignal.timeout(55000),
    method: 'POST',
    headers: { ...headers, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: merged }),
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
