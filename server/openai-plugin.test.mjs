import assert from 'node:assert/strict';
import test from 'node:test';
import { ConnectionError } from './codex-auth.mjs';
import { createAuthMiddleware } from './openai-plugin.mjs';

const origin = 'http://127.0.0.1:5173';
const allowedHeaders = { host: '127.0.0.1:5173', origin, 'x-work-assistant': '1', 'sec-fetch-site': 'same-origin' };

async function request({ method = 'GET', url = '/api/openai/account', headers = allowedHeaders, failure,
  status = 'disconnected', context = { projects: [] }, sources = [], contextFailure } = {}) {
  const calls = [];
  const auth = {
    async account() { calls.push('account'); if (failure) throw failure; return { status }; },
    async startLogin() { calls.push('startLogin'); return { authUrl: 'https://auth.openai.com/authorize' }; },
    async cancelLogin() { calls.push('cancelLogin'); return { status: 'disconnected' }; },
    async sources() { calls.push('sources'); return sources; },
  };
  const response = { statusCode: 200, headers: {}, next: false, calls,
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); },
  };
  const readContext = async () => {
    calls.push('readContext');
    if (contextFailure) throw contextFailure;
    return context;
  };
  await createAuthMiddleware(auth, origin, readContext)({ method, url, headers }, response, () => { response.next = true; });
  return response;
}

test('exposes the three intended account actions and prevents response caching', async () => {
  for (const [method, url, called, body] of [
    ['GET', '/api/openai/account', 'account', { status: 'disconnected' }],
    ['POST', '/api/openai/login', 'startLogin', { authUrl: 'https://auth.openai.com/authorize' }],
    ['POST', '/api/openai/cancel', 'cancelLogin', { status: 'disconnected' }],
  ]) {
    const result = await request({ method, url });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, body);
    assert.deepEqual(result.calls, [called]);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(result.headers['Content-Type'], 'application/json; charset=utf-8');
  }
});

for (const [name, headers] of [
  ['foreign Host', { ...allowedHeaders, host: 'attacker.example' }],
  ['missing Host', { ...allowedHeaders, host: undefined }],
  ['foreign Origin', { ...allowedHeaders, origin: 'https://attacker.example' }],
  ['different loopback origin', { ...allowedHeaders, origin: 'http://localhost:5173' }],
  ['cross-site fetch', { ...allowedHeaders, 'sec-fetch-site': 'cross-site' }],
  ['same-site fetch', { ...allowedHeaders, 'sec-fetch-site': 'same-site' }],
]) {
  test(`rejects requests with ${name} before accessing Codex`, async () => {
    const result = await request({ headers });
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, { message: 'Origine non autorisée.' });
    assert.deepEqual(result.calls, []);
  });
}

test('POST requires both the exact origin and the application header', async () => {
  for (const headers of [
    { host: allowedHeaders.host },
    { host: allowedHeaders.host, origin },
    { host: allowedHeaders.host, 'x-work-assistant': '1' },
    { ...allowedHeaders, 'x-work-assistant': 'wrong' },
  ]) {
    const result = await request({ method: 'POST', url: '/api/openai/login', headers });
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.calls, []);
  }
});

test('account reads allow same-host requests without Origin', async () => {
  const result = await request({ headers: { host: allowedHeaders.host, 'sec-fetch-site': 'none' } });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.calls, ['account']);
});

test('does not expose arbitrary RPC methods or allow the wrong HTTP method', async () => {
  for (const [method, url] of [
    ['POST', '/api/openai/rpc'],
    ['POST', '/api/openai/thread/start'],
    ['POST', '/api/openai/account'],
    ['GET', '/api/openai/login'],
    ['GET', '/api/openai/cancel'],
    ['DELETE', '/api/openai/account'],
  ]) {
    const result = await request({ method, url });
    assert.equal(result.statusCode, 404);
    assert.deepEqual(result.body, { message: 'Action inconnue.' });
    assert.deepEqual(result.calls, []);
  }
});

