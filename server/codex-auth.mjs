import { spawn } from 'node:child_process';
import { mkdir, chmod } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { projectSources } from './project-sources.mjs';

export class ConnectionError extends Error {}

// Codex owns OAuth, token persistence and refresh. The browser receives only
// a connection state and public account information, never credentials.
export function createCodexAuth({ dataDirectory, launch = spawn, environment = process.env }) {
  let child;
  let ready;
  let nextId = 0;
  let login;
  let startingLogin;
  let loginError;
  const pending = new Map();

  function request(method, params, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new ConnectionError('Codex ne répond pas. Relance Work Assistant puis réessaie.'));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
        if (!error) return;
        clearTimeout(timer);
        pending.delete(id);
        reject(new ConnectionError('La connexion locale à Codex a été interrompue.'));
      });
    });
  }

  async function ensureStarted() {
    if (ready) return ready;
    ready = (async () => {
      await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
      await chmod(dataDirectory, 0o700);
      const env = {};
      for (const name of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT']) {
        if (environment[name]) env[name] = environment[name];
      }
      // This is Codex's documented data-directory setting, scoped to this child.
      env.CODEX_HOME = dataDirectory;
      const process = launch(environment.WORK_ASSISTANT_CODEX_BIN || 'codex', [
        'app-server', '--listen', 'stdio://',
        '-c', 'cli_auth_credentials_store="file"',
        '-c', 'analytics.enabled=false',
      ], { cwd: dataDirectory, env, stdio: ['pipe', 'pipe', 'ignore'] });
      child = process;
      const lines = createInterface({ input: process.stdout });
      lines.on('line', (line) => {
        let message;
        try { message = JSON.parse(line); } catch { return; }
        if (message.id !== undefined && pending.has(message.id)) {
          const call = pending.get(message.id);
          pending.delete(message.id);
          clearTimeout(call.timer);
          if (message.error) call.reject(new ConnectionError('Codex n’a pas pu effectuer la connexion. Réessaie.'));
          else call.resolve(message.result);
        } else if (message.method === 'account/login/completed' && message.params?.loginId === login?.loginId) {
          loginError = message.params.success ? null : 'La connexion OpenAI n’a pas abouti. Tu peux réessayer.';
          login = null;
        }
      });
      function stopped(error) {
        if (child !== process) return;
        lines.close();
        child = null;
        ready = null;
        login = null;
        const message = error?.code === 'ENOENT'
          ? 'Codex CLI est nécessaire. Installe-le puis relance Work Assistant.'
          : 'La connexion locale à Codex a été interrompue. Réessaie.';
        for (const call of pending.values()) {
          clearTimeout(call.timer);
          call.reject(new ConnectionError(message));
        }
        pending.clear();
      }
      process.on('error', stopped);
      process.stdin.on('error', stopped);
      process.on('exit', () => stopped());
      await request('initialize', {
        clientInfo: { name: 'work_assistant', title: 'Work Assistant', version: '0.1.0' },
        capabilities: { experimentalApi: true },
      });
      process.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
    })();
    try { await ready; }
    catch (error) {
      child?.kill();
      ready = null;
      throw error;
    }
  }

  async function account() {
    await ensureStarted();
    const result = await request('account/read', { refreshToken: false });
    if (result.account?.type === 'chatgpt') {
      return {
        status: 'connected',
        account: { email: result.account.email ?? undefined, planType: result.account.planType },
      };
    }
    if (login) return { status: 'connecting' };
    if (loginError) return { status: 'error', message: loginError };
    return { status: 'disconnected' };
  }

  async function startLogin() {
    if (login) return { authUrl: login.authUrl };
    if (startingLogin) return startingLogin;
    startingLogin = (async () => {
      await ensureStarted();
      loginError = null;
      const result = await request('account/login/start', {
        type: 'chatgpt', useHostedLoginSuccessPage: true, appBrand: 'chatgpt',
      });
      const url = URL.canParse(result.authUrl) ? new URL(result.authUrl) : null;
      if (result.type !== 'chatgpt' || !url || url.protocol !== 'https:' || url.username || url.password
        || !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(url.hostname)) {
        if (result.loginId) await request('account/login/cancel', { loginId: result.loginId });
        throw new ConnectionError('L’adresse de connexion OpenAI est invalide.');
      }
      login = { loginId: result.loginId, authUrl: url.href };
      return { authUrl: login.authUrl };
    })();
    try { return await startingLogin; }
    finally { startingLogin = null; }
  }

  async function cancelLogin() {
    if (startingLogin) await startingLogin;
    if (login) await request('account/login/cancel', { loginId: login.loginId });
    login = null;
    loginError = null;
    return account();
  }

  async function sources() {
    await ensureStarted();
    async function listApps() {
      const apps = [];
      const cursors = new Set();
      let cursor = null;
      do {
        const result = await request('app/list', { cursor, limit: 100, forceRefetch: cursor === null }, 50000);
        if (!Array.isArray(result.data)) throw new Error('Invalid app inventory');
        apps.push(...result.data);
        cursor = result.nextCursor;
        if (cursor != null && (typeof cursor !== 'string' || cursors.has(cursor) || cursors.size >= 100)) {
          throw new Error('Invalid app pagination');
        }
        cursors.add(cursor);
      } while (cursor != null);
      return apps;
    }
    const installed = await request('app/installed', { forceRefresh: true }, 50000).catch(() => null);
    const installedApps = Array.isArray(installed?.apps) ? installed.apps : [];
    const selected = installedApps.filter((app) => ['notion', 'linear', 'slack'].includes(app.runtimeName?.toLowerCase()));
    let apps = [];
    if (selected.length) {
      const metadata = await request('app/read', { appIds: selected.map((app) => app.id), includeTools: false }, 50000).catch(() => null);
      if (Array.isArray(metadata?.apps)) apps = metadata.apps;
    }
    let directoryFailed = false;
    if (new Set(selected.map((app) => app.runtimeName.toLowerCase())).size < 3) {
      try { apps.push(...await listApps()); }
      catch { directoryFailed = true; }
    }
    return {
      sources: projectSources(apps, installedApps).map((source) => directoryFailed && source.id === null
        ? { ...source, message: 'La vérification a échoué. Réessaie dans un instant.' } : source),
      checkedAt: new Date().toISOString(),
    };
  }

  return { account, startLogin, cancelLogin, sources, close() { child?.kill(); } };
}
