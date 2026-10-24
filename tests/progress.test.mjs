import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmProgressAnalysis, recordProgressAnalysis, validateProgressDraft } from '../lib/progress.js';
import { createTask, recompute, updateTask } from '../lib/logic.js';
import { getState, mutateState, saveState } from '../lib/store.js';

const makeState = (tasks = []) => ({
  members: [{ id: 'user-1', name: 'Ari' }, { id: 'user-2', name: 'Sol' }],
  projects: [{ id: 'project-1', name: 'Proyecto', members: ['user-1'], progress: 0, status: 'marcha', priority: 'media', deadline: null }],
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

const proposal = ({ taskId = 'task-1', taskTitle = 'Login', proposedStatus = 'curso', proposedProgress = 50, evidence, confidence = 0.95 } = {}) => ({
  taskId,
  taskTitle,
  proposedStatus,
  proposedProgress,
  evidence,
  reason: 'La cita menciona la tarea de forma directa.',
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

function validateOne(task, text, values = {}) {
  const draft = proposal({ taskId: task.id, taskTitle: task.title, evidence: text, ...values });
  return validateProgressDraft({ proposals: [draft] }, [task], text);
}

test('calcula avance parcial ponderado y acepta el porcentaje citado para la tarea', () => {
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

test('rechaza porcentajes inventados, citas sin tarea y evidencia ambigua', () => {
  const task = { id: 'task-1', title: 'Login', projectId: 'project-1', status: 'curso', progress: 20, weight: 1 };
  const invented = validateOne(task, 'Estoy trabajando en el login.', { proposedProgress: 80 });
  const noTaskLink = validateProgressDraft({ proposals: [proposal({ evidence: 'Estoy trabajando en la tarea' })] }, [task], 'Estoy trabajando en la tarea.');
  const mismatchedTask = validateProgressDraft({ proposals: [proposal({ taskTitle: 'Diseño', evidence: 'Terminé el login.', proposedStatus: 'hecho', proposedProgress: 100 })] }, [task], 'Terminé el login.');
  assert.deepEqual(invented, []);
  assert.deepEqual(noTaskLink, []);
  assert.deepEqual(mismatchedTask, []);
});

test('cubre negación, falta de avance, promesa futura, pregunta e hipótesis', () => {
  const task = { id: 'task-1', title: 'Login', projectId: 'project-1', status: 'curso', progress: 20, weight: 1 };
  const negative = validateOne(task, 'No terminé el login.', { proposedStatus: 'hecho', proposedProgress: 100 });
  const noProgress = validateProgressDraft({ proposals: [proposal({ evidence: 'No avancé nada', proposedStatus: 'pendiente', proposedProgress: 0 })] }, [task], 'No avancé nada.');
  const future = validateOne(task, 'Lo dejo listo para mañana.', { proposedStatus: 'hecho', proposedProgress: 100 });
  const question = validateOne(task, '¿Ya terminamos el login?', { proposedStatus: 'hecho', proposedProgress: 100 });
  const hypothesis = validateOne(task, 'Creo que ya casi está el login.', { proposedStatus: 'hecho', proposedProgress: 100 });
  assert.deepEqual(negative, []);
  assert.deepEqual(noProgress, []);
  assert.deepEqual(future, []);
  assert.deepEqual(question, []);
  assert.deepEqual(hypothesis, []);
});

test('trata afirmaciones sobre varias tareas y porcentajes por separado', () => {
  const tasks = [
    { id: 'task-login', projectId: 'project-1', title: 'Login', status: 'pendiente', progress: 0, weight: 1 },
    { id: 'task-design', projectId: 'project-1', title: 'Diseño', status: 'pendiente', progress: 0, weight: 1 },
  ];
  const message = 'Terminé el login, pero no el diseño.';
  const mixed = validateProgressDraft({ proposals: [
    proposal({ taskId: 'task-login', taskTitle: 'Login', proposedStatus: 'hecho', proposedProgress: 100, evidence: 'Terminé el login' }),
    proposal({ taskId: 'task-design', taskTitle: 'Diseño', proposedStatus: 'hecho', proposedProgress: 100, evidence: 'no el diseño' }),
  ] }, tasks, message);
  assert.deepEqual(mixed.map((item) => item.taskId), ['task-login']);

  const progressMessage = 'El login está al 80% y el diseño al 20%.';
  const percentages = validateProgressDraft({ proposals: [
    proposal({ taskId: 'task-login', taskTitle: 'Login', proposedStatus: 'curso', proposedProgress: 80, evidence: 'El login está al 80%' }),
    proposal({ taskId: 'task-design', taskTitle: 'Diseño', proposedStatus: 'curso', proposedProgress: 20, evidence: 'el diseño al 20%' }),
  ] }, tasks, progressMessage);
  assert.deepEqual(percentages.map((item) => [item.taskId, item.proposedProgress]), [['task-login', 80], ['task-design', 20]]);
});

test('una falla mencionada no bloquea ni revierte una tarea por sí sola', () => {
  const task = { id: 'task-1', title: 'Login', projectId: 'project-1', status: 'curso', progress: 60, weight: 1 };
  const failure = validateOne(task, 'El login falló, pero el resto sigue funcionando.', { proposedStatus: 'trabado', proposedProgress: 60 });
  const rollback = validateOne({ ...task, status: 'hecho', progress: 100 }, 'El login está al 70% y quedó incompleto.', {
    proposedStatus: 'curso', proposedProgress: 70, evidence: 'El login está al 70%',
  });
  assert.deepEqual(failure, []);
  assert.equal(rollback.length, 1);
  assert.equal(rollback[0].requiresConfirmation, true);
});

test('no vuelve a avanzar un login que sigue terminado como ayer', () => {
  const task = { id: 'task-1', title: 'Login', projectId: 'project-1', status: 'hecho', progress: 100, weight: 1 };
  assert.deepEqual(validateOne(task, 'El login sigue terminado, como dije ayer.', { proposedStatus: 'hecho', proposedProgress: 100 }), []);
});

test('requiere confirmación, registra auditoría y rechaza la reutilización', () => {
  const state = makeState([{ id: 'task-1', status: 'hecho', progress: 100, title: 'Login' }]);
  const text = 'El login está al 70% y quedó incompleto.';
  const validated = validateProgressDraft({ proposals: [proposal({ proposedStatus: 'curso', proposedProgress: 70, evidence: 'El login está al 70%' })] }, state.tasks, text);
  assert.equal(validated.length, 1);
  assert.equal(validated[0].requiresConfirmation, true);
  const result = analyze(state, { text, proposals: validated });
  assert.equal(result.analysis.status, 'pending_confirmation');
  assert.equal(state.tasks[0].progress, 100);

  const input = { me: 'user-1', projectId: 'project-1', analysisId: result.analysis.id, messageId: result.analysis.messageId };
  const confirmed = confirmProgressAnalysis(state, input);
  assert.equal(confirmed.analysis.status, 'confirmed');
  assert.equal(confirmed.analysis.confirmationAudit.by, 'user-1');
  assert.equal(confirmed.analysis.confirmationAudit.changes[0].evidence, 'El login está al 70%');
  assert.equal(state.tasks[0].progress, 70);
  assert.equal(state.projects[0].progress, 70);
  assert.equal(confirmProgressAnalysis(state, input).status, 409);
});

test('no confirma propuestas vencidas, alteradas ni pertenecientes a otro mensaje/proyecto', () => {
  const state = makeState([{ id: 'task-1', status: 'hecho', progress: 100, title: 'Login' }]);
  const text = 'El login está al 70% y quedó incompleto.';
  const accepted = validateProgressDraft({ proposals: [proposal({ proposedStatus: 'curso', proposedProgress: 70, evidence: 'El login está al 70%' })] }, state.tasks, text);
  const { analysis } = analyze(state, { text, proposals: accepted });
  assert.equal(confirmProgressAnalysis(state, { me: 'user-1', projectId: 'project-1', analysisId: analysis.id, messageId: 'different-message-0001' }).status, 404);
  assert.equal(confirmProgressAnalysis(state, { me: 'user-2', projectId: 'project-1', analysisId: analysis.id, messageId: analysis.messageId }).error, 'No tenés acceso a ese proyecto.');

  state.tasks[0].version = 12;
  const stale = confirmProgressAnalysis(state, { me: 'user-1', projectId: 'project-1', analysisId: analysis.id, messageId: analysis.messageId });
  assert.equal(stale.stale, true);
  assert.equal(state.tasks[0].progress, 100);

  const expiredState = makeState([{ id: 'task-1', status: 'hecho', progress: 100, title: 'Login' }]);
  const expiredAnalysis = analyze(expiredState, { text, proposals: accepted }).analysis;
  expiredAnalysis.expiresAt = Date.now() - 1;
  const expired = confirmProgressAnalysis(expiredState, { me: 'user-1', projectId: 'project-1', analysisId: expiredAnalysis.id, messageId: expiredAnalysis.messageId });
  assert.equal(expired.analysis.status, 'expired');
});

test('rechaza usuarios sin acceso y proyectos ajenos', () => {
  const state = makeState([{ id: 'task-1', status: 'pendiente', title: 'Login' }]);
  const denied = recordProgressAnalysis(state, {
    me: 'other-user', projectId: 'project-1', messageId: 'message-id-0002', text: 'Terminé el login', source: 'text', proposals: [],
  });
  assert.equal(denied.error, 'No tenés acceso a ese proyecto.');
  const deniedConfirmation = confirmProgressAnalysis(state, { me: 'user-2', projectId: 'project-1', analysisId: 'unknown', messageId: 'message-id-0002' });
  assert.equal(deniedConfirmation.error, 'No tenés acceso a ese proyecto.');
});

test('conserva parciales válidos, normaliza estados y valida peso al crear y editar', () => {
  const state = makeState([{ id: 'task-1', title: 'Login', status: 'pendiente', progress: 35, weight: 2 }]);
  recompute(state);
  assert.equal(state.tasks[0].status, 'curso');
  assert.equal(state.tasks[0].progress, 35);

  const created = createTask(state, 'user-1', { projectId: 'project-1', title: 'Diseño', status: 'curso', progress: 25, weight: 4 });
  assert.equal(created.message, 'Tarea creada.');
  const createdTask = state.tasks.at(-1);
  assert.equal(createdTask.progress, 25);
  assert.equal(createdTask.weight, 4);
  assert.equal(createTask(state, 'user-1', { projectId: 'project-1', title: 'Inválida', weight: Infinity }).error, 'El peso debe estar entre 0,1 y 100.');
  assert.equal(updateTask(state, 'user-1', { taskId: 'task-1', weight: NaN }).error, 'El peso debe estar entre 0,1 y 100.');
  assert.equal(updateTask(state, 'user-1', { taskId: 'task-1', progress: 101 }).error, 'El avance debe ser un porcentaje entre 0 y 100.');
  assert.equal(updateTask(state, 'user-1', { taskId: 'task-1', status: 'hecho', progress: 5 }).message, 'Tarea guardada.');
  assert.equal(state.tasks[0].status, 'hecho');
  assert.equal(state.tasks[0].progress, 100);
  assert.ok(state.tasks[0].version > 0);
  assert.equal(recompute(state).projects[0].progress, 50);
});

test('reintentar un mensaje no duplica cambios ni auditorías', async () => {
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

test('serializa mutaciones concurrentes para no perder escrituras en memoria local', async () => {
  await saveState({ ...makeState(), counter: 0 });
  await Promise.all(Array.from({ length: 32 }, () => mutateState(async (state) => {
    const previous = state.counter;
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
    state.counter = previous + 1;
  })));
  const state = await getState();
  assert.equal(state.counter, 32);
});

test('a statement that every task is finished completes all unfinished tasks', () => {
  const tasks = makeState([
    { id: 'task-1', title: 'Login' },
    { id: 'task-2', title: 'Pagos', status: 'curso', progress: 40 },
    { id: 'task-3', title: 'Diseño', status: 'hecho', progress: 100 },
  ]).tasks;
  const text = 'todas las tareas estan terminadas';
  const accepted = validateProgressDraft({ proposals: [proposal({ proposedStatus: 'hecho', proposedProgress: 100, evidence: text })] }, tasks, text);
  assert.deepEqual(accepted.map((item) => [item.taskId, item.proposedStatus, item.proposedProgress]), [['task-1', 'hecho', 100], ['task-2', 'hecho', 100]]);

  const state = makeState([{ id: 'task-1', title: 'Login' }, { id: 'task-2', title: 'Pagos' }]);
  const result = analyze(state, { text, proposals: validateProgressDraft({ proposals: [proposal({ proposedStatus: 'hecho', proposedProgress: 100, evidence: text })] }, state.tasks, text) });
  assert.equal(result.analysis.afterProgress, 100);
});

test('global completion is rejected with exceptions, doubts, partial scope or partial percentages', () => {
  const tasks = makeState([{ id: 'task-1', title: 'Login' }, { id: 'task-2', title: 'Pagos' }]).tasks;
  for (const text of [
    'todas las tareas estan terminadas menos pagos',
    'casi todas las tareas estan terminadas',
    'creo que todas las tareas estan terminadas',
    'todas las tareas no estan terminadas',
    'todas las tareas estan al 80%',
    'mañana termino todo',
    'algunas tareas estan terminadas',
  ]) {
    const accepted = validateProgressDraft({ proposals: [proposal({ proposedStatus: 'hecho', proposedProgress: 100, evidence: text })] }, tasks, text);
    assert.deepEqual(accepted, [], text);
  }
});
