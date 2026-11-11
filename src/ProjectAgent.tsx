import { useEffect, useRef, useState } from 'react';
import './project-agent.css';

type AgentProject = {
  id: string;
  name: string;
  objective: string;
  collectedAt?: string;
  notes?: string;
  updatedAt?: string;
};
type AgentReport = {
  id: string;
  createdAt: string;
  contextAt: string;
  model: string | null;
  headline: string;
  summary: string;
  updates: {
    kind: 'progress' | 'attention' | 'decision';
    title: string;
    detail: string;
    evidence: { title: string; url: string }[];
  }[];
  nextAction: string;
};
type AgentState = {
  projectId: string;
  enabled: boolean;
  status: 'idle' | 'running' | 'paused' | 'error';
  startedAt: string | null;
  error: string | null;
  reports: AgentReport[];
};
type AgentAction = 'check' | 'run' | 'pause' | 'resume' | 'state';
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const updateLabels = { progress: 'Avancée', attention: 'À surveiller', decision: 'Ton avis' };

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormat.format(date) : 'Date indisponible';
}

export default function ProjectAgent({ project }: { project: AgentProject }) {
  const [state, setState] = useState<AgentState | null>(null);
  const [error, setError] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const projectRef = useRef(project);
  const requestRef = useRef<((action: AgentAction) => Promise<void>) | null>(null);
  projectRef.current = project;

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let current: AgentState | null = null;
    let lastCheck = 0;
    let busy = false;
    let requestVersion = 0;
    setState(null);
    setError('');
    setActionPending(false);

    async function request(action: AgentAction) {
      const background = action === 'check' || action === 'state';
      if (!active || (background && busy)) return;
      const version = ++requestVersion;
      controller?.abort();
      controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
      busy = true;
      if (!background) setActionPending(true);
      if (action === 'check') lastCheck = Date.now();
      try {
        const local = projectRef.current;
        const body = local.notes !== undefined ? { project: {
          id: local.id, name: local.name, objective: local.objective, notes: local.notes, updatedAt: local.updatedAt,
        } } : {};
        const response = await fetch('/api/agents/' + encodeURIComponent(project.id) + (action === 'state' ? '' : '/' + action), {
          method: action === 'state' ? 'GET' : 'POST',
          cache: 'no-store', signal,
          ...(action === 'state' ? {} : {
            headers: { 'Content-Type': 'application/json', 'X-Work-Assistant': '1' },
            body: JSON.stringify(action === 'pause' ? {} : body),
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : 'Le point de l’agent est indisponible. Réessaie.');
        if (result.projectId !== project.id || !['idle', 'running', 'paused', 'error'].includes(result.status)
          || !Array.isArray(result.reports)) throw new Error('Le point de l’agent n’a pas pu être lu. Réessaie.');
        if (!active || version !== requestVersion) return;
        current = result;
        setState(result);
        setError('');
      } catch (failure) {
        if (!active || version !== requestVersion) return;
        setError(failure instanceof Error && failure.name === 'Error'
          ? failure.message : 'L’agent ne répond pas pour le moment. Réessaie.');
      } finally {
        if (active && version === requestVersion) {
          busy = false;
          setActionPending(false);
        }
      }
    }

    requestRef.current = request;
    void request('check');
    const timer = window.setInterval(() => {
      if (Date.now() - lastCheck >= 30000) void request('check');
      else if (current?.status === 'running') void request('state');
    }, 2000);
    return () => {
      active = false;
      requestRef.current = null;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [project.id]);

  const latest = state?.reports[0];
  const failure = error || state?.error;
  const running = state?.status === 'running';
  const paused = state?.status === 'paused' || state?.enabled === false;
  const status = failure ? 'Erreur' : running ? 'Analyse en cours' : paused ? 'En pause' : latest ? 'Suivi actif' : 'Premier point';
  const scope = project.notes !== undefined ? 'Notes du projet' : 'Contexte collecté';

  return <section className={'project-agent' + (running ? ' is-running' : '')} aria-labelledby="project-agent-title">
    <div className="agent-heading">
      <span className="agent-symbol" aria-hidden="true">✦</span>
      <h2 id="project-agent-title">Agent du projet</h2>
      <span className={'agent-state' + (failure ? ' has-error' : '')} role="status"><span aria-hidden="true" />{status}</span>
    </div>
    {failure && <p className="agent-error" role="alert">{failure}</p>}
    {latest ? <div className="agent-latest">
      <h3>{latest.headline}</h3>
      <p className="agent-summary">{latest.summary}</p>
    </div> : <p className="agent-empty">{paused ? 'L’agent attend ta reprise pour préparer son premier point.' : 'Préparation du premier point : avancées, points à surveiller et décisions qui demandent ton avis.'}</p>}
    <div className="agent-footer">
      <div className="agent-actions">
        <button className="agent-run-button" disabled={actionPending || running || (!state && !failure)} onClick={() => void requestRef.current?.(paused ? 'resume' : 'run')}>
          {running ? 'Analyse…' : paused ? 'Reprendre l’agent' : failure ? 'Réessayer' : 'Faire un point'}
        </button>
        {!paused && state && <button className="agent-pause-button" disabled={actionPending} onClick={() => void requestRef.current?.('pause')}>Mettre en pause</button>}
      </div>
      {latest && <span className="agent-report-date">Point IA du <time dateTime={latest.createdAt}>{formatDate(latest.createdAt)}</time></span>}
    </div>
    {latest && <details className="agent-report-details">
      <summary>Voir le point et les sources <span aria-hidden="true">⌄</span></summary>
      <div className="agent-report-body">
        <p className="agent-full-summary">{latest.summary}</p>
        <ul className="agent-updates">
          {latest.updates.map((update, index) => <li key={latest.id + '-' + index}>
            <span className={'agent-update-kind ' + update.kind}>{updateLabels[update.kind]}</span>
            <h4>{update.title}</h4>
            <p>{update.detail}</p>
            {update.evidence.length > 0 && <ul className="agent-evidence" aria-label={'Sources : ' + update.title}>
              {update.evidence.map((evidence, evidenceIndex) => <li key={evidence.url + '-' + evidenceIndex}><a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.title} <span aria-hidden="true">↗</span></a></li>)}
            </ul>}
          </li>)}
        </ul>
        <div className="agent-next-action"><h4>Prochaine action proposée</h4><p>{latest.nextAction}</p></div>
        <p className="agent-context-date">{scope} du <time dateTime={latest.contextAt}>{formatDate(latest.contextAt)}</time>{latest.model && <> · {latest.model}</>}</p>
      </div>
    </details>}
    <p className="agent-scope">{scope} · {paused ? 'Suivi en pause' : 'Nouveau point quand le contexte évolue'}</p>
  </section>;
}
