import { createHash } from 'crypto';
import { addChat, autoAlerts, newId, normalizeTaskState, recompute, statusSnapshot, viewFor } from './logic.js';

const TASK_STATES = new Set(['pendiente', 'curso', 'trabado', 'hecho']);
const CONFIDENCE_THRESHOLD = 0.65;
const REGRESSION_CONFIDENCE = 0.85;
const CONFIRMATION_TTL_MS = 15 * 60 * 1000;
const STOP_WORDS = new Set(['para', 'tarea', 'trabajo', 'parte', 'con', 'del', 'las', 'los', 'una', 'uno', 'por', 'que', 'está', 'esta', 'como', 'proyecto']);

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR');
}

function taskProgress(task) {
  return normalizeTaskState(task).progress;
}

function taskVersion(task) {
  return Number.isSafeInteger(task.version) && task.version >= 0 ? task.version : 0;
}

function isSpeculative(evidence) {
  const normalized = normalizeText(evidence);
  return /[¿?]/.test(evidence)
    || /\b(creo que|me parece que|capaz|quizas|tal vez|podria|seria|supongo que|no se si|espero que|ojala|voy a|planeo|pienso|para manana|lo dejo listo para|manana\s+(?:lo\s+)?(?:termino|terminare|cierro|completo|dejo|entrego)|la semana que viene)\b/i.test(normalized)
    || /^\s*(si\s|cuando\b|en caso de que\b|imaginemos\b)/i.test(normalized);
}

function isNegatedCompletion(evidence) {
  const normalized = normalizeText(evidence);
  return /\b(?:no|nunca|todavia no|aun no|falta)\b.{0,45}\b(?:termin(?:e|o|ado|ar)|finaliz(?:e|o|ado|ar)|complet(?:e|o|ado|ar)|list[oa]|hech[oa]|resuelt?[oa]|entreg(?:ue|o|ado)|cerr(?:e|o|ado))\b/i.test(normalized)
    || /\b(?:no esta|no quedo|sigue sin)\b.{0,35}\b(?:terminad[oa]|completad[oa]|list[oa]|hech[oa]|resuelt?[oa])\b/i.test(normalized);
}

function supportsRollback(evidence, beforeProgress, proposedProgress) {
  const normalized = normalizeText(evidence);
  const explicitInvalidation = /\b(?:no estaba (?:hecho|terminado|completo)|no habia terminado|no llegue a terminar|nunca se termino|hay que rehacer|quedo incompleto|quedo mal|no quedo terminado|me equivoque.{0,25}(?:hecho|terminado)|dejo de funcionar|reabrir|volvio a abrir)\b/i.test(normalized);
  const lowerExplicitPercent = proposedProgress < beforeProgress && explicitPercentage(evidence) === proposedProgress;
  return explicitInvalidation || lowerExplicitPercent;
}

function supportsStatus(status, evidence, explicitPercent) {
  const normalized = normalizeText(evidence);
  if (isSpeculative(evidence)) return false;
  if (status === 'hecho') {
    if (isNegatedCompletion(evidence)) return false;
    return /\b(?:termine|termino|finalice|finalizo|complete|completo|listo|lista|hecho|hecha|resolvi|resuelto|resuelta|entregue|entrego|cerre|cerro)\b/i.test(normalized)
      || explicitPercent === 100;
  }
  if (status === 'curso') {
    if (/\b(?:no estoy|no sigo|no avance|no empece|no arranque)\b/i.test(normalized)) return false;
    return explicitPercent !== null && explicitPercent > 0 && explicitPercent < 100
      || /\b(?:empece|arranque|trabaje|estoy trabajando|sigo trabajando|sigo con|avance|en curso|progresando)\b/i.test(normalized);
  }
  if (status === 'trabado') {
    return /\b(?:estoy trabad[oa]|sigo trabad[oa]|me bloqueo|estoy bloquead[oa]|no puedo avanzar|me impide avanzar|no funciona actualmente|sigue sin funcionar|esta bloqueado|quedo trabado)\b/i.test(normalized);
  }
  if (status === 'pendiente') {
    return explicitPercent === 0
      || /\b(?:no empece|no arranque|todavia no empece|aun no empece|falta empezar|no avance nada|no avance con)\b/i.test(normalized);
  }
  return false;
}

