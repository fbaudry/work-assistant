import { useCallback, useEffect, useRef, useState } from 'react';
import './openai-connection.css';

type AccountState = {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  account?: { email?: string; planType?: string };
  message?: string;
};

type ConnectionStatus = 'checking' | 'disconnected' | 'starting' | 'connecting' | 'error';

export default function OpenAIConnection({ onConnected }: { onConnected: () => void }) {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [message, setMessage] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const popup = useRef<Window | null>(null);
  const mounted = useRef(false);
  const starting = useRef(false);
  const flow = useRef(0);
  const connected = useRef(onConnected);

  useEffect(() => { connected.current = onConnected; }, [onConnected]);

  const refreshAccount = useCallback(async () => {
    if (starting.current) return;
    const currentFlow = flow.current;
    try {
      const response = await fetch('/api/openai/account', {
        cache: 'no-store', signal: AbortSignal.timeout(15000),
      });
      const account: AccountState = await response.json();
      if (!mounted.current || currentFlow !== flow.current) return;
      if (!response.ok && account.status !== 'error') throw new Error('Account unavailable');
      if (account.status === 'connected') {
        connected.current();
        return;
      }
      if (!['disconnected', 'connecting', 'error'].includes(account.status)) throw new Error('Invalid account state');
      setStatus(account.status);
      setMessage(account.status === 'error' ? account.message || 'La connexion a échoué. Tu peux réessayer.' : '');
      if (account.status === 'disconnected') setAuthUrl('');
    } catch {
      if (!mounted.current || currentFlow !== flow.current) return;
      setStatus('error');
      setMessage('Impossible de vérifier la connexion. Vérifie que Work Assistant est lancé, puis réessaie.');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshAccount();
    const onFocus = () => { void refreshAccount(); };
    window.addEventListener('focus', onFocus);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshAccount]);

  useEffect(() => {
    if (status !== 'connecting') return;
    const timer = window.setInterval(() => { void refreshAccount(); }, 2000);
    return () => window.clearInterval(timer);
  }, [status, refreshAccount]);

  async function startLogin() {
    if (starting.current) return;
    starting.current = true;
    flow.current += 1;
    const currentFlow = flow.current;
    setStatus('starting');
    setMessage('');
    setAuthUrl('');
    try {
      popup.current = window.open('about:blank', 'work-assistant-openai', 'popup,width=560,height=760');
      if (popup.current) popup.current.opener = null;
      const response = await fetch('/api/openai/login', {
        method: 'POST', headers: { 'X-Work-Assistant': '1' }, signal: AbortSignal.timeout(60000),
      });
      const result: { authUrl: string; message?: string } = await response.json();
      if (!response.ok) {
        if (popup.current && !popup.current.closed) popup.current.close();
        if (mounted.current && currentFlow === flow.current) {
          setStatus('error');
          setMessage(result.message || 'La connexion OpenAI n’a pas pu démarrer. Réessaie dans un instant.');
        }
        return;
      }
      const url = new URL(result.authUrl);
      if (url.protocol !== 'https:' || !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(url.hostname)) {
        throw new Error('Invalid login URL');
      }
      if (!mounted.current || currentFlow !== flow.current) return;
      setAuthUrl(url.href);
      setStatus('connecting');
      if (popup.current && !popup.current.closed) popup.current.location.href = url.href;
    } catch {
      if (popup.current && !popup.current.closed) popup.current.close();
      if (!mounted.current || currentFlow !== flow.current) return;
      setStatus('error');
      setMessage('La connexion OpenAI n’a pas pu démarrer. Réessaie dans un instant.');
    } finally {
      starting.current = false;
    }
  }

  async function cancelLogin() {
    setCancelling(true);
    flow.current += 1;
    try {
      const response = await fetch('/api/openai/cancel', {
        method: 'POST', headers: { 'X-Work-Assistant': '1' }, signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Cancellation unavailable');
      if (!mounted.current) return;
      if (popup.current && !popup.current.closed) popup.current.close();
      popup.current = null;
      setAuthUrl('');
      await refreshAccount();
    } catch {
      if (!mounted.current) return;
      setStatus('error');
      setMessage('Impossible d’annuler la connexion. Réessaie ou ferme la fenêtre de connexion OpenAI.');
    } finally {
      if (mounted.current) setCancelling(false);
    }
  }

  const pending = status === 'starting' || status === 'connecting';

  return (
    <div className="openai-onboarding">
      <header className="openai-onboarding-brand">
        <span className="brand-mark" aria-hidden="true">W</span>
        <span>Work Assistant</span>
      </header>

      <main className="openai-onboarding-main">
        <div className="openai-connection-mark" aria-hidden="true">W</div>
        <p className="openai-eyebrow">Bienvenue dans ton espace de travail</p>
        <h1>Connecte ton compte OpenAI</h1>
        <p className="openai-introduction">
          Relie ton compte personnel pour préparer le travail avec l’IA dans Work Assistant.
        </p>

        <div className="openai-connection-actions">
          {!pending && (
            <button
              type="button"
              className="openai-connect-button"
              disabled={status === 'checking'}
              onClick={startLogin}
            >
              {status === 'checking' ? 'Vérification de la connexion…' : 'Connecter mon compte OpenAI'}
              {status !== 'checking' && <span aria-hidden="true">↗</span>}
            </button>
          )}

          {pending && (
            <div className="openai-pending">
              <p role="status">
                {status === 'starting' ? 'Ouverture de la connexion OpenAI…' : 'Termine la connexion dans la fenêtre OpenAI.'}
              </p>
              {authUrl && (
                <a className="openai-login-link" href={authUrl} target="_blank" rel="noopener noreferrer">
                  Ouvrir la connexion OpenAI ↗
                </a>
              )}
              {status === 'connecting' && (
                <button type="button" className="openai-cancel-button" disabled={cancelling} onClick={cancelLogin}>
                  {cancelling ? 'Annulation…' : 'Annuler'}
                </button>
              )}
            </div>
          )}

          {status === 'error' && <p className="openai-connection-error" role="alert">{message}</p>}
        </div>

        <div className="openai-connection-details">
          <p>Tu te connectes directement chez OpenAI, via Codex. Ton mot de passe n’est jamais saisi dans Work Assistant.</p>
          <p>Cette session est propre à Work Assistant. Choisis ton compte et ton espace personnels.</p>
        </div>
      </main>

      <footer className="openai-onboarding-footer">Ton espace personnel · Sur ton Mac</footer>
    </div>
  );
}
