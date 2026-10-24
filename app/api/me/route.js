import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  return Response.json({ user: getSessionUser(req) });
}
