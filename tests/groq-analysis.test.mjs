import assert from 'node:assert/strict';
import test from 'node:test';
import Groq from 'groq-sdk';
import {
  buildGroqRequest, DEFAULT_GROQ_MODEL, normalizeGroqCompletion, requestGroqAnalysis, resolveGroqModel, supportsStrictSchema,
} from '../lib/groq-analysis.js';
import { classifyProviderError, parseAnalysisResponse } from '../lib/analysis-response.js';
import { validateProgressDraft } from '../lib/progress.js';

const schema = {
  type: 'object',
  properties: { summary: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 } },
  required: ['summary', 'confidence'],
  additionalProperties: false,
};

const tasks = [
  { id: 'task-login', projectId: 'p', title: 'Login', status: 'pendiente', progress: 0, weight: 1, version: 0 },
  { id: 'task-design', projectId: 'p', title: 'Diseño', status: 'pendiente', progress: 0, weight: 1, version: 0 },
];

function proposal(overrides = {}) {
  return {
    taskId: 'task-login', taskTitle: 'Login', proposedStatus: 'hecho', proposedProgress: 100,
    evidence: 'Terminé el login', reason: 'Afirmación directa.', confidence: 0.95, requiresConfirmation: false, ...overrides,
  };
}

function completion(content, finish_reason = 'stop') {
  return { choices: [{ finish_reason, message: { role: 'assistant', content } }] };
}

function fakeClient(result) {
  const calls = [];
  return {
    calls,
    chat: { completions: { create: async (request, options) => { calls.push({ request, options }); if (result instanceof Error) throw result; return result; } } },
  };
}

test('el modelo predeterminado está verificado para el modo estricto', () => {
  assert.equal(resolveGroqModel(undefined), DEFAULT_GROQ_MODEL);
  assert.equal(resolveGroqModel('  '), DEFAULT_GROQ_MODEL);
  assert.equal(resolveGroqModel('qwen/qwen3.8-27b'), 'qwen/qwen3.8-27b');
  assert.equal(supportsStrictSchema(DEFAULT_GROQ_MODEL), true);
  assert.equal(supportsStrictSchema('llama-3.1-8b-instant'), false);
});

test('arma una solicitud de Chat Completions con json_schema estricto', () => {
  const { request, strict } = buildGroqRequest({ model: DEFAULT_GROQ_MODEL, system: 'sys', input: '{}', schema });
  assert.equal(strict, true);
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(request.response_format.json_schema.strict, true);
  assert.deepEqual(request.messages.map((m) => m.role), ['system', 'user']);
  assert.equal(request.stream, false);
  assert.equal(request.reasoning_effort, 'low');
  assert.equal(request.response_format.json_schema.schema.properties.confidence.minimum, undefined);
  assert.equal(schema.properties.confidence.minimum, 0, 'no muta el esquema original');
});

test('un modelo sin modo estricto usa best-effort, nunca relaja la validación del servidor', () => {
  const { request, strict } = buildGroqRequest({ model: 'llama-3.3-70b-versatile', system: 's', input: '{}', schema });
  assert.equal(strict, false);
  assert.equal(request.response_format.json_schema.strict, false);
  assert.equal(request.reasoning_effort, undefined);
  const extra = normalizeGroqCompletion(completion(JSON.stringify({ summary: 'ok', proposals: [proposal({ extra: 1 })] })));
  assert.throws(() => parseAnalysisResponse(extra), /INVALID_MODEL_PROPOSAL/);
});

test('normaliza respuestas truncadas, vacías o sin choices como incompletas', () => {
  assert.equal(normalizeGroqCompletion(completion('{"summary":', 'length')).status, 'incomplete');
  assert.equal(normalizeGroqCompletion(completion(null)).status, 'incomplete');
  assert.equal(normalizeGroqCompletion({ choices: [] }).status, 'incomplete');
  assert.equal(normalizeGroqCompletion(undefined).status, 'incomplete');
  for (const value of [completion('{"summary":', 'length'), completion(null), {}]) {
    assert.throws(() => parseAnalysisResponse(normalizeGroqCompletion(value)), /INCOMPLETE_MODEL_RESPONSE/);
  }
  assert.throws(() => parseAnalysisResponse(normalizeGroqCompletion(completion('no es json'))), /INVALID_MODEL_JSON/);
});

test('llama al cliente sin reintentos y con timeout', async () => {
  const client = fakeClient(completion(JSON.stringify({ summary: 'ok', proposals: [] })));
  const { response } = await requestGroqAnalysis(client, { model: DEFAULT_GROQ_MODEL, system: 's', input: '{}', schema });
  assert.equal(response.status, 'completed');
  assert.deepEqual(client.calls[0].options, { timeout: 45_000, maxRetries: 0 });
});

test('los errores reales del SDK de Groq se clasifican sin exponer detalles', async () => {
  const cases = [
    [new Groq.RateLimitError(429, { error: { message: 'secret' } }, 'secret', new Headers()), 429],
    [new Groq.AuthenticationError(401, { error: { message: 'secret' } }, 'secret', new Headers()), 503],
    [new Groq.NotFoundError(404, { error: { message: 'secret' } }, 'secret', new Headers()), 503],
    [new Groq.InternalServerError(500, { error: { message: 'secret' } }, 'secret', new Headers()), 503],
    [new Groq.APIConnectionTimeoutError(), 504],
    [new Groq.BadRequestError(400, { error: { code: 'json_validate_failed', message: 'secret' } }, 'secret', new Headers()), 502],
  ];
  for (const [error, status] of cases) {
    const client = fakeClient(error);
    const caught = await requestGroqAnalysis(client, { model: DEFAULT_GROQ_MODEL, system: 's', input: '{}', schema }).catch((e) => e);
    const result = classifyProviderError(caught);
    assert.equal(result.status, status, error.constructor.name);
    assert.doesNotMatch(result.message, /secret/);
  }
});

test('las propuestas de Groq siguen pasando por la validación de evidencia del servidor', () => {
  const text = 'Terminé el login, pero no el diseño.';
  const content = JSON.stringify({
    summary: 'Avance registrado.',
    proposals: [
      proposal(),
      proposal({ taskId: 'task-design', taskTitle: 'Diseño', evidence: 'Terminé el login' }),
      proposal({ taskId: 'task-inventada', taskTitle: 'Pagos', evidence: 'Terminé el login' }),
    ],
  });
  const draft = parseAnalysisResponse(normalizeGroqCompletion(completion(content)));
  const accepted = validateProgressDraft(draft, tasks, text);
  assert.deepEqual(accepted.map((item) => item.taskId), ['task-login']);
});

test('una propuesta especulativa de Groq no modifica tareas', () => {
  const text = 'Mañana termino el login.';
  const draft = parseAnalysisResponse(normalizeGroqCompletion(completion(JSON.stringify({
    summary: 'x', proposals: [proposal({ evidence: 'Mañana termino el login' })],
  }))));
  assert.deepEqual(validateProgressDraft(draft, tasks, text), []);
});
