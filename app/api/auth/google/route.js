import { googleEnabled, originOf, randomToken, cookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Paso 1: mandar al usuario a la pantalla de Google.
export async function GET(req) {
  const origin = originOf(req);
  if (!googleEnabled()) return Response.redirect(`${origin}/?error=google_off`, 302);
  const state = randomToken();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + params,
      'Set-Cookie': cookie('ronda_oauth', state, 600),
    },
  });
}
