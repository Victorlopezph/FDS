// Sesiones con cookie firmada (HMAC). Sin librerías externas.
import { createHmac, createHash, timingSafeEqual, randomBytes } from 'crypto';

const SECRET = process.env.AUTH_SECRET
  || createHash('sha256').update('ronda:' + (process.env.GOOGLE_CLIENT_SECRET || process.env.ANTHROPIC_API_KEY || 'dev')).digest('hex');

export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
// Modo invitado: activo si Google no está configurado, si ALLOW_GUEST=true, o en desarrollo
// (la vista previa de v0 corre en un iframe donde Google no permite iniciar sesión).
export const guestEnabled = () =>
  !googleEnabled() || process.env.ALLOW_GUEST === 'true' || process.env.NODE_ENV !== 'production';

const sign = (v) => createHmac('sha256', SECRET).update(v).digest('base64url');
export const randomToken = (n = 16) => randomBytes(n).toString('base64url');
export const userIdFromEmail = (email) => 'u_' + createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12);

export function makeSession(user) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 30 * 86400000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readCookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export function getSessionUser(req) {
  const raw = readCookie(req, 'ronda_session');
  if (!raw) return null;
  const [p, s] = raw.split('.');
  if (!p || !s) return null;
  const good = sign(p);
  if (s.length !== good.length || !timingSafeEqual(Buffer.from(s), Buffer.from(good))) return null;
  try {
    const u = JSON.parse(Buffer.from(p, 'base64url').toString());
    return u.exp > Date.now() ? u : null;
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
