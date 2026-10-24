import { getSessionUser, googleEnabled, guestEnabled } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  return Response.json({ user: getSessionUser(req), google: googleEnabled(), guest: guestEnabled() });
}
