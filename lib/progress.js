import { addChat, autoAlerts, newId, recompute, statusSnapshot, viewFor } from './logic.js';

const TASK_STATES = new Set(['pendiente', 'curso', 'trabado', 'hecho']);
const CONFIDENCE_THRESHOLD = 0.65;
const REGRESSION_CONFIDENCE = 0.85;

function normalizeProgress(task) {
  if (task.status === 'hecho') return 100;
  if (task.status === 'pendiente') return 0;
  const value = Number(task.progress);
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : 0;
}

function statedPercentages(text) {
  const values = new Set();
  for (const match of text.matchAll(/\b(\d{1,3})\s*%/g)) {
    const value = Number(match[1]);
    if (value > 0 && value <= 100) values.add(value);
  }
  const lower = text.toLocaleLowerCase('es-AR');
  if (/\b(tres cuartos|75 por ciento)\b/.test(lower)) values.add(75);
  if (/\b(mitad|medio|media tarea|50 por ciento)\b/.test(lower)) values.add(50);
  if (/\b(un cuarto|una cuarta parte|25 por ciento)\b/.test(lower)) values.add(25);
  return values;
}

function isSpeculative(evidence) {
  return /[¿?]/.test(evidence)
    || /^\s*(si\s|capaz\b|quiz[aá]s\b|tal vez\b|me preocupa\b|tengo miedo\b|podr[ií]a\b|supongamos\b)/i.test(evidence);
}

function supportsRollback(evidence) {
  return /(no estaba (?:hecho|terminado)|no hab[ií]a terminado|no llegu[eé]|no empec[eé]|no hice|no arranqu[eé]|hay que rehacer|rompi[oó]|fall[oó]|dej[oó] de funcionar|no funciona|se perdi[oó]|se cay[oó]|en realidad|me equivoqu[eé]|incompleto|qued[oó] mal|no qued[oó]|reabrir|volvi[oó] a fallar)/i.test(evidence);
}

function supportsStatus(status, evidence, percentages) {
  const lower = evidence.toLocaleLowerCase('es-AR');
  if (status === 'hecho') {
    return /(termin[eé]|termin[oó]|finalic[eé]|finaliz[oó]|complet[eé]|complet[oó]|listo|hecho|resolv[ií]|resuelt[oa]|entregu[eé]|entreg[oó]|cerr[eé]|cerr[oó])/i.test(evidence)
      && !/(no|todav[ií]a no|a[uú]n no|nunca|falta).{0,30}(termin|finaliz|complet|listo|hecho|resolv|entreg)/i.test(lower);
  }
  if (status === 'curso') return /(empec[eé]|arranqu[eé]|trabaj[eé]|estoy trabajando|sigo con|avanc[eé]|en curso|progres)/i.test(evidence) || [...percentages].some((value) => lower.includes(`${value}%`));
  if (status === 'trabado') return /(trabad|bloque|atasc|no puedo|fall|error|imped|problema)/i.test(evidence);
  return /(no empec[eé]|no arranqu[eé]|todav[ií]a no|a[uú]n no|pendiente|falta empezar|no hice)/i.test(evidence);
}

function includedVerbatim(message, evidence) {
  return message.toLocaleLowerCase('es-AR').includes(evidence.toLocaleLowerCase('es-AR'));
}

function evidenceContextIsSpeculative(message, evidence) {
  const index = message.toLocaleLowerCase('es-AR').indexOf(evidence.toLocaleLowerCase('es-AR'));
  if (index < 0) return true;
  const start = Math.max(message.lastIndexOf('.', index), message.lastIndexOf('!', index), message.lastIndexOf('?', index), message.lastIndexOf('\n', index)) + 1;
  const endings = ['.', '!', '?', '\n'].map((mark) => message.indexOf(mark, index + evidence.length)).filter((position) => position >= 0);
  const end = endings.length ? Math.min(...endings) + 1 : message.length;
  return isSpeculative(message.slice(start, end).trim());
}

export function validateProgressDraft(draft, tasks, messageText) {
  if (!draft || !Array.isArray(draft.proposals)) return [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const percentages = statedPercentages(messageText);
  const usedIds = new Set();
  const valid = [];

  for (const item of draft.proposals) {
    if (!item || typeof item.taskId !== 'string' || usedIds.has(item.taskId)) continue;
    const task = taskById.get(item.taskId);
    const evidence = typeof item.evidence === 'string' ? item.evidence.trim().slice(0, 240) : '';
    const reason = typeof item.reason === 'string' ? item.reason.trim().slice(0, 300) : '';
    const confidence = Number(item.confidence);
    const proposedProgress = item.proposedProgress;
    if (!task || !TASK_STATES.has(item.proposedStatus)) continue;
    if (!evidence || !reason || !includedVerbatim(messageText, evidence) || isSpeculative(evidence) || evidenceContextIsSpeculative(messageText, evidence)) continue;
    if (typeof item.confidence !== 'number' || !Number.isFinite(confidence) || confidence < CONFIDENCE_THRESHOLD || confidence > 1) continue;
    if (!Number.isInteger(proposedProgress) || proposedProgress < 0 || proposedProgress > 100) continue;

    const currentProgress = normalizeProgress(task);
    let targetProgress = currentProgress;
    if (item.proposedStatus === 'hecho') targetProgress = 100;
    else if (item.proposedStatus === 'pendiente') targetProgress = 0;
    else if (proposedProgress === 0) targetProgress = 0;
    else if (percentages.has(proposedProgress)) targetProgress = proposedProgress;
    if (!supportsStatus(item.proposedStatus, evidence, percentages)) continue;

    const isRegression = targetProgress < currentProgress
      || (task.status === 'hecho' && item.proposedStatus !== 'hecho');
    if (isRegression && (confidence < REGRESSION_CONFIDENCE || !supportsRollback(evidence))) continue;
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
      before: { status: task.status, progress: currentProgress },
    });
  }
  return valid;
}

