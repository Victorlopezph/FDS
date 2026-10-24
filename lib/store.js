// Guarda el estado en Upstash Redis (Vercel Marketplace). Sin Redis, usa memoria (solo para probar local).

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = globalThis.__ronda || (globalThis.__ronda = {});

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

export async function get(key) {
  if (!URL_) return mem[key] ?? null;
  const v = await redis(['GET', key]);
  return v ? JSON.parse(v) : null;
}

export async function set(key, val) {
  if (!URL_) { mem[key] = val; return; }
  await redis(['SET', key, JSON.stringify(val)]);
}

const KEY = 'ronda:v2';
const EMPTY = () => ({ members: [], projects: [], tasks: [], alerts: [] });

export async function getState() {
  return (await get(KEY)) || EMPTY();
}

export const saveState = (s) => set(KEY, s);
export const storageMode = URL_ ? 'redis' : 'memoria';

// Optimistic compare-and-set prevents concurrent analyses from overwriting one another.
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then current = '' end
if current == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
end
return 0
`;

export async function mutateState(mutator, maxAttempts = 8) {
  if (!URL_) {
    const previous = mem.mutationQueue || Promise.resolve();
    let release;
    const queued = new Promise((resolve) => { release = resolve; });
    mem.mutationQueue = queued;
    await previous;
    try {
      const state = await getState();
      const result = await mutator(state);
      await saveState(state);
      return { state, result };
    } finally {
      release();
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const raw = await redis(['GET', KEY]);
    const state = raw ? JSON.parse(raw) : EMPTY();
    const result = await mutator(state);
    const swapped = await redis(['EVAL', CAS_SCRIPT, '1', KEY, raw || '', JSON.stringify(state)]);
    if (Number(swapped) === 1) return { state, result };
  }
  throw new Error('El estado cambió varias veces mientras se guardaba. Probá de nuevo.');
}

const RATE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
return count
`;

export async function consumeRateLimit(key, limit, windowMs) {
  if (!URL_) {
    mem.rateLimits ||= new Map();
    const now = Date.now();
    const previous = mem.rateLimits.get(key);
    const entry = !previous || now >= previous.resetAt
      ? { count: 0, resetAt: now + windowMs }
      : previous;
    entry.count += 1;
    mem.rateLimits.set(key, entry);
    return { allowed: entry.count <= limit, retryAfterMs: Math.max(0, entry.resetAt - now) };
  }
  const count = Number(await redis(['EVAL', RATE_SCRIPT, '1', `ronda:limit:${key}`, String(limit), String(windowMs)]));
  return { allowed: count <= limit, retryAfterMs: windowMs };
}

// Conexión: un hash de Redis, así dos celulares no se pisan al avisar a la vez.
export async function touchPresence(me) {
  if (!URL_) { (mem.presence ||= {})[me] = Date.now(); return; }
  await redis(['HSET', 'ronda:presence', me, String(Date.now())]);
}

export async function getPresence() {
  if (!URL_) return mem.presence || {};
  const flat = (await redis(['HGETALL', 'ronda:presence'])) || [];
  const out = {};
  for (let i = 0; i < flat.length; i += 2) out[flat[i]] = Number(flat[i + 1]);
  return out;
}
