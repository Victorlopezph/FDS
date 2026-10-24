import { getState, saveState } from '@/lib/store';
import { applyAgentResult, contextFor, viewFor, projectView, addChat } from '@/lib/logic';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { claude, parseJSON, hoy, aiConfigured } from '@/lib/claude';
import { offlineAnalyze } from '@/lib/offline';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYSTEM = `Sos Team lab, el agente que organiza un equipo de trabajo, estudio o programación.
Recibís lo que un miembro del equipo cuenta (un audio transcripto o una nota) y actualizás la organización.

Reglas:
- Usá SIEMPRE los ids existentes de proyectos, tareas y miembros del contexto.
- Solo podés asignar una tarea a integrantes de ese proyecto.
- Si alguien dice que terminó algo, pasá esa tarea a "hecho". Si dice que empezó, a "curso". Si se trabó o tiene un problema, a "trabado".
- Si menciona trabajo nuevo, creá tareas.
- Trabajás SOLO sobre el proyecto de este chat: no crees proyectos nuevos (nuevosProyectos va vacío) y usá su id como projectId.
- Para asignar responsables seguí este orden:
  1. Habilidades: elegí a quien tenga habilidades que coincidan con la tarea.
  2. Horario: descartá a quien no esté disponible antes de la fecha límite.
  3. Carga: entre los que quedan, al que tenga menos tareasAbiertas.
  Si nadie tiene la habilidad, usá rol y carga. En el resumen explicá en pocas palabras por qué elegiste a cada uno (ej: "se la di a Juan porque sabe Frontend y tiene 1 tarea").
- Una fecha límite puede ser null si no se dijo.
- Fechas relativas ("el viernes", "mañana") convertilas a YYYY-MM-DD tomando como referencia la fecha de hoy.
- Generá alertas útiles: "todos" para avisos generales o el id de un miembro para avisos individuales.
  Niveles: "urgente" (algo trabado o que vence ya), "aviso" (riesgo o ausencia), "info" (novedad), "logro" (algo terminado).
- Si alguien avisa que no puede venir o trabajar un día, generá un aviso y proponé a quién reasignar sus tareas urgentes.
- El resumen va en español rioplatense, corto y claro (2 a 4 oraciones), diciendo qué cambiaste.

Respondé SOLO con un JSON con esta forma exacta, sin texto extra:
{
  "resumen": "string",
  "nuevosProyectos": [{"tempId": "np1", "name": "string", "priority": "alta|media|baja", "deadline": "YYYY-MM-DD o null"}],
  "nuevasTareas": [{"projectId": "id o tempId", "title": "string", "assignee": "id de miembro o null", "status": "pendiente|curso|trabado|hecho", "priority": "alta|media|baja", "deadline": "YYYY-MM-DD o null"}],
  "cambios": [{"taskId": "id", "status": "opcional", "assignee": "opcional", "deadline": "opcional", "priority": "opcional"}],
  "alertas": [{"to": "todos o id de miembro", "projectId": "id del proyecto relacionado o null", "level": "urgente|aviso|info|logro", "message": "string"}]
}`;

export async function POST(req) {
  const user = getSessionUser(req);
  if (!user) return unauthorized();
  const me = user.id;
  try {
    const { text, projectId } = await req.json();
    if (!text?.trim()) return Response.json({ error: 'Escribí o grabá algo primero.' }, { status: 400 });
    if (text.length > 4000) return Response.json({ error: 'El texto es muy largo (máximo 4000 caracteres).' }, { status: 400 });

    const snapshot = projectView(await getState(), me, projectId);
    if (!snapshot) return Response.json({ error: 'No tenés acceso a ese proyecto.' }, { status: 403 });
    const autor = snapshot.members.find((m) => m.id === me);

    // Con IA si hay una configurada; si no (o si falla), modo sin IA por reglas.
    let result, mode = 'ia';
    if (aiConfigured()) {
      try {
        const raw = await claude({
          req,
          system: SYSTEM,
          maxTokens: 2000,
          messages: [{
            role: 'user',
            content: `Hoy es ${hoy()}.\nProyecto de este chat y su equipo:\n${contextFor(snapshot)}\n\nLo cuenta ${autor ? `${autor.name} (id ${autor.id})` : 'alguien del equipo'}:\n"""${text}"""`,
          }],
        });
        result = parseJSON(raw);
      } catch (e) {
        console.error('IA no disponible, uso modo sin IA:', e.message);
      }
    }
    if (!result) { result = offlineAnalyze(snapshot, text, me); mode = 'local'; }
    const resumen = result.resumen || 'Listo, actualicé el tablero.';
    // La IA tarda unos segundos: releemos el estado para no pisar lo que otros cambiaron mientras tanto.
    const state = await getState();
    applyAgentResult(state, result, me, projectId);
    addChat(state, projectId, { role: 'user', authorId: me, content: text.trim(), tag: 'avance' });
    addChat(state, projectId, { role: 'assistant', content: resumen, tag: 'tablero', mode });
    await saveState(state);
    return Response.json({ resumen, mode, state: viewFor(state, me) });
  } catch (e) {
    console.error(e); // aparece en los logs de Vercel
    return Response.json({ error: e.message }, { status: 500 });
  }
}
