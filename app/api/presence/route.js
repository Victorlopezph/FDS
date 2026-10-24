import { touchPresence } from '@/lib/store';
import { getSessionUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Cada celular avisa "estoy conectado" cada 25 segundos.
export async function POST(req) {
  const user = getSessionUser(req);
  if (!user) return unauthorized();
  await touchPresence(user.id);
  return Response.json({ ok: true });
}
