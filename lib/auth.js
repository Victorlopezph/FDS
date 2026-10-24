// Sesiones firmadas con HMAC. En desarrollo, la clave efímera nunca es durable.
import { createHmac, createHash, timingSafeEqual, randomBytes } from 'crypto';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_SECRET_BYTES = 32;

function signingSecret() {
  const configured = process.env.AUTH_SECRET;
  if (configured) {
    const bytes = Buffer.from(configured, 'utf8');
    const reusedProviderSecret = [process.env.GOOGLE_CLIENT_SECRET, process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY]
      .some((providerSecret) => providerSecret && configured === providerSecret);
    if (bytes.length < MIN_SECRET_BYTES || reusedProviderSecret) {
      throw new Error('AUTH_SECRET debe ser independiente y tener al menos 32 bytes.');
    }
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET es obligatorio en producción.');
  }
  globalThis.__teamLabDevAuthSecret ||= randomBytes(32).toString('base64url');
  return globalThis.__teamLabDevAuthSecret;
}

export function authConfigurationReady() {
  try { signingSecret(); return true; } catch { return false; }
}

export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const guestEnabled = () => process.env.ALLOW_GUEST !== 'false';

const sign = (value) => createHmac('sha256', signingSecret()).update(value).digest('base64url');
export const randomToken = (bytes = 16) => randomBytes(bytes).toString('base64url');
export const userIdFromEmail = (email) => 'u_' + createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12);

function validSessionUser(user) {
  return user && typeof user.id === 'string' && /^[\w-]{1,80}$/.test(user.id)
    && typeof user.name === 'string' && user.name.trim().length > 0 && user.name.length <= 100
    && (user.email === null || (typeof user.email === 'string' && user.email.length <= 254))
    && (user.picture === null || (typeof user.picture === 'string' && user.picture.length <= 2048));
}

export function makeSession(user) {
  if (!validSessionUser(user)) throw new Error('No se puede crear una sesión con datos inválidos.');
  const now = Date.now();
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    email: user.email || null,
    name: user.name.trim(),
    picture: user.picture || null,
    iat: now,
    exp: now + SESSION_TTL_MS,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readCookie(req, name) {
  const prefix = `${name}=`;
  const part = (req.headers.get('cookie') || '').split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix));
  if (!part) return null;
  try { return decodeURIComponent(part.slice(prefix.length)); } catch { return null; }
}

export function getSessionUser(req) {
  const raw = readCookie(req, 'ronda_session');
  if (!raw || raw.length > 4096) return null;
  const separator = raw.indexOf('.');
  if (separator <= 0 || separator !== raw.lastIndexOf('.')) return null;
  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  let expected;
  try { expected = sign(payload); } catch { return null; }
  const suppliedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Date.now();
    if (!validSessionUser(session) || !Number.isSafeInteger(session.iat) || !Number.isSafeInteger(session.exp)) return null;
    if (session.iat > now + 60_000 || session.exp <= now || session.exp - session.iat > SESSION_TTL_MS) return null;
    return { id: session.id, email: session.email, name: session.name, picture: session.picture };
  } catch { return null; }
}

export function cookie(name, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function originOf(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export const unauthorized = () => Response.json({ error: 'Tenés que iniciar sesión.' }, { status: 401 });
export const authUnavailable = () => Response.json({ error: 'La autenticación no está configurada correctamente en el servidor.' }, { status: 503 });
