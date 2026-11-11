import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { createCodexAuth } from './codex-auth.mjs';

async function fixture(t, { environment = {}, loginResult } = {}) {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'work-assistant-auth-test-'));
  const commands = [];
  const launches = [];
  const state = {
    account: { account: null },
    login: loginResult ?? { type: 'chatgpt', loginId: 'login-test', authUrl: 'https://auth.openai.com/authorize?state=test' },
    appPages: { '': { data: [], nextCursor: null } },
    installed: { apps: [] },
    metadata: { apps: [] },
    thread: { thread: { id: 'summary-thread' }, model: 'account-default-model' },
    turn: { turn: { id: 'summary-turn', status: 'inProgress', items: [] } },
  };
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      const message = JSON.parse(chunk.toString());
      commands.push(message);
      if (message.id !== undefined && message.method) {
        const result = message.method === 'account/read' ? state.account
          : message.method === 'account/login/start' ? state.login
            : message.method === 'app/list' ? state.appPages[message.params.cursor ?? '']
              : message.method === 'app/installed' ? state.installed
                : message.method === 'app/read' ? state.metadata
                  : message.method === 'thread/start' ? state.thread
                    : message.method === 'turn/start' ? state.turn
            : {};
        queueMicrotask(() => {
          child.stdout.write(`${JSON.stringify({ id: message.id, result })}\n`);
          state.afterRequest?.(message);
        });
      }
      callback();
    },
  });
  child.kill = () => { child.emit('exit', 0); };
  const auth = createCodexAuth({
    dataDirectory,
    environment,
    launch(...args) { launches.push(args); return child; },
  });
  t.after(async () => {
    auth.close();
    child.stdin.destroy();
    child.stdout.destroy();
    await rm(dataDirectory, { recursive: true, force: true });
  });
  return {
    auth, state, commands, launches, dataDirectory,
    notify(params) { child.stdout.write(`${JSON.stringify({ method: 'account/login/completed', params })}\n`); },
    server(message) { child.stdout.write(`${JSON.stringify(message)}\n`); },
  };
}

