import { getState, mutateState } from '@/lib/store';
import { contextFor, viewFor, projectView, addChat } from '@/lib/logic';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { claude, hoy, aiConfigured } from '@/lib/claude';
import { offlineChat } from '@/lib/offline';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Chat del proyecto: la conversación queda guardada y la ven todos los integrantes.
export async function POST(req) {
  const user = getSessionUser(req);
  if (!user) return unauthorized();
  const me = user.id;
  try {
    const { text, projectId } = await req.json();
    const content = String(text || '').trim().slice(0, 4000);
    if (!content) return Response.json({ error: 'Escribí algo primero.' }, { status: 400 });

    const state0 = await getState();
    const pv = projectView(state0, me, projectId);
    if (!pv) return Response.json({ error: 'No tenés acceso a ese proyecto.' }, { status: 403 });
    const nameOf = (id) => pv.members.find((m) => m.id === id)?.name || 'Alguien';
    const yo = pv.members.find((m) => m.id === me);

    const system = `Sos Team lab, el asistente del proyecto "${pv.projects[0].name}". Hoy es ${hoy()}.
Estás en el chat grupal de este proyecto: cada mensaje de usuario empieza con el nombre de quien escribe.
Ahora te habla ${yo ? `${yo.name}${yo.role ? ` (${yo.role})` : ''}` : 'un integrante'}.
Respondé en español rioplatense, breve y concreto (como mensaje de chat en el celular, máximo 5 oraciones o una lista corta).
Basate SOLO en este proyecto; si algo no está, decilo. Usá nombres, no ids.
Cuando sugieras a quién darle algo, priorizá habilidades, después horario y después menos tareasAbiertas, y decí por qué.

Proyecto y equipo:
${contextFor(pv)}`;

    const history = (state0.chats?.[projectId] || []).slice(-12).map((m) => ({
      role: m.role,
      content: m.role === 'user' ? `${nameOf(m.authorId)}: ${m.content}` : m.content,
    }));
    let reply = null, mode = 'ia';
    if (aiConfigured()) {
      try {
        reply = await claude({
          req,
          system,
          maxTokens: 700,
          messages: [...history, { role: 'user', content: `${nameOf(me)}: ${content}` }],
        });
      } catch (e) {
        console.error('[team-lab-chat-provider]', e?.name || 'Error');
      }
    }
    if (!reply) { reply = offlineChat(pv, content, me); mode = 'local'; }

    const { state, result } = await mutateState((current) => {
      if (!projectView(current, me, projectId)) return { error: true };
      addChat(current, projectId, { role: 'user', authorId: me, content });
      addChat(current, projectId, { role: 'assistant', content: reply, mode });
      return null;
    });
    if (result?.error) return Response.json({ error: 'No tenés acceso a ese proyecto.' }, { status: 403 });
    return Response.json({ reply, mode, state: viewFor(state, me) });
  } catch (error) {
    console.error('[team-lab-chat]', error?.name || 'Error');
    return Response.json({ error: 'No se pudo procesar el mensaje. Probá de nuevo.' }, { status: 500 });
  }
}
