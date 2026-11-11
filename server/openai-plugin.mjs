import { resolve } from 'node:path';
import { createCodexAuth, ConnectionError } from './codex-auth.mjs';

export function createAuthMiddleware(auth, origin) {
  const host = new URL(origin).host;
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/openai/')) return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    function respond(status, body) { res.statusCode = status; res.end(JSON.stringify(body)); }

    // Local OAuth control must not be callable by arbitrary websites or hosts.
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== origin)
      || (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) {
      return respond(403, { message: 'Origine non autorisée.' });
    }
    if (req.method === 'POST' && (req.headers.origin !== origin || req.headers['x-work-assistant'] !== '1')) {
      return respond(403, { message: 'Origine non autorisée.' });
    }

    try {
      if (req.method === 'GET' && req.url === '/api/openai/account') return respond(200, await auth.account());
      if (req.method === 'POST' && req.url === '/api/openai/login') return respond(200, await auth.startLogin());
      if (req.method === 'POST' && req.url === '/api/openai/cancel') return respond(200, await auth.cancelLogin());
      return respond(404, { message: 'Action inconnue.' });
    } catch (error) {
      return respond(503, {
        status: 'error',
        message: error instanceof ConnectionError ? error.message : 'La connexion OpenAI est indisponible. Réessaie dans un instant.',
      });
    }
  };
}

export function openAIAuthPlugin() {
  return {
    name: 'work-assistant-openai-auth',
    apply: 'serve',
    configureServer(server) {
      const auth = createCodexAuth({ dataDirectory: resolve(server.config.root, '.work-assistant/codex') });
      const port = server.config.server.port ?? 5173;
      server.middlewares.use(createAuthMiddleware(auth, `http://127.0.0.1:${port}`));
      server.httpServer?.once('close', () => auth.close());
    },
  };
}