function recordChange(task, proposal, confirmed = false) {
  const beforeStatus = task.status;
  const beforeProgress = normalizeProgress(task);
  task.status = proposal.proposedStatus;
  task.progress = proposal.proposedProgress;
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
  return 'No encontré evidencia suficiente para cambiar el estado o el porcentaje de las tareas.';
}

export function recordProgressAnalysis(state, input) {
  const { me, projectId, messageId } = input;
  const project = state.projects.find((item) => item.id === projectId && item.members.includes(me));
  if (!project) return { error: 'No tenés acceso a ese proyecto.' };

  state.progressAnalyses ||= [];
  const previous = state.progressAnalyses.find((item) => item.projectId === projectId && item.messageId === messageId);
  if (previous) return { duplicate: true, analysis: previous };

  recompute(state);
  const before = statusSnapshot(state);
  const projectBefore = project.progress || 0;
  const proposals = [];
  const changes = [];
  let staleCount = 0;

  for (const candidate of input.proposals) {
    const task = state.tasks.find((item) => item.id === candidate.taskId && item.projectId === projectId);
    if (!task || task.status !== candidate.before.status || normalizeProgress(task) !== candidate.before.progress) {
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
  const analysis = {
    id: newId('pa'),
    messageId,
    projectId,
    authorId: me,
    source: input.source === 'audio' ? 'audio' : 'text',
    createdAt: Date.now(),
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
  analysis.summary = messageForAnalysis(analysis);
  state.progressAnalyses.unshift(analysis);
  state.progressAnalyses = state.progressAnalyses.slice(0, 500);
  addChat(state, projectId, { id: messageId, role: 'user', authorId: me, content: input.text, tag: 'avance', source: analysis.source });
  addChat(state, projectId, { role: 'assistant', content: analysis.summary, tag: 'tablero', analysisId: analysis.id, mode: 'openai' });
  return { analysis };
}

export function confirmProgressAnalysis(state, { me, projectId, analysisId }) {
  const project = state.projects.find((item) => item.id === projectId && item.members.includes(me));
  if (!project) return { error: 'No tenés acceso a ese proyecto.' };
  const analysis = (state.progressAnalyses || []).find((item) => item.id === analysisId && item.projectId === projectId);
  if (!analysis) return { error: 'No encontré ese análisis.' };
  if (analysis.status !== 'pending_confirmation') return { analysis, duplicate: ['confirmed', 'partially_applied'].includes(analysis.status) };

  recompute(state);
  const before = statusSnapshot(state);
  for (const proposal of analysis.proposals.filter((item) => item.reviewStatus === 'pending')) {
    const task = state.tasks.find((item) => item.id === proposal.taskId && item.projectId === projectId);
    if (!task || task.status !== proposal.before.status || normalizeProgress(task) !== proposal.before.progress) {
      proposal.reviewStatus = 'stale';
      analysis.staleCount += 1;
      continue;
    }
    const change = recordChange(task, proposal, true);
    analysis.changes.push(change);
    proposal.reviewStatus = 'applied';
  }
  recompute(state);
  autoAlerts(state, before);
  analysis.afterProgress = project.progress || 0;
  analysis.pendingCount = 0;
  analysis.confirmedAt = Date.now();
  analysis.confirmedBy = me;
  analysis.status = analysis.staleCount ? 'partially_applied' : 'confirmed';
  analysis.summary = analysis.staleCount
    ? `Se aplicaron los cambios confirmados que seguían vigentes; algunos quedaron sin efecto porque la tarea ya cambió. El progreso ponderado quedó en ${analysis.afterProgress}%.`
    : `Confirmaste la regresión y actualicé el progreso ponderado a ${analysis.afterProgress}%.`;
  const assistantMessage = (state.chats?.[projectId] || []).find((item) => item.analysisId === analysis.id);
  if (assistantMessage) assistantMessage.content = analysis.summary;
  return { analysis };
}

export function stateForProgressAnalysis(state, me) {
  return viewFor(state, me);
}