test('launches an isolated Codex process without inheriting credentials or thread context', async (t) => {
  const { auth, launches, commands, dataDirectory } = await fixture(t, { environment: {
    PATH: '/test/bin', HOME: '/test/home', USER: 'test-user', LANG: 'fr_FR.UTF-8',
    CODEX_HOME: '/existing/codex', CODEX_THREAD_ID: 'existing-thread',
    OPENAI_API_KEY: 'secret-api-key', OPENAI_BASE_URL: 'https://other.example',
    GITHUB_TOKEN: 'secret-github-token', AWS_SECRET_ACCESS_KEY: 'secret-aws-key',
    WORK_ASSISTANT_CODEX_BIN: '/test/bin/codex',
  } });

  assert.deepEqual(await auth.account(), { status: 'disconnected' });
  assert.equal(launches.length, 1);
  const [binary, args, options] = launches[0];
  assert.equal(binary, '/test/bin/codex');
  assert.deepEqual(args, ['app-server', '--listen', 'stdio://', '-c', 'cli_auth_credentials_store="file"', '-c', 'analytics.enabled=false']);
  assert.deepEqual(options, {
    cwd: dataDirectory,
    env: { PATH: '/test/bin', HOME: '/test/home', USER: 'test-user', LANG: 'fr_FR.UTF-8', CODEX_HOME: dataDirectory },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  assert.equal((await stat(dataDirectory)).mode & 0o777, 0o700);
  assert.deepEqual(commands.find((command) => command.method === 'initialize').params.capabilities, { experimentalApi: true });
});

test('returns only public ChatGPT account fields, never tokens from the RPC payload', async (t) => {
  const { auth, state } = await fixture(t);
  state.account = {
    accessToken: 'top-level-secret',
    account: {
      type: 'chatgpt', email: 'personal@example.test', planType: 'plus',
      accessToken: 'account-secret', refreshToken: 'refresh-secret', idToken: 'id-secret',
      organizationId: 'private-org',
    },
  };
  assert.deepEqual(await auth.account(), {
    status: 'connected', account: { email: 'personal@example.test', planType: 'plus' },
  });
  state.account = { account: { type: 'apiKey', apiKey: 'api-key-secret' } };
  assert.deepEqual(await auth.account(), { status: 'disconnected' });
});

test('coalesces login requests, tracks pending state and cancels the current login', async (t) => {
  const { auth, commands } = await fixture(t);
  const expected = { authUrl: 'https://auth.openai.com/authorize?state=test' };
  assert.deepEqual(await Promise.all([auth.startLogin(), auth.startLogin()]), [expected, expected]);
  assert.deepEqual(await auth.startLogin(), expected);
  assert.equal(commands.filter((message) => message.method === 'account/login/start').length, 1);
  assert.deepEqual(await auth.account(), { status: 'connecting' });
  assert.deepEqual(await auth.cancelLogin(), { status: 'disconnected' });
  assert.deepEqual(commands.find((message) => message.method === 'account/login/cancel').params, { loginId: 'login-test' });
  assert.deepEqual(await auth.account(), { status: 'disconnected' });
});

test('ignores unrelated notifications and confirms successful login through account/read', async (t) => {
  const { auth, state, notify } = await fixture(t);
  await auth.startLogin();
  notify({ loginId: 'someone-else', success: true });
  assert.deepEqual(await auth.account(), { status: 'connecting' });
  notify({ loginId: 'login-test', success: true });
  assert.deepEqual(await auth.account(), { status: 'disconnected' });
  state.account = { account: { type: 'chatgpt', email: 'personal@example.test', planType: 'pro' } };
  assert.deepEqual(await auth.account(), {
    status: 'connected', account: { email: 'personal@example.test', planType: 'pro' },
  });
});

test('failed login notification returns a safe error and cancellation resets it', async (t) => {
  const { auth, notify } = await fixture(t);
  await auth.startLogin();
  notify({ loginId: 'login-test', success: false, error: 'private OAuth details: secret-token' });
  assert.deepEqual(await auth.account(), {
    status: 'error', message: 'La connexion OpenAI n’a pas abouti. Tu peux réessayer.',
  });
  assert.deepEqual(await auth.cancelLogin(), { status: 'disconnected' });
});

for (const [name, authUrl, type] of [
  ['foreign host', 'https://example.test/login', 'chatgpt'],
  ['lookalike host', 'https://auth.openai.com.example.test/login', 'chatgpt'],
  ['unencrypted URL', 'http://auth.openai.com/login', 'chatgpt'],
  ['embedded credentials', 'https://user:password@auth.openai.com/login', 'chatgpt'],
  ['different account type', 'https://auth.openai.com/login', 'apiKey'],
  ['malformed URL', 'not-a-url', 'chatgpt'],
]) {
  test(`rejects and cancels login with ${name}`, async (t) => {
    const { auth, commands } = await fixture(t, { loginResult: { type, loginId: 'invalid-login', authUrl } });
    await assert.rejects(auth.startLogin(), { message: 'L’adresse de connexion OpenAI est invalide.' });
    assert.deepEqual(commands.find((message) => message.method === 'account/login/cancel')?.params, { loginId: 'invalid-login' });
    assert.deepEqual(await auth.account(), { status: 'disconnected' });
  });
}

test('source discovery follows pagination and exposes only the three selected providers', async (t) => {
  const { auth, state, commands } = await fixture(t);
  state.appPages = {
    '': { data: [
      { id: 'app-notion', name: 'Notion', isAccessible: true, isEnabled: true, installUrl: 'https://chatgpt.com/apps/notion/app-notion', token: 'secret' },
      { id: 'app-unrelated', name: 'Unrelated private provider', isAccessible: true, isEnabled: true },
    ], nextCursor: 'page-two' },
    'page-two': { data: [
      { id: 'app-linear', name: 'Linear', isAccessible: false, isEnabled: true, installUrl: 'https://chatgpt.com/apps/linear/app-linear' },
      { id: 'app-slack', name: 'Slack', isAccessible: true, isEnabled: true, installUrl: 'https://chatgpt.com/apps/slack/app-slack' },
    ], nextCursor: null },
  };
  state.installed = { apps: [
    { id: 'app-notion', enabled: true, callable: true },
    { id: 'app-slack', enabled: true, callable: false },
  ] };
  const result = await auth.sources();
  assert.deepEqual(result.sources.map(({ provider, id, status, installUrl }) => ({ provider, id, status, installUrl })), [
    { provider: 'notion', id: 'app-notion', status: 'available', installUrl: 'https://chatgpt.com/apps/notion/app-notion' },
    { provider: 'linear', id: 'app-linear', status: 'not_connected', installUrl: 'https://chatgpt.com/apps/linear/app-linear' },
    { provider: 'slack', id: 'app-slack', status: 'unavailable', installUrl: 'https://chatgpt.com/apps/slack/app-slack' },
  ]);
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
  assert.doesNotMatch(JSON.stringify(result), /secret|Unrelated|app-unrelated/);
  assert.deepEqual(commands.filter(({ method }) => method === 'app/list').map(({ params }) => params), [
    { cursor: null, limit: 100, forceRefetch: true },
    { cursor: 'page-two', limit: 100, forceRefetch: false },
  ]);
  assert.deepEqual(commands.find(({ method }) => method === 'app/installed').params, { forceRefresh: true });
});

test('a broken paginated source inventory is unavailable rather than disconnected', async (t) => {
  const { auth, state, commands } = await fixture(t);
  state.appPages = {
    '': { data: [], nextCursor: 'repeated' },
    repeated: { data: [], nextCursor: 'repeated' },
  };
  const result = await auth.sources();
  assert.deepEqual(result.sources.map(({ provider, status }) => ({ provider, status })), [
    { provider: 'notion', status: 'unavailable' },
    { provider: 'linear', status: 'unavailable' },
    { provider: 'slack', status: 'unavailable' },
  ]);
  assert.equal(commands.filter(({ method }) => method === 'app/list').length, 2);
  assert.doesNotMatch(JSON.stringify(result), /Invalid app pagination/);
});

test('keeps official connection links when runtime availability cannot be verified', async (t) => {
  const { auth, state } = await fixture(t);
  state.appPages = { '': { data: [
    { id: 'notion', name: 'Notion', isAccessible: true, isEnabled: true, installUrl: 'https://chatgpt.com/apps/notion/notion' },
  ], nextCursor: null } };
  state.installed = { unexpected: 'private response details' };
  const { sources } = await auth.sources();
  assert.equal(sources[0].status, 'unavailable');
  assert.equal(sources[0].installUrl, 'https://chatgpt.com/apps/notion/notion');
  assert.doesNotMatch(JSON.stringify(sources), /private response details/);
});

test('reads installed provider metadata without scanning the public app directory', async (t) => {
  const { auth, state, commands } = await fixture(t);
  state.installed = { apps: [
    { id: 'connected-notion', runtimeName: 'Notion', enabled: true, callable: true },
    { id: 'connected-linear', runtimeName: 'Linear', enabled: true, callable: true },
    { id: 'connected-slack', runtimeName: 'Slack', enabled: true, callable: true },
    { id: 'unrelated', runtimeName: 'Private provider', enabled: true, callable: true },
  ] };
  state.metadata = { apps: [
    { id: 'connected-notion', name: 'Notion', installUrl: 'https://chatgpt.com/apps/notion/connected-notion' },
  ] };
  const { sources } = await auth.sources();
  assert.deepEqual(sources.map(({ provider, status }) => ({ provider, status })), [
    { provider: 'notion', status: 'available' },
    { provider: 'linear', status: 'available' },
    { provider: 'slack', status: 'available' },
  ]);
  assert.equal(sources[0].installUrl, 'https://chatgpt.com/apps/notion/connected-notion');
  assert.equal(commands.some(({ method }) => method === 'app/list'), false);
  assert.deepEqual(commands.find(({ method }) => method === 'app/read').params, {
    appIds: ['connected-notion', 'connected-linear', 'connected-slack'], includeTools: false,
  });
  assert.doesNotMatch(JSON.stringify(sources), /unrelated|Private provider/);
});

test('project updates use an isolated ephemeral thread and return only its completed final answer', async (t) => {
  const { auth, state, commands, server, dataDirectory } = await fixture(t);
  const outputSchema = { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false };
  state.afterRequest = ({ method }) => {
    if (method !== 'turn/start') return;
    server({ method: 'item/completed', params: { threadId: 'another-thread', turnId: 'summary-turn', item: { type: 'agentMessage', phase: 'final_answer', text: 'Unrelated private content' } } });
    server({ method: 'item/completed', params: { threadId: 'summary-thread', turnId: 'another-turn', item: { type: 'agentMessage', phase: 'final_answer', text: 'Earlier result' } } });
    server({ method: 'item/completed', params: { threadId: 'summary-thread', turnId: 'summary-turn', item: { type: 'agentMessage', phase: 'commentary', text: 'Still working' } } });
    server({ method: 'item/completed', params: { threadId: 'summary-thread', turnId: 'summary-turn', item: { type: 'agentMessage', phase: 'final_answer', text: '{"summary":"Le cadrage fictif avance."}' } } });
    server({ method: 'turn/completed', params: { threadId: 'summary-thread', turn: { id: 'summary-turn', status: 'completed' } } });
  };
  assert.deepEqual(await auth.generateProjectUpdate({ prompt: 'Contexte fictif.', outputSchema }), {
    text: '{"summary":"Le cadrage fictif avance."}', model: 'account-default-model',
  });
  const start = commands.find(({ method }) => method === 'thread/start').params;
  assert.equal(start.ephemeral, true);
  assert.equal(start.cwd, dataDirectory);
  assert.deepEqual(start.environments, []);
  assert.deepEqual(start.dynamicTools, []);
  assert.deepEqual(start.runtimeWorkspaceRoots, []);
  assert.equal(start.sandbox, 'read-only');
  assert.equal(start.approvalPolicy, 'never');
  assert.equal(start.config.web_search, 'disabled');
  for (const name of ['shell_tool', 'apps', 'plugins', 'multi_agent', 'browser_use', 'computer_use', 'image_generation', 'hooks']) {
    assert.equal(start.config['features.' + name], false);
  }
  assert.deepEqual(commands.find(({ method }) => method === 'turn/start').params, {
    threadId: 'summary-thread', input: [{ type: 'text', text: 'Contexte fictif.' }], environments: [], effort: 'low', outputSchema,
  });
  assert.deepEqual(commands.find(({ method }) => method === 'thread/unsubscribe').params, { threadId: 'summary-thread' });
});

test('failed, interrupted and incomplete project turns cannot publish partial output or private errors', async (t) => {
  for (const status of ['failed', 'interrupted', 'completed']) {
    const { auth, state, server } = await fixture(t);
    state.afterRequest = ({ method }) => {
      if (method !== 'turn/start') return;
      server({ method: 'item/completed', params: { threadId: 'summary-thread', turnId: 'summary-turn', item: { type: 'agentMessage', phase: 'commentary', text: 'Unfinished content' } } });
      if (status !== 'completed') server({ method: 'item/completed', params: { threadId: 'summary-thread', turnId: 'summary-turn', item: { type: 'agentMessage', phase: 'final_answer', text: 'Unfinished final content' } } });
      server({ method: 'turn/completed', params: { threadId: 'summary-thread', turn: { id: 'summary-turn', status, error: { message: 'Secret provider error' } } } });
    };
    await assert.rejects(auth.generateProjectUpdate({ prompt: 'Contexte fictif.', outputSchema: {} }), (error) => {
      assert.doesNotMatch(error.message, /Secret|Unfinished/);
      if (status === 'interrupted') assert.equal(error.name, 'AbortError');
      return true;
    });
  }
});

test('abort stops a running project turn and releases its ephemeral thread', async (t) => {
  const { auth, state, commands } = await fixture(t);
  const controller = new AbortController();
  state.afterRequest = ({ method }) => { if (method === 'turn/start') controller.abort(); };
  await assert.rejects(auth.generateProjectUpdate({ prompt: 'Contexte fictif.', outputSchema: {}, signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(commands.find(({ method }) => method === 'turn/interrupt').params, { threadId: 'summary-thread', turnId: 'summary-turn' });
  assert.deepEqual(commands.find(({ method }) => method === 'thread/unsubscribe').params, { threadId: 'summary-thread' });
});

test('timed-out project analysis is interrupted and never publishes a report', async (t) => {
  const { auth, state, commands } = await fixture(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  state.afterRequest = ({ method }) => { if (method === 'turn/start') t.mock.timers.tick(180000); };
  await assert.rejects(auth.generateProjectUpdate({ prompt: 'Contexte fictif.', outputSchema: {} }), /trop de temps/);
  assert.deepEqual(commands.find(({ method }) => method === 'turn/interrupt').params, { threadId: 'summary-thread', turnId: 'summary-turn' });
  assert.deepEqual(commands.find(({ method }) => method === 'thread/unsubscribe').params, { threadId: 'summary-thread' });
});

test('unexpected server tool requests are rejected and cannot be confused with RPC replies', async (t) => {
  const { auth, state, commands, server } = await fixture(t);
  state.afterRequest = ({ method }) => {
    if (method !== 'turn/start') return;
    server({ id: 300, method: 'item/commandExecution/requestApproval', params: { threadId: 'summary-thread', turnId: 'summary-turn', command: 'private command' } });
  };
  await assert.rejects(auth.generateProjectUpdate({ prompt: 'Contexte fictif.', outputSchema: {} }), /action non autorisée/);
  assert.deepEqual(commands.find(({ id }) => id === 300), {
    id: 300, error: { code: -32601, message: 'Tool access is disabled for project updates.' },
  });
  assert.ok(commands.some(({ method }) => method === 'turn/interrupt'));
});

test('closing Codex rejects an active project update instead of leaving it pending', async (t) => {
  const { auth, state } = await fixture(t);
  state.afterRequest = ({ method }) => { if (method === 'turn/start') auth.close(); };
  await assert.rejects(auth.generateProjectUpdate({ prompt: 'Contexte fictif.', outputSchema: {} }), /connexion locale/);
});
