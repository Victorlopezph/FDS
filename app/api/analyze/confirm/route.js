import { getSessionUser, unauthorized } from '@/lib/auth';
import { confirmProgressAnalysis, stateForProgressAnalysis } from '@/lib/progress';
import { mutateState, StorageUnavailableError } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const user = getSessionUser(req);
  if (!user) return unauthorized();

  let body;
  try { body = await req.json(); } catch {
    return Response.json({ error: 'El cuerpo de la solicitud no es válido.' }, { status: 400 });
  }
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const analysisId = typeof body.analysisId === 'string' ? body.analysisId : '';
  const messageId = typeof body.messageId === 'string' ? body.messageId : '';
  if (!/^[\w-]{1,160}$/.test(projectId) || !/^[\w-]{1,100}$/.test(analysisId) || !/^[\w-]{8,128}$/.test(messageId)) {
    return Response.json({ error: 'Faltan datos válidos para confirmar el análisis.' }, { status: 400 });
  }

  try {
    const { state, result } = await mutateState((current) => confirmProgressAnalysis(current, {
      me: user.id,
      projectId,
      analysisId,
      messageId,
    }));
    if (result.error) {
      const status = result.status || (result.error === 'No tenés acceso a ese proyecto.' ? 403 : 404);
      return Response.json({ error: result.error }, { status });
    }
    return Response.json({ analysis: result.analysis, state: stateForProgressAnalysis(state, user.id), stale: Boolean(result.stale) });
  } catch (error) {
    const status = error instanceof StorageUnavailableError ? 503 : 500;
    return Response.json({ error: status === 503 ? 'El almacenamiento durable no está disponible.' : 'No se pudo confirmar el cambio. Probá de nuevo.' }, { status });
  }
}
