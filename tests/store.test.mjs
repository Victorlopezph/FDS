import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  completeAnalysis, consumeRateLimit, failAnalysis, get, getState, mutateState, reserveAnalysis,
  StorageUnavailableError,
} from '../lib/store.js';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function withRedisMock(t, handler) {
  const previousUrl = process.env.KV_REST_API_URL;
  const previousToken = process.env.KV_REST_API_TOKEN;
  const previousFallbackUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousFallbackToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalFetch = globalThis.fetch;
  process.env.KV_REST_API_URL = 'https://upstash-mock.invalid';
  process.env.KV_REST_API_TOKEN = 'not-a-real-token';
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  globalThis.fetch = async (_url, options) => handler(JSON.parse(options.body));
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [
      ['KV_REST_API_URL', previousUrl], ['KV_REST_API_TOKEN', previousToken],
      ['UPSTASH_REDIS_REST_URL', previousFallbackUrl], ['UPSTASH_REDIS_REST_TOKEN', previousFallbackToken],
    ]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

const response = (result, status = 200) => new Response(JSON.stringify({ result }), { status, headers: { 'content-type': 'application/json' } });

test('two distributed callers cannot reserve the same analysis', async (t) => {
  const reservations = new Map();
  withRedisMock(t, async (command) => {
    if (command[0] !== 'EVAL') throw new Error('Unexpected command');
    const key = command[3];
    if (command[1].includes("string.sub(current, 1, 7) == 'failed:'")) {
      const current = reservations.get(key);
      if (!current) {
        const value = `processing:${command[4]}`;
        reservations.set(key, value);
        return response('acquired');
      }
      return response(current.startsWith('failed:') ? 'failed' : current);
    }
    throw new Error('Unexpected Redis script');
  });

  const key = `simultaneous-${randomUUID()}`;
  const reservationsForMessage = await Promise.all(Array.from({ length: 16 }, () => reserveAnalysis(key)));
  assert.equal(reservationsForMessage.filter((item) => item.status === 'acquired').length, 1);
  assert.equal(reservationsForMessage.filter((item) => item.status === 'processing').length, 15);
});

test('completed results are retained and failures become retryable after their lease', async (t) => {
  const reservations = new Map();
  withRedisMock(t, async (command) => {
    const key = command[3];
    if (command[0] !== 'EVAL') throw new Error('Unexpected command');
    if (command[1].includes("string.sub(current, 1, 7) == 'failed:'")) {
      const current = reservations.get(key);
      if (!current) {
        reservations.set(key, `processing:${command[4]}`);
        return response('acquired');
      }
      if (current.startsWith('failed:')) return response('failed');
      return response(current);
    }
    if (command[1].includes("'completed:' .. ARGV[2]")) {
      if (reservations.get(key) !== `processing:${command[4]}`) return response(0);
      reservations.set(key, `completed:${command[5]}`);
      return response(1);
    }
    if (command[1].includes("'failed:' .. ARGV[1]")) {
      if (reservations.get(key) !== `processing:${command[4]}`) return response(0);
      reservations.set(key, `failed:${command[4]}`);
      return response(1);
    }
    throw new Error('Unexpected Redis script');
  });

  const completedKey = `completed-${randomUUID()}`;
  const acquired = await reserveAnalysis(completedKey);
  assert.equal(await completeAnalysis(completedKey, acquired.owner, 'pa-analysis-1'), true);
  assert.deepEqual(await reserveAnalysis(completedKey), { status: 'completed', analysisId: 'pa-analysis-1' });

  const failedKey = `failed-${randomUUID()}`;
  const failed = await reserveAnalysis(failedKey);
  assert.equal(await failAnalysis(failedKey, failed.owner, 1_000), true);
  assert.deepEqual(await reserveAnalysis(failedKey), { status: 'failed' });
});

test('memory reservations expire so abandoned work can be recovered locally', async () => {
  const key = `abandoned-${randomUUID()}`;
  const initial = await reserveAnalysis(key, { leaseMs: 10 });
  assert.equal(initial.status, 'acquired');
  assert.equal((await reserveAnalysis(key, { leaseMs: 10 })).status, 'processing');
  await sleep(20);
  const recovered = await reserveAnalysis(key, { leaseMs: 10 });
  assert.equal(recovered.status, 'acquired');
  assert.notEqual(recovered.owner, initial.owner);
});

test('CAS retries are bounded and invalid Redis results are rejected', async (t) => {
  let casAttempts = 0;
  withRedisMock(t, async (command) => {
    if (command[0] === 'GET') return response(null);
    if (command[0] === 'EVAL') { casAttempts += 1; return response(0); }
    throw new Error('Unexpected command');
  });

  await assert.rejects(mutateState((state) => { state.touched = true; }, 2), /cambió repetidamente/);
  assert.equal(casAttempts, 2);
});

test('REST HTTP and malformed JSON failures do not expose provider details', async (t) => {
  const originalUrl = process.env.KV_REST_API_URL;
  const originalToken = process.env.KV_REST_API_TOKEN;
  const originalFetch = globalThis.fetch;
  process.env.KV_REST_API_URL = 'https://upstash-mock.invalid';
  process.env.KV_REST_API_TOKEN = 'not-a-real-token';
  globalThis.fetch = async () => new Response('provider detail should not escape', { status: 502 });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.KV_REST_API_URL; else process.env.KV_REST_API_URL = originalUrl;
    if (originalToken === undefined) delete process.env.KV_REST_API_TOKEN; else process.env.KV_REST_API_TOKEN = originalToken;
  });
  await assert.rejects(get('broken-key'), /respondió 502/);

  globalThis.fetch = async () => new Response('not-json', { status: 200 });
  await assert.rejects(get('bad-json-key'), /respuesta inválida/);
});

test('production fails closed instead of silently using process memory', async () => {
  const old = {
    nodeEnv: process.env.NODE_ENV,
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
    fallbackUrl: process.env.UPSTASH_REDIS_REST_URL,
    fallbackToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    await assert.rejects(getState(), StorageUnavailableError);
  } finally {
    for (const [key, value] of [
      ['NODE_ENV', old.nodeEnv], ['KV_REST_API_URL', old.url], ['KV_REST_API_TOKEN', old.token],
      ['UPSTASH_REDIS_REST_URL', old.fallbackUrl], ['UPSTASH_REDIS_REST_TOKEN', old.fallbackToken],
    ]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
