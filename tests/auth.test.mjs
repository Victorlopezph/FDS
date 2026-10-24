import assert from 'node:assert/strict';
import test from 'node:test';
import { authConfigurationReady, getSessionUser, makeSession } from '../lib/auth.js';

function withEnvironment(updates, callback) {
  const previous = new Map(Object.keys(updates).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) delete process.env[key]; else process.env[key] = value;
  }
  try { return callback(); } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

function sessionRequest(cookieValue) {
  return new Request('https://team-lab.invalid/api/state', { headers: { cookie: `ronda_session=${encodeURIComponent(cookieValue)}` } });
}

test('production refuses missing or provider-reused signing secrets', () => {
  withEnvironment({ NODE_ENV: 'production', AUTH_SECRET: null, GOOGLE_CLIENT_SECRET: 'provider-secret-long-enough-to-be-invalid' }, () => {
    assert.equal(authConfigurationReady(), false);
    assert.equal(getSessionUser(sessionRequest('anything.invalid')), null);
    assert.throws(() => makeSession({ id: 'guest_123', name: 'Ari', email: null, picture: null }), /AUTH_SECRET/);
  });
  withEnvironment({ NODE_ENV: 'production', AUTH_SECRET: 'provider-secret-long-enough-to-be-invalid', GOOGLE_CLIENT_SECRET: 'provider-secret-long-enough-to-be-invalid' }, () => {
    assert.equal(authConfigurationReady(), false);
  });
});

test('rejects short secrets but keeps a process-local development guest secret', () => {
  withEnvironment({ NODE_ENV: 'production', AUTH_SECRET: 'short' }, () => {
    assert.equal(authConfigurationReady(), false);
  });
  withEnvironment({ NODE_ENV: 'development', AUTH_SECRET: null }, () => {
    assert.equal(authConfigurationReady(), true);
    const session = makeSession({ id: 'guest_abc123', name: 'Ari', email: null, picture: null });
    assert.equal(getSessionUser(sessionRequest(session)).id, 'guest_abc123');
  });
});

test('rejects tampered payloads, forged user IDs, malformed cookies, and expired sessions', () => {
  withEnvironment({ NODE_ENV: 'test', AUTH_SECRET: 'test-only-secret-value-with-32-bytes-minimum' }, () => {
    const valid = makeSession({ id: 'guest_abc123', name: 'Ari', email: null, picture: null });
    const [payload, signature] = valid.split('.');
    const changedPayload = Buffer.from(JSON.stringify({ id: 'guest_victim', name: 'Ari', email: null, picture: null, iat: Date.now(), exp: Date.now() + 60_000 })).toString('base64url');
    assert.equal(getSessionUser(sessionRequest(`${changedPayload}.${signature}`)), null);
    assert.equal(getSessionUser(sessionRequest(`${payload.slice(0, -1)}x.${signature}`)), null);
    assert.equal(getSessionUser(sessionRequest('malformed%cookie')), null);

    const originalNow = Date.now;
    try {
      Date.now = () => 1_000;
      const expiresSoon = makeSession({ id: 'guest_abc123', name: 'Ari', email: null, picture: null });
      Date.now = () => 31 * 24 * 60 * 60 * 1000 + 1_001;
      assert.equal(getSessionUser(sessionRequest(expiresSoon)), null);
    } finally {
      Date.now = originalNow;
    }
  });
});
