import { authConfigurationReady, originOf, readCookie, cookie, makeSession, userIdFromEmail } from '@/lib/auth';
import { mutateState } from '@/lib/store';
import { upsertUser, joinByEmail } from '@/lib/logic';

export const dynamic = 'force-dynamic';

// Paso 2: Google vuelve acá con un código. Lo cambiamos por los datos del usuario.
export async function GET(req) {
  const origin = originOf(req);
  const fail = (why) => Response.redirect(`${origin}/?error=${why}`, 302);
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!authConfigurationReady()) return fail('auth_config');
  if (!code || !state || state !== readCookie(req, 'ronda_oauth')) return fail('login');

  try {
    const token = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${origin}/api/auth/callback`,
        grant_type: 'authorization_code',
      }),
    }).then((r) => r.json());
    if (!token.access_token) return fail('google_token');

    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    }).then((r) => r.json());
    if (!info.email || info.email_verified === false) return fail('google_email');

    const email = info.email.toLowerCase();
    const user = { id: userIdFromEmail(email), email, name: info.given_name || info.name || email.split('@')[0], picture: info.picture || null };

    await mutateState((current) => {
      upsertUser(current, user);
      joinByEmail(current, user);
    });

    const headers = new Headers({ Location: `${origin}/` });
    headers.append('Set-Cookie', cookie('ronda_session', makeSession(user), 30 * 86400));
    headers.append('Set-Cookie', cookie('ronda_oauth', '', 0));
    return new Response(null, { status: 302, headers });
  } catch {
    return fail('login');
  }
}