test('passes unrelated application routes through without invoking Codex', async () => {
  const result = await request({ url: '/src/App.tsx' });
  assert.equal(result.next, true);
  assert.deepEqual(result.calls, []);
  assert.deepEqual(result.headers, {});
});

test('does not expose internal exception details to the browser', async () => {
  const result = await request({ failure: new Error('RPC failed: token=private-token, path=/private/account/auth.json') });
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.status, 'error');
  assert.equal(typeof result.body.message, 'string');
  assert.ok(result.body.message.length > 0);
  assert.doesNotMatch(JSON.stringify(result.body), /private-token|\/private\/account|RPC failed/);
});

test('keeps actionable connection messages intended for the user', async () => {
  const message = 'Codex CLI est nécessaire. Installe-le puis relance Work Assistant.';
  const result = await request({ failure: new ConnectionError(message) });
  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, { status: 'error', message });
});

test('private context and connector inventory require a confirmed account before any read', async () => {
  for (const url of ['/api/context', '/api/openai/sources']) {
    for (const status of ['disconnected', 'connecting', 'error']) {
      const result = await request({ url, status });
      assert.equal(result.statusCode, 401);
      assert.deepEqual(result.body, { message: 'Connecte ton compte OpenAI pour continuer.' });
      assert.deepEqual(result.calls, ['account']);
    }
  }
});

test('foreign websites and hosts cannot read context even when an account is connected', async () => {
  for (const url of ['/api/context', '/api/openai/sources']) {
    for (const headers of [
      { ...allowedHeaders, host: 'attacker.example' },
      { ...allowedHeaders, origin: 'https://attacker.example' },
      { ...allowedHeaders, 'sec-fetch-site': 'cross-site' },
    ]) {
      const result = await request({ url, headers, status: 'connected' });
      assert.equal(result.statusCode, 403);
      assert.deepEqual(result.calls, []);
    }
  }
});

test('authenticated context reads preserve the snapshot and disable caching', async () => {
  const context = { projects: [{
    id: 'example-project', name: 'Projet de test', collectedAt: '2026-01-10T09:00:00.000Z',
    collectionMode: 'conversation', limitations: ['Une collecte ponctuelle.'],
    decisions: [{ title: 'Périmètre', detail: 'Un parcours seulement.', evidence: [{ title: 'Cadrage fictif', url: 'https://example.test/brief' }] }],
  }] };
  const result = await request({ url: '/api/context', status: 'connected', context });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.calls, ['account', 'readContext']);
  assert.deepEqual(result.body, context);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('authenticated source reads return the connector inventory without reading private context', async () => {
  const sources = [{ provider: 'notion', status: 'available' }, { provider: 'slack', status: 'unavailable' }];
  const result = await request({ url: '/api/openai/sources', status: 'connected', sources });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.calls, ['account', 'sources']);
  assert.deepEqual(result.body, sources);
});

test('failed context reads are reported as unavailable without exposing private file details', async () => {
  const result = await request({ url: '/api/context', status: 'connected', contextFailure: new Error('Invalid secret file /private/auth.json') });
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.status, 'error');
  assert.deepEqual(result.calls, ['account', 'readContext']);
  assert.equal(Object.hasOwn(result.body, 'projects'), false);
  assert.doesNotMatch(JSON.stringify(result.body), /secret|\/private\/auth/);
});

test('URL paths and query parameters cannot select another local file or trigger arbitrary reads', async () => {
  for (const url of [
    '/api/context?file=../../auth.json',
    '/api/context/../../.work-assistant/codex/auth.json',
    '/api/context/%2e%2e/auth.json',
    '/api/openai/sources/../../auth.json',
    '/api/openai/sources?file=../../auth.json',
    '/api/openai/rpc',
  ]) {
    const result = await request({ url, status: 'connected' });
    assert.deepEqual(result.calls, []);
    assert.ok(result.next || result.statusCode === 404);
  }
  for (const url of ['/api/context', '/api/openai/sources']) {
    const result = await request({ method: 'POST', url, status: 'connected' });
    assert.equal(result.statusCode, 404);
    assert.deepEqual(result.calls, []);
  }
});
