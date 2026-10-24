import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmProgressAnalysis, recordProgressAnalysis, validateProgressDraft } from '../lib/progress.js';
import { recompute } from '../lib/logic.js';
import { getState, mutateState, saveState } from '../lib/store.js';

const makeState = (tasks = []) => ({
  members: [{ id: 'user-1', name: 'Ari' }],
  projects: [{ id: 'project-1', name: 'Proyecto', members: ['user-1'], progress: 0, status: 'marcha' }],
  tasks: tasks.map((task, index) => ({
    id: task.id || `task-${index + 1}`,
    projectId: 'project-1',
    title: task.title || `Tarea ${index + 1}`,
    status: task.status || 'pendiente',
    progress: task.progress ?? 0,
    weight: task.weight ?? 1,
    ...task,
  })),
  alerts: [],
  chats: {},
});

const proposal = ({ taskId = 'task-1', proposedStatus = 'curso', proposedProgress = 50, evidence, confidence = 0.95 } = {}) => ({
  taskId,
  proposedStatus,
  proposedProgress,
  evidence,
  reason: 'El mensaje aporta evidencia directa para este cambio.',
  confidence,
  requiresConfirmation: false,
});

function analyze(state, { messageId = 'message-id-0001', text, source = 'text', proposals }) {
  return recordProgressAnalysis(state, {
    me: 'user-1',
    projectId: 'project-1',
    messageId,
    text,
    source,
    proposals,
    summary: 'Analicé el avance informado.',
    model: 'test-model',
  });
}

test('calcula avance parcial con pesos y acepta solo el porcentaje explícito', () => {
  const state = makeState([
    { id: 'task-1', status: 'curso', progress: 20, weight: 3, title: 'Login' },
    { id: 'task-2', status: 'pendiente', weight: 1, title: 'Pagos' },
  ]);
  recompute(state);
  assert.equal(state.projects[0].progress, 15);

  const text = 'El login va por 60% y sigo trabajando.';
  const accepted = validateProgressDraft({ proposals: [proposal({ proposedProgress: 60, evidence: 'El login va por 60%' })] }, state.tasks, text);
  assert.equal(accepted.length, 1);
  const recorded = analyze(state, { text, proposals: accepted });
  assert.equal(recorded.analysis.beforeProgress, 15);
  assert.equal(recorded.analysis.afterProgress, 45);
  assert.equal(state.tasks[0].progress, 60);
});

test('ignora porcentajes inventados y preguntas hipotéticas', () => {
  const state = makeState([{ id: 'task-1', status: 'curso', progress: 20 }]);
  const invented = validateProgressDraft({ proposals: [proposal({ proposedProgress: 80, evidence: 'Estoy trabajando en la tarea' })] }, state.tasks, 'Estoy trabajando en la tarea.');
  const hypothetical = validateProgressDraft({ proposals: [proposal({ proposedProgress: 20, evidence: 'Si termino la tarea' })] }, state.tasks, 'Si termino la tarea, ¿sube el avance?');
  const future = validateProgressDraft({ proposals: [proposal({ proposedStatus: 'hecho', proposedProgress: 100, evidence: 'Voy a terminar la tarea' })] }, state.tasks, 'Voy a terminar la tarea mañana.');
  assert.deepEqual(invented, []);
  assert.deepEqual(hypothetical, []);
  assert.deepEqual(future, []);
});

test('requiere confirmación humana y evidencia explícita para una regresión', () => {
  const state = makeState([{ id: 'task-1', status: 'hecho', progress: 100, title: 'Login' }]);
  const text = 'El login se rompió y ahora quedó al 70%.';
  const validated = validateProgressDraft({ proposals: [proposal({ proposedStatus: 'curso', proposedProgress: 70, evidence: text })] }, state.tasks, text);
  assert.equal(validated.length, 1);
  assert.equal(validated[0].requiresConfirmation, true);
  const result = analyze(state, { text, proposals: validated });
  assert.equal(result.analysis.status, 'pending_confirmation');
  assert.equal(state.tasks[0].progress, 100);

  const confirmed = confirmProgressAnalysis(state, { me: 'user-1', projectId: 'project-1', analysisId: result.analysis.id });
  assert.equal(confirmed.analysis.status, 'confirmed');
  assert.equal(state.tasks[0].progress, 70);
  assert.equal(state.projects[0].progress, 70);
});

test('no procesa tareas inexistentes ni usuarios sin acceso', () => {
  const state = makeState([{ id: 'task-1', status: 'pendiente' }]);
  const text = 'Terminé la integración.';
  const unknown = validateProgressDraft({ proposals: [proposal({ taskId: 'fake-task', proposedStatus: 'hecho', proposedProgress: 100, evidence: text })] }, state.tasks, text);
  assert.deepEqual(unknown, []);
  const denied = recordProgressAnalysis(state, {
    me: 'other-user', projectId: 'project-1', messageId: 'message-id-0002', text, source: 'text', proposals: [],
  });
  assert.equal(denied.error, 'No tenés acceso a ese proyecto.');
});

test('guarda el origen de audio transcrito y reintentar el mismo mensaje no duplica cambios', async () => {
  const state = makeState([{ id: 'task-1', status: 'pendiente', title: 'Login' }]);
  const text = 'Terminé el login.';
  const accepted = validateProgressDraft({ proposals: [proposal({ proposedStatus: 'hecho', proposedProgress: 100, evidence: 'Terminé el login' })] }, state.tasks, text);
  await saveState(state);
  const input = { messageId: 'voice-message-001', text, source: 'audio', proposals: accepted };
  const attempts = await Promise.all(Array.from({ length: 8 }, () => mutateState((current) => analyze(current, input))));
  const finalState = await getState();
  assert.equal(finalState.progressAnalyses.length, 1);
  assert.equal(finalState.chats['project-1'].filter((message) => message.id === input.messageId).length, 1);
  assert.equal(finalState.progressAnalyses[0].source, 'audio');
  assert.equal(finalState.chats['project-1'][0].source, 'audio');
  assert.equal(finalState.tasks[0].status, 'hecho');
  assert.equal(attempts.filter((attempt) => attempt.result.duplicate).length, 7);
});

test('serializa mutaciones concurrentes para no perder escrituras', async () => {
  await saveState({ ...makeState(), counter: 0 });
  await Promise.all(Array.from({ length: 32 }, () => mutateState(async (state) => {
    const previous = state.counter;
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
    state.counter = previous + 1;
  })));
  const state = await getState();
  assert.equal(state.counter, 32);
});
