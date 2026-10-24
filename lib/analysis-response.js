const TASK_STATES = new Set(['pendiente', 'curso', 'trabado', 'hecho']);
const PROPOSAL_FIELDS = new Set([
  'taskId', 'taskTitle', 'proposedStatus', 'proposedProgress', 'evidence', 'reason', 'confidence', 'requiresConfirmation',
]);

export function classifyProviderError(error) {
  const rawStatus = error?.statusCode ?? error?.status;
  const status = Number.isInteger(rawStatus) ? rawStatus : 0;
  if (/credit card/i.test(String(error?.message || ''))) return { status: 503, message: 'El AI Gateway de Vercel necesita una tarjeta registrada en el equipo para habilitar los créditos. Agregala en Vercel → AI Gateway.' };
  if (status === 429) return { status: 429, message: 'El servicio de IA alcanzó su cuota o límite. Probá más tarde o revisá el uso de la cuenta.' };
  if (status === 401 || status === 403) return { status: 503, message: 'La credencial del servicio de IA no es válida o no tiene acceso.' };
  if (status === 404 || status === 400) return { status: 503, message: 'El modelo configurado no está disponible o no admite este formato. Revisá AI_ANALYSIS_MODEL y el acceso del AI Gateway.' };
  if (status === 408 || /timeout|timed out/i.test(String(error?.name || ''))) return { status: 504, message: 'El análisis tardó demasiado. Podés volver a intentarlo.' };
  if (status >= 500) return { status: 503, message: 'El servicio de IA no está disponible temporalmente.' };
  return { status: 502, message: 'No se pudo completar el análisis con el servicio de IA.' };
}

export function parseAnalysisResponse(response) {
  if (!response || response.status !== 'completed' || typeof response.output_text !== 'string' || !response.output_text.trim()) {
    throw new Error('INCOMPLETE_MODEL_RESPONSE');
  }
  let parsed;
  try { parsed = JSON.parse(response.output_text); } catch { throw new Error('INVALID_MODEL_JSON'); }
  if (!parsed || typeof parsed.summary !== 'string' || parsed.summary.length > 1000
    || !Array.isArray(parsed.proposals) || parsed.proposals.length > 100) {
    throw new Error('INVALID_MODEL_SHAPE');
  }
  for (const proposal of parsed.proposals) {
    if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)
      || Object.keys(proposal).length !== PROPOSAL_FIELDS.size
      || Object.keys(proposal).some((key) => !PROPOSAL_FIELDS.has(key))
      || typeof proposal.taskId !== 'string' || proposal.taskId.length > 100
      || typeof proposal.taskTitle !== 'string' || proposal.taskTitle.length > 120
      || !TASK_STATES.has(proposal.proposedStatus)
      || !Number.isInteger(proposal.proposedProgress) || proposal.proposedProgress < 0 || proposal.proposedProgress > 100
      || typeof proposal.evidence !== 'string' || proposal.evidence.length > 1000
      || typeof proposal.reason !== 'string' || proposal.reason.length > 1000
      || typeof proposal.confidence !== 'number' || !Number.isFinite(proposal.confidence) || proposal.confidence < 0 || proposal.confidence > 1
      || typeof proposal.requiresConfirmation !== 'boolean') {
      throw new Error('INVALID_MODEL_PROPOSAL');
    }
  }
  return parsed;
}
