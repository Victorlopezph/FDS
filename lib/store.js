// Upstash REST persistence. Memory mode is intentionally limited to local development.
import { createHash, randomBytes } from 'crypto';

const mem = globalThis.__teamLabStore || (globalThis.__teamLabStore = {});
const EMPTY = () => ({ members: [], projects: [], tasks: [], alerts: [] });
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then current = '' end
if current == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
end
return 0
`;
const RATE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count
`;
const RESERVE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then
  redis.call('SET', KEYS[1], 'processing:' .. ARGV[1], 'PX', ARGV[2])
  return 'acquired'
end
if string.sub(current, 1, 7) == 'failed:' then return 'failed' end
return current
`;
const COMPLETE_SCRIPT = `
if redis.call('GET', KEYS[1]) == 'processing:' .. ARGV[1] then
  redis.call('SET', KEYS[1], 'completed:' .. ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0
`;
const FAIL_SCRIPT = `
if redis.call('GET', KEYS[1]) == 'processing:' .. ARGV[1] then
  redis.call('SET', KEYS[1], 'failed:' .. ARGV[1], 'PX', ARGV[2])
  return 1
end
return 0
`;

export class StorageUnavailableError extends Error {
  constructor() {
    super('Durable storage is unavailable or misconfigured.');
    this.name = 'StorageUnavailableError';
  }
}

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  if (url || token || process.env.NODE_ENV === 'production') throw new StorageUnavailableError();
  return null;
}

function currentMode() {
  try { return redisConfig() ? 'redis' : 'memoria'; } catch { return 'no disponible'; }
}

export const storageMode = currentMode();

function safeInteger(value, label) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number)) throw new Error(`Respuesta inválida de Redis (${label}).`);
  return number;
}

async function redis(command) {
  const config = redisConfig();
  if (!config) throw new StorageUnavailableError();
  let response;
  try {
    response = await fetch(config.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error('No se pudo conectar con el almacenamiento compartido.');
  }
  if (!response.ok) throw new Error(`El almacenamiento compartido respondió ${response.status}.`);
  let payload;
  try { payload = await response.json(); } catch {
    throw new Error('El almacenamiento compartido devolvió una respuesta inválida.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.error) {
    throw new Error('El almacenamiento compartido rechazó la operación.');
  }
  if (!Object.hasOwn(payload, 'result')) throw new Error('El almacenamiento compartido devolvió una respuesta incompleta.');
  return payload.result;
}

function decodeStoredState(value) {
  if (value === null || value === undefined) return EMPTY();
  if (typeof value !== 'string') throw new Error('El estado persistido tiene un formato inválido.');
  try {
    const state = JSON.parse(value);
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error();
    return state;
  } catch {
    throw new Error('El estado persistido no se pudo leer.');
  }
}

export async function get(key) {
  const config = redisConfig();
  if (!config) return mem[key] == null ? null : structuredClone(mem[key]);
  const value = await redis(['GET', key]);
  if (value !== null && typeof value !== 'string') throw new Error('Redis devolvió un valor con formato inválido.');
  if (value === null) return null;
  try { return JSON.parse(value); } catch { throw new Error('El valor persistido no se pudo leer.'); }
}

export async function set(key, value) {
  const config = redisConfig();
  if (!config) { mem[key] = structuredClone(value); return;
  const result = await redis(['SET', key, JSON.stringify(value)]);
  if (result !== 'OK') throw new Error('Redis no confirmó el guardado.');
}

const KEY = 'ronda:v2';

export async function getState() {
  const raw = await get(KEY);
  return raw || EMPTY();
}

export async function saveState(nextState) {
  if (!nextState || typeof nextState !== 'object' || Array.isArray(nextState)) throw new TypeError('El estado debe ser un objeto.');
  return mutateState((current) => {
    for (const key of Object.keys(current)) delete current[key];
    Object.assign(current, nextState);
  });
}

export async function mutateState(mutator, maxAttempts = 8) {
  if (typeof mutator !== 'function' || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new TypeError('La mutación o el límite de reintentos no es válido.');
  }
  const config = redisConfig();
  if (!config) {
    const previous = mem.mutationQueue || Promise.resolve();
    let release;
    const queued = new Promise((resolve) => { release = resolve; });
    mem.mutationQueue = queued;
    await previous;
    try {
      const state = await getState();
      const result = await mutator(state);
      await set(KEY, state);
      return { state, result };
    } finally {
      release();
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const raw = await redis(['GET', KEY]);
    if (raw !== null && typeof raw !== 'string') throw new Error('Redis devolvió el estado con formato inválido.');
    const state = decodeStoredState(raw);
    const result = await mutator(state);
    const swapped = safeInteger(await redis(['EVAL', CAS_SCRIPT, '1', KEY, raw || '', JSON.stringify(state)]), 'CAS');
    if (swapped === 1) return { state, result };
    if (swapped !== 0) throw new Error('Redis devolvió un resultado CAS inesperado.');
    await new Promise((resolve) => setTimeout(resolve, Math.min(8 * (attempt + 1), 40)));
  }
  throw new Error('No se pudo guardar: el estado cambió repetidamente. Probá de nuevo.');
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function idempotencyRedisKey(key) {
  return `team-lab:analysis:${digest(key)}`;
}

function parseReservation(value) {
  if (typeof value !== 'string') throw new Error('Redis devolvió una reserva con formato inválido.');
  if (value === 'acquired') return { status: 'acquired' };
  if (value === 'failed') return { status: 'failed' };
  if (value.startsWith('completed:')) return { status: 'completed', analysisId: value.slice('completed:'.length) };
  if (value.startsWith('processing:')) return { status: 'processing' };
  throw new Error('Redis devolvió un estado de reserva desconocido.');
}

export async function reserveAnalysis(key, { leaseMs = 120_000 } = {}) {
  if (!Number.isInteger(leaseMs) || leaseMs < 10 || leaseMs > 10 * 60_000) throw new TypeError('El vencimiento de la reserva no es válido.');
  const redisKey = idempotencyRedisKey(key);
  const owner = randomBytes(18).toString('base64url');
  const config = redisConfig();
  if (!config) {
    mem.idempotency ||= new Map();
    const existing = mem.idempotency.get(redisKey);
    if (existing && existing.expiresAt > Date.now()) {
      if (existing.status === 'completed') return { status: 'completed', analysisId: existing.analysisId };
      if (existing.status === 'failed') return { status: 'failed' };
      return { status: 'processing' };
    }
    mem.idempotency.set(redisKey, { status: 'processing', owner, expiresAt: Date.now() + leaseMs });
    return { status: 'acquired', owner };
  }
  const result = await redis(['EVAL', RESERVE_SCRIPT, '1', redisKey, owner, String(leaseMs)]);
  if (result !== 'acquired' && typeof result !== 'string') throw new Error('Redis devolvió una reserva con formato inválido.');
  if (result === 'acquired') return { status: 'acquired', owner };
  return parseReservation(result);
}

export async function completeAnalysis(key, owner, analysisId, ttlSeconds = 86_400) {
  if (!/^[\w-]{1,100}$/.test(owner) || !/^[\w-]{1,100}$/.test(analysisId) || !Number.isInteger(ttlSeconds) || ttlSeconds < 60) {
    throw new TypeError('Los datos para completar la reserva no son válidos.');
  }
  const redisKey = idempotencyRedisKey(key);
  if (!redisConfig()) {
    const entry = mem.idempotency?.get(redisKey);
    if (!entry || entry.status !== 'processing' || entry.owner !== owner || entry.expiresAt <= Date.now()) return false;
    mem.idempotency.set(redisKey, { status: 'completed', analysisId, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }
  return safeInteger(await redis(['EVAL', COMPLETE_SCRIPT, '1', redisKey, owner, analysisId, String(ttlSeconds)]), 'completar reserva') === 1;
}

export async function failAnalysis(key, owner, retryDelayMs = 5_000) {
  if (!/^[\w-]{1,100}$/.test(owner) || !Number.isInteger(retryDelayMs) || retryDelayMs < 1_000 || retryDelayMs > 60_000) {
    throw new TypeError('Los datos para liberar la reserva no son válidos.');
  }
  const redisKey = idempotencyRedisKey(key);
  if (!redisConfig()) {
    const entry = mem.idempotency?.get(redisKey);
    if (!entry || entry.status !== 'processing' || entry.owner !== owner) return false;
    mem.idempotency.set(redisKey, { status: 'failed', expiresAt: Date.now() + retryDelayMs });
    return true;
  }
  return safeInteger(await redis(['EVAL', FAIL_SCRIPT, '1', redisKey, owner, String(retryDelayMs)]), 'liberar reserva') === 1;
}

export async function consumeRateLimit(key, limit, windowMs) {
  if (typeof key !== 'string' || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1_000) {
    throw new TypeError('Los parámetros del límite de solicitudes no son válidos.');
  }
  const config = redisConfig();
  if (!config) {
    mem.rateLimits ||= new Map();
    const now = Date.now();
    const hashedKey = digest(key);
    const previous = mem.rateLimits.get(hashedKey);
    const entry = !previous || now >= previous.resetAt ? { count: 0, resetAt: now + windowMs } : previous;
    entry.count += 1;
    mem.rateLimits.set(hashedKey, entry);
    return { allowed: entry.count <= limit, retryAfterMs: Math.max(0, entry.resetAt - now) };
  }
  const keyHash = digest(key);
  const count = safeInteger(await redis(['EVAL', RATE_SCRIPT, '1', `team-lab:limit:${keyHash}`, String(windowMs)]), 'limitador');
  if (count < 1) throw new Error('Redis devolvió un conteo de límite inválido.');
  return { allowed: count <= limit, retryAfterMs: windowMs };
}

export async function touchPresence(userId) {
  if (typeof userId !== 'string' || !userId) throw new TypeError('El usuario de presencia no es válido.');
  if (!redisConfig()) { (mem.presence ||= {})[userId] = Date.now(); return; }
  const result = await redis(['HSET', 'team-lab:presence', userId, String(Date.now())]);
  safeInteger(result, 'presencia');
}

export async function getPresence() {
  if (!redisConfig()) return mem.presence || {};
  const flat = await redis(['HGETALL', 'team-lab:presence']);
  if (!Array.isArray(flat) || flat.length % 2 !== 0 || flat.some((value) => typeof value !== 'string')) {
    throw new Error('Redis devolvió la presencia con formato inválido.');
  }
  const out = {};
  for (let index = 0; index < flat.length; index += 2) {
    const timestamp = Number(flat[index + 1]);
    if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error('Redis devolvió una marca de presencia inválida.');
    out[flat[index]] = timestamp;
  }
  return out;
}
