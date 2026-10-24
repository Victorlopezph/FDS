import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyProviderError, parseAnalysisResponse } from '../lib/analysis-response.js';

const proposal = {
  taskId: 'task-1',
  taskTitle: 'Login',
  proposedStatus: 'hecho',
  proposedProgress: 100,
  evidence: 'Terminé el login',
  reason: 'La afirmación dice que se terminó.',
  confidence: 0.95,
  requiresConfirmation: false,
};

test('acepta sólo una respuesta completada y estructurada', () => {
  assert.deepEqual(parseAnalysisResponse({
    status: 'completed',
    output_text: JSON.stringify({ summary: 'Listo.', proposals: [proposal] }),
  }), { summary: 'Listo.', proposals: [proposal] });
});

test('rechaza respuestas incompletas, refusals sin texto y JSON inválido', () => {
  assert.throws(() => parseAnalysisResponse({ status: 'incomplete', output_text: '' }), /INCOMPLETE_MODEL_RESPONSE/);
  assert.throws(() => parseAnalysisResponse({ status: 'completed', output_text: '' }), /INCOMPLETE_MODEL_RESPONSE/);
  assert.throws(() => parseAnalysisResponse({ status: 'completed', output_text: '{' }), /INVALID_MODEL_JSON/);
});

test('clasifica cuotas, timeout y modelos no disponibles sin exponer mensajes privados', () => {
  assert.deepEqual(classifyProviderError({ status: 429, message: 'private prompt content' }), {
    status: 429,
    message: 'El servicio de IA alcanzó su cuota o límite. Probá más tarde o revisá el uso de la cuenta.',
  });
  assert.equal(classifyProviderError({ name: 'APIConnectionTimeoutError', message: 'private text' }).status, 504);
  assert.match(classifyProviderError({ status: 404, message: 'private text' }).message, /OPENAI_MODEL/);
  assert.equal(classifyProviderError({ status: 502, message: 'private text' }).status, 503);
});

test('rechaza resultados que no cumplen estrictamente el esquema esperado', () => {
  const invalid = [
    { summary: 'ok', proposals: 'no es una lista' },
    { summary: 'ok', proposals: [{ ...proposal, taskTitle: undefined }] },
    { summary: 'ok', proposals: [{ ...proposal, proposedProgress: 101 }] },
    { summary: 'ok', proposals: [{ ...proposal, confidence: Number.NaN }] },
    { summary: 'ok', proposals: [{ ...proposal, privateField: 'unexpected' }] },
  ];
  for (const value of invalid) {
    assert.throws(() => parseAnalysisResponse({ status: 'completed', output_text: JSON.stringify(value) }));
  }
});
