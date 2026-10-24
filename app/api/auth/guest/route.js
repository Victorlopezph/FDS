import { authConfigurationReady, guestEnabled, cookie, makeSession, randomToken } from '@/lib/auth';
import { mutateState, StorageUnavailableError } from '@/lib/store';
import { upsertUser } from '@/lib/logic';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!guestEnabled()) return Response.json({ error: 'El modo invitado está desactivado.' }, { status: 403 });
  if (!authConfigurationReady()) return Response.json({ error: 'La autenticación no está configurada correctamente en el servidor.' }, { status: 503 });

  let body;
  try { body = await req.json(); } catch {
    return Response.json({ error: 'El cuerpo de la solicitud no es válido.' }, { status: 400 });
  }
  const clean = String(body?.name || '').trim().slice(0, 30);
  if (!clean) return Response.json({ error: 'Escribí tu nombre.' }, { status: 400 });

  const user = { id: 'guest_' + randomToken(16), email: null, name: clean, picture: null };
  try {
    await mutateState((state) => upsertUser(state, user));
    const session = makeSession(user);
    return new Response(JSON.stringify({ user }), {
      headers: { 'content-type': 'application/json', 'Set-Cookie': cookie('ronda_session', session, 30 * 86400) },
    });
  } catch (error) {
    const status = error instanceof StorageUnavailableError ? 503 : 500;
    return Response.json({ error: status === 503 ? 'El almacenamiento durable no está disponible.' : 'No se pudo iniciar la sesión.' }, { status });
  }
}
