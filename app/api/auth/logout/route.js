import { cookie } from '@/lib/auth';

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json', 'Set-Cookie': cookie('ronda_session', '', 0) },
  });
}
