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

