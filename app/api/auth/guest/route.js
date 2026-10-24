import { cookie, makeSession, randomToken } from '@/lib/auth';
import { getState, saveState } from '@/lib/store';
import { upsertUser } from '@/lib/logic';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { name } = await req.json();
  const clean = String(name || '').trim().slice(0, 30);
  if (!clean) return Response.json({ error: 'Escribí tu nombre.' }, { status: 400 });

  const user = { id: 'guest_' + randomToken(6), email: null, name: clean, picture: null };
  const s = await getState();
  upsertUser(s, user);
  await saveState(s);

  return new Response(JSON.stringify({ user }), {
    headers: { 'content-type': 'application/json', 'Set-Cookie': cookie('ronda_session', makeSession(user), 30 * 86400) },
  });
}
