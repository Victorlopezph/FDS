import { getSessionUser, unauthorized } from '@/lib/auth';
import { confirmProgressAnalysis, stateForProgressAnalysis } from '@/lib/progress';
import { mutateState } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const user = getSessionUser(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    const analysisId = typeof body.analysisId === 'string' ? body.analysisId : '';
    if (!projectId || !analysisId) return Response.json({ error: 'Faltan datos para confirmar el análisis.' }, { status: 400 });

    const { state, result } = await mutateState((current) => confirmProgressAnalysis(current, {
      me: user.id,
      projectId,
      analysisId,
    }));
    if (result.error) {
      const status = result.error === 'No tenés acceso a ese proyecto.' ? 403 : 404;
      return Response.json({ error: result.error }, { status });
    }
    return Response.json({ analysis: result.analysis, duplicate: Boolean(result.duplicate), state: stateForProgressAnalysis(state, user.id) });
  } catch (error) {
    console.error('[ronda-progress-confirm]', error.message);
    return Response.json({ error: 'No se pudo confirmar el cambio. Probá de nuevo.' }, { status: 500 });
  }
}