function explicitPercentage(evidence) {
  const values = new Set();
  for (const match of evidence.matchAll(/(^|[^\p{L}\d.,-])(\d{1,3})\s*%(?![\d.,])/gu)) {
    const value = Number(match[2]);
    if (value < 0 || value > 100) return null;
    values.add(value);
  }
  const lower = normalizeText(evidence);
  if (/\b(?:tres cuartos|75 por ciento)\b/.test(lower)) values.add(75);
  if (/\b(?:mitad|medio|media tarea|50 por ciento)\b/.test(lower)) values.add(50);
  if (/\b(?:un cuarto|una cuarta parte|25 por ciento)\b/.test(lower)) values.add(25);
  return values.size === 1 ? [...values][0] : null;
}

function taskReferenceMatches(evidence, tasks) {
  const words = new Set(normalizeText(evidence).match(/[a-z0-9]+/g) || []);
  return tasks.filter((task) => {
    const title = normalizeText(task.title).trim();
    if (!title) return false;
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(normalizeText(evidence))) return true;
    const titleWords = title.match(/[a-z0-9]+/g) || [];
    const identifyingWords = titleWords.filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
    return identifyingWords.some((word) => words.has(word));
  });
}

function clauseContaining(messageText, evidence) {
  const searchableMessage = messageText.toLocaleLowerCase('es-AR');
  const index = searchableMessage.indexOf(evidence.toLocaleLowerCase('es-AR'));
  if (index < 0) return null;
  const evidenceEnd = index + evidence.length;
  const delimiters = /[.!?;\n]+|,\s*|\s+(?:pero|aunque|sin embargo|no obstante|y)\s+/gi;
  let start = 0;
  let end = messageText.length;
  let match;
  while ((match = delimiters.exec(messageText))) {
    const delimiterEnd = match.index + match[0].length;
    if (delimiterEnd <= index) start = delimiterEnd;
    else if (match.index >= evidenceEnd) { end = match.index; break; }
    else return null;
  }
  return messageText.slice(start, end).trim();
}

export function validateProgressDraft(draft, tasks, messageText) {
  if (!draft || !Array.isArray(draft.proposals) || typeof messageText !== 'string') return [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const usedIds = new Set();
  const valid = [];

  for (const item of draft.proposals) {
    if (!item || typeof item.taskId !== 'string' || usedIds.has(item.taskId)) continue;
    const task = taskById.get(item.taskId);
    const evidence = typeof item.evidence === 'string' ? item.evidence.trim().slice(0, 240) : '';
    const reason = typeof item.reason === 'string' ? item.reason.trim().slice(0, 300) : '';
    const confidence = item.confidence;
    const progress = item.proposedProgress;
    if (!task || item.taskTitle !== task.title || !TASK_STATES.has(item.proposedStatus)) continue;
    if (!evidence || !reason || !messageText.toLocaleLowerCase('es-AR').includes(evidence.toLocaleLowerCase('es-AR'))) continue;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < CONFIDENCE_THRESHOLD || confidence > 1) continue;
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) continue;

    const clause = clauseContaining(messageText, evidence);
    if (!clause || isSpeculative(clause) || isNegatedCompletion(clause)) continue;
    const matchingTasks = taskReferenceMatches(evidence, tasks);
    const clauseTasks = taskReferenceMatches(clause, tasks);
    if (matchingTasks.length !== 1 || matchingTasks[0].id !== task.id || clauseTasks.length !== 1 || clauseTasks[0].id !== task.id) continue;

    const clausePercent = explicitPercentage(clause);
    const explicitPercent = explicitPercentage(evidence);
    if (clausePercent !== null && explicitPercent !== clausePercent) continue;
    const currentProgress = taskProgress(task);
    let targetProgress = currentProgress;
    if (item.proposedStatus === 'hecho') targetProgress = 100;
    else if (item.proposedStatus === 'pendiente') targetProgress = 0;
    else if (explicitPercent !== null) targetProgress = explicitPercent;
    if (progress !== targetProgress || !supportsStatus(item.proposedStatus, clause, explicitPercent)) continue;
    if ((item.proposedStatus === 'hecho' && progress !== 100)
      || (item.proposedStatus === 'pendiente' && progress !== 0)
      || (['curso', 'trabado'].includes(item.proposedStatus) && progress === 100)) continue;

    const isRegression = targetProgress < currentProgress
      || (task.status === 'hecho' && item.proposedStatus !== 'hecho');
    if (isRegression && (confidence < REGRESSION_CONFIDENCE || !supportsRollback(clause, currentProgress, targetProgress))) continue;
    if (item.proposedStatus === task.status && targetProgress === currentProgress) continue;

    usedIds.add(item.taskId);
    valid.push({
      taskId: task.id,
      proposedStatus: item.proposedStatus,
      proposedProgress: targetProgress,
      evidence,
      reason,
      confidence,
      requiresConfirmation: item.requiresConfirmation === true || isRegression,
      before: { status: task.status, progress: currentProgress, version: taskVersion(task) },
    });
  }
  return valid;
}

