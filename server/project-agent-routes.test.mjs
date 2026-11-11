import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createAuthMiddleware } from './openai-plugin.mjs';

const origin = 'http://127.0.0.1:5173';
const allowedHeaders = { host: '127.0.0.1:5173', origin, 'x-work-assistant': '1', 'sec-fetch-site': 'same-origin' };

async function request({ method = 'GET', url = '/api/agents/example-project', headers = allowedHeaders,
  body = '', status = 'connected', failure } = {}) {
  const calls = [];
  const auth = { async account() { calls.push(['account']); return { status }; } };
  const agents = {
    heartbeat() { calls.push(['heartbeat']); },
    async state(id) { calls.push(['state', id]); if (failure) throw failure; return { projectId: id, status: 'idle', reports: [] }; },
    async act(id, action, project) { calls.push(['act', id, action, project]); return { projectId: id, status: 'running', reports: [] }; },
  };
  const response = { statusCode: 200, headers: {}, calls,
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
  const req = Object.assign(Readable.from([Buffer.from(body)]), { method, url, headers });
  await createAuthMiddleware(auth, origin, undefined, agents)(req, response, () => { response.next = true; });
  return response;
}

test('authenticated agent reads and actions forward only the selected project and disable caching', async () => {
  const state = await request();
  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.calls, [['account'], ['state', 'example-project']]);
  assert.deepEqual(state.body, { projectId: 'example-project', status: 'idle', reports: [] });
  assert.equal(state.headers['Cache-Control'], 'no-store');
  assert.equal(state.headers['X-Content-Type-Options'], 'nosniff');
  const project = { id: 'example-project', name: 'Projet fictif', objective: '', notes: 'Notes de démonstration.', updatedAt: '2026-01-10T09:00:00.000Z' };
  for (const action of ['check', 'run', 'pause', 'resume']) {
    const result = await request({ method: 'POST', url: '/api/agents/example-project/' + action, body: JSON.stringify({ project }) });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.calls, [['account'], ['act', 'example-project', action, project]]);
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
});

test('agent reads and actions reject foreign hosts and origins before account or agent access', async () => {
  for (const [method, url] of [['GET', '/api/agents/example-project'], ['POST', '/api/agents/example-project/run']]) {
    for (const headers of [
      { ...allowedHeaders, host: 'example.test' },
      { ...allowedHeaders, origin: 'https://example.test' },
      { ...allowedHeaders, 'sec-fetch-site': 'cross-site' },
      { ...allowedHeaders, 'sec-fetch-site': 'same-site' },
    ]) {
      const result = await request({ method, url, headers });
      assert.equal(result.statusCode, 403);
      assert.deepEqual(result.calls, []);
    }
  }
  for (const headers of [
    { host: allowedHeaders.host, origin },
    { host: allowedHeaders.host, 'x-work-assistant': '1' },
  ]) {
    const result = await request({ method: 'POST', url: '/api/agents/example-project/pause', headers });
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.calls, []);
  }
});

test('agent state and generation require a connected account', async () => {
  for (const status of ['disconnected', 'connecting', 'error']) {
    for (const [method, url] of [['GET', '/api/agents/example-project'], ['POST', '/api/agents/example-project/check']]) {
      const result = await request({ method, url, status });
      assert.equal(result.statusCode, 401);
      assert.deepEqual(result.calls, [['account']]);
    }
  }
});

test('the app heartbeat requires an authenticated same-origin POST before renewing agent activity', async () => {
  const valid = await request({ method: 'POST', url: '/api/agents/heartbeat' });
  assert.equal(valid.statusCode, 200);
  assert.deepEqual(valid.calls, [['account'], ['heartbeat']]);
  for (const [status, headers, expected] of [
    ['disconnected', allowedHeaders, 401],
    ['connected', { ...allowedHeaders, origin: 'https://example.test' }, 403],
    ['connected', { host: allowedHeaders.host }, 403],
  ]) {
    const denied = await request({ method: 'POST', url: '/api/agents/heartbeat', status, headers });
    assert.equal(denied.statusCode, expected);
    assert.equal(denied.calls.some(([method]) => method === 'heartbeat'), false);
  }
});

test('agent routes reject invalid actions, methods and project paths before accessing account state', async () => {
  for (const [method, url] of [
    ['GET', '/api/agents/example-project/run'],
    ['POST', '/api/agents/example-project'],
    ['DELETE', '/api/agents/example-project'],
    ['POST', '/api/agents/example-project/delete'],
    ['POST', '/api/agents/../run'],
    ['POST', '/api/agents/%2e%2e/run'],
    ['POST', '/api/agents/example-project/run?file=other'],
    ['GET', '/api/agents/example-project/extra/path'],
    ['POST', '/api/agents/' + 'a'.repeat(121) + '/run'],
  ]) {
    const result = await request({ method, url });
    assert.equal(result.statusCode, 404);
    assert.deepEqual(result.calls, []);
  }
});

test('malformed and oversized bodies never trigger an agent action', async () => {
  for (const body of ['{', 'null', '[]', '"text"', 'true', '123']) {
    const result = await request({ method: 'POST', url: '/api/agents/example-project/run', body });
    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.calls, [['account']]);
  }
  const oversized = await request({ method: 'POST', url: '/api/agents/example-project/run',
    body: JSON.stringify({ project: { notes: 'é'.repeat(128000) } }) });
  assert.equal(oversized.statusCode, 413);
  assert.deepEqual(oversized.calls, [['account']]);
  const empty = await request({ method: 'POST', url: '/api/agents/example-project/check' });
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(empty.calls, [['account'], ['act', 'example-project', 'check', undefined]]);
});

test('agent failures hide internal paths and account secrets', async () => {
  const result = await request({ failure: new Error('Cannot read /private/auth.json with token=example-secret') });
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.status, 'error');
  assert.doesNotMatch(JSON.stringify(result.body), /private|auth\.json|example-secret/);
});