function contextFingerprint(state, project) {
  const tasks = state.tasks.filter((task) => task.projectId === project.id).map((task) => ({
    id: task.id,
    title: task.title,
    status: normalizeTaskState(task).status,
    progress: normalizeTaskState(task).progress,
    weight: normalizeTaskState(task).weight,
    assignee: task.assignee || null,
    priority: task.priority || null,
    deadline: task.deadline || null,
    version: taskVersion(task),
  })).sort((a, b) => a.id.localeCompare(b.id));
  return createHash('sha256').update(JSON.stringify({
    project: { id: project.id, name: project.name, priority: project.priority, deadline: project.deadline, status: project.status, progress: project.progress },
    tasks,
  })).digest('hex');
}

function recordChange(task, proposal, confirmed = false) {
  const beforeStatus = task.status;
  const beforeProgress = taskProgress(task);
  task.status = proposal.proposedStatus;
  task.progress = proposal.proposedProgress;
  task.version = taskVersion(task) + 1;
  return {
    taskId: task.id,
    title: task.title,
    beforeStatus,
    beforeProgress,
    afterStatus: task.status,
    afterProgress: task.progress,
    evidence: proposal.evidence,
    reason: proposal.reason,
    confidence: proposal.confidence,
    confirmed,
  };
}

function messageForAnalysis(analysis) {
  const progress = `El progreso ponderado quedó en ${analysis.afterProgress}%.`;
  if (analysis.pendingCount && analysis.changes.length) return `Apliqué ${analysis.changes.length} cambio(s). Hay una posible regresión pendiente de tu confirmación. ${progress}`;
  if (analysis.pendingCount) return 'Detecté una posible regresión en una tarea. Confirmala antes de descontar el avance.';
  if (analysis.changes.length) return `Actualicé ${analysis.changes.length} tarea(s) con evidencia explícita. ${progress}`;
  if (analysis.staleCount) return 'No apliqué el análisis porque las tareas cambiaron mientras se procesaba. Volvé a registrar el mensaje.';
  return 'No cambié ninguna tarea: faltó una afirmación directa asociada inequívocamente a su nombre. Volvé a registrar el avance indicando cada tarea por separado; las dudas y promesas futuras no modifican el tablero.';
}

export function recordProgressAnalysis(state, input) {
  const { me, projectId, messageId } = input;
  const project = state.projects.find((item) => item.id === projectId && item.members.includes(me));
  if (!project) return { error: 'No tenés acceso a ese proyecto.' };

  state.progressAnalyses ||= [];
  const previous = state.progressAnalyses.find((item) => item.projectId === projectId && item.messageId === messageId && item.authorId === me);
  if (previous) return { duplicate: true, analysis: previous };

  recompute(state);
  const before = statusSnapshot(state);
  const projectBefore = project.progress || 0;
  const proposals = [];
  const changes = [];
  let staleCount = 0;

  for (const candidate of input.proposals || []) {
    const task = state.tasks.find((item) => item.id === candidate.taskId && item.projectId === projectId);
    if (!task || task.status !== candidate.before.status || taskProgress(task) !== candidate.before.progress || taskVersion(task) !== candidate.before.version) {
      staleCount += 1;
      continue;
    }
    const regression = candidate.proposedProgress < candidate.before.progress
      || (task.status === 'hecho' && candidate.proposedStatus !== 'hecho');
    const requiresConfirmation = candidate.requiresConfirmation || regression;
    const proposal = { ...candidate, reviewStatus: requiresConfirmation ? 'pending' : 'ready' };
    proposals.push(proposal);
    if (requiresConfirmation) continue;
    const change = recordChange(task, proposal);
    if (change.beforeStatus !== change.afterStatus || change.beforeProgress !== change.afterProgress) changes.push(change);
    proposal.reviewStatus = 'applied';
  }

  recompute(state);
  autoAlerts(state, before);
  const createdAt = Date.now();
  const analysis = {
    id: newId('pa'),
    messageId,
    projectId,
    authorId: me,
    source: input.source === 'audio' ? 'audio' : 'text',
    createdAt,
    expiresAt: createdAt + CONFIRMATION_TTL_MS,
    status: proposals.some((item) => item.reviewStatus === 'pending') ? 'pending_confirmation' : changes.length ? 'applied' : staleCount ? 'stale' : 'no_change',
    model: input.model,
    modelSummary: typeof input.summary === 'string' ? input.summary.trim().slice(0, 300) : '',
    summary: '',
    beforeProgress: projectBefore,
    afterProgress: project.progress || 0,
    changes,
    proposals,
    staleCount,
    pendingCount: proposals.filter((item) => item.reviewStatus === 'pending').length,
  };
  analysis.contextFingerprint = contextFingerprint(state, project);
  analysis.summary = messageForAnalysis(analysis);
  state.progressAnalyses.unshift(analysis);
  state.progressAnalyses = state.progressAnalyses.slice(0, 500);
  addChat(state, projectId, { id: messageId, role: 'user', authorId: me, content: input.text, tag: 'avance', source: analysis.source });
  addChat(state, projectId, { role: 'assistant', content: analysis.summary, tag: 'tablero', analysisId: analysis.id, mode: 'openai' });
  return { analysis };
}

export function confirmProgressAnalysis(state, { me, projectId, analysisId, messageId }) {
  const project = state.projects.find((item) => item.id === projectId && item.members.includes(me));
  if (!project) return { error: 'No tenés acceso a ese proyecto.' };
  const analysis = (state.progressAnalyses || []).find((item) => item.id === analysisId && item.projectId === projectId && item.messageId === messageId);
  if (!analysis) return { error: 'No encontré una propuesta vigente para ese mensaje.', status: 404 };
  if (analysis.status !== 'pending_confirmation') return { error: 'Esta propuesta ya no está pendiente de confirmación.', status: 409 };

  const now = Date.now();
  if (!Number.isSafeInteger(analysis.expiresAt) || analysis.expiresAt <= now) {
    for (const proposal of analysis.proposals.filter((item) => item.reviewStatus === 'pending')) proposal.reviewStatus = 'expired';
    analysis.pendingCount = 0;
    analysis.status = 'expired';
    analysis.expiredAt = now;
    analysis.summary = 'La propuesta venció. Registrá un nuevo mensaje para volver a analizar el progreso.';
    return { analysis, stale: true };
  }

  recompute(state);
  if (analysis.contextFingerprint !== contextFingerprint(state, project)) {
    const pending = analysis.proposals.filter((item) => item.reviewStatus === 'pending');
    for (const proposal of pending) proposal.reviewStatus = 'stale';
    analysis.staleCount += pending.length;
    analysis.pendingCount = 0;
    analysis.status = 'stale';
    analysis.staleAt = now;
    analysis.summary = 'El proyecto cambió desde este análisis. No apliqué la propuesta; registrá un nuevo mensaje para volver a analizar.';
    const assistantMessage = (state.chats?.[projectId] || []).find((item) => item.analysisId === analysis.id);
    if (assistantMessage) assistantMessage.content = analysis.summary;
    return { analysis, stale: true };
  }

  const pending = analysis.proposals.filter((item) => item.reviewStatus === 'pending');
  if (!pending.length) return { error: 'Esta propuesta ya no está pendiente de confirmación.', status: 409 };
  const changes = [];
  for (const proposal of pending) {
    const task = state.tasks.find((item) => item.id === proposal.taskId && item.projectId === projectId);
    if (!task || task.status !== proposal.before.status || taskProgress(task) !== proposal.before.progress || taskVersion(task) !== proposal.before.version) {
      return { error: 'El proyecto cambió desde este análisis. Registrá un nuevo mensaje para volver a analizar.', status: 409 };
    }
  }

  const before = statusSnapshot(state);
  for (const proposal of pending) {
    const task = state.tasks.find((item) => item.id === proposal.taskId && item.projectId === projectId);
    changes.push(recordChange(task, proposal, true));
    proposal.reviewStatus = 'applied';
  }
  recompute(state);
  autoAlerts(state, before);
  analysis.changes.push(...changes);
  analysis.afterProgress = project.progress || 0;
  analysis.pendingCount = 0;
  analysis.confirmedAt = now;
  analysis.confirmedBy = me;
  analysis.confirmationAudit = {
    by: me,
    at: now,
    messageId,
    changes: changes.map((change) => ({
      taskId: change.taskId,
      from: { status: change.beforeStatus, progress: change.beforeProgress },
      to: { status: change.afterStatus, progress: change.afterProgress },
      evidence: change.evidence,
      reason: change.reason,
    })),
  };
  analysis.status = 'confirmed';
  analysis.contextFingerprint = contextFingerprint(state, project);
  analysis.summary = `Confirmaste la regresión y actualicé el progreso ponderado a ${analysis.afterProgress}%.`;
  const assistantMessage = (state.chats?.[projectId] || []).find((item) => item.analysisId === analysis.id);
  if (assistantMessage) assistantMessage.content = analysis.summary;
  return { analysis };
}

export function stateForProgressAnalysis(state, me) {
  return viewFor(state, me);
}
