import { useEffect, useState } from 'react';
import './source-context.css';

type Provider = 'notion' | 'linear' | 'slack';
type Evidence = { title: string; url: string };

export type ProjectContext = {
  id: string;
  name: string;
  objective: string;
  collectedAt: string;
  collectionMode: 'conversation';
  summary: string;
  decisions: { title: string; detail: string; evidence: Evidence[] }[];
  questions: { title: string; detail: string; evidence: Evidence[] }[];
  coverage: { provider: Provider; label: string; detail: string; complete: boolean }[];
  sources: {
    id: string;
    provider: Provider;
    title: string;
    url: string;
    updatedAt: string | null;
    summary: string;
    kind: string;
  }[];
  limitations: string[];
};

type SourceAccess = {
  provider: Provider;
  name: string;
  status: 'available' | 'not_connected' | 'disabled' | 'unavailable';
  installUrl?: string;
  message?: string;
};

const providers = [
  { id: 'notion', name: 'Notion', mark: 'N' },
  { id: 'linear', name: 'Linear', mark: 'L' },
  { id: 'slack', name: 'Slack', mark: '#' },
] as const;
const accessLabels = {
  available: 'Accès disponible',
  not_connected: 'À connecter',
  disabled: 'Désactivé',
  unavailable: 'Accès indisponible',
};
const sourceKindLabels: Record<string, string> = {
  page: 'Page', issue: 'Ticket', project: 'Projet', channel: 'Canal', thread: 'Discussion', document: 'Document',
};
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormat.format(date) : 'Date indisponible';
}

export default function SourceContext({ project }: { project: ProjectContext }) {
  const [tab, setTab] = useState<'summary' | 'sources'>('sources');
  const [filter, setFilter] = useState<Provider | 'all'>('all');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(12);
  const [access, setAccess] = useState<SourceAccess[]>([]);
  const [checking, setChecking] = useState(true);
  const [checkedAt, setCheckedAt] = useState('');
  const [accessError, setAccessError] = useState('');
  const [checkVersion, setCheckVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    setAccessError('');
    async function checkAccess() {
      try {
        const response = await fetch('/api/openai/sources', {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]),
        });
        if (!response.ok) throw new Error('Source access unavailable');
        const result: { sources: SourceAccess[]; checkedAt: string } = await response.json();
        if (!Array.isArray(result.sources) || typeof result.checkedAt !== 'string'
          || !result.sources.every((source) => source && providers.some((provider) => provider.id === source.provider)
            && Object.hasOwn(accessLabels, source.status))) throw new Error('Invalid source access');
        if (controller.signal.aborted) return;
        setAccess(result.sources);
        setCheckedAt(result.checkedAt);
      } catch {
        if (controller.signal.aborted) return;
        setAccess([]);
        setCheckedAt('');
        setAccessError('Impossible de vérifier les accès de Work Assistant. Le contexte déjà collecté reste disponible.');
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    }
    void checkAccess();
    return () => controller.abort();
  }, [checkVersion]);

  const query = search.trim().toLocaleLowerCase('fr-FR');
  const sources = project.sources.filter((source) => (filter === 'all' || source.provider === filter)
    && (!query || `${source.title} ${source.summary}`.toLocaleLowerCase('fr-FR').includes(query)));

  return (
    <section className="page context-page">
      <header className="context-header">
        <p className="context-eyebrow">Contexte du projet</p>
        <h1>{project.name}</h1>
        <p className="page-description">{project.objective}</p>
        <div className="context-collection">
          <span className="status-label">Collecte ponctuelle</span>
          <time dateTime={project.collectedAt}>{formatDate(project.collectedAt)}</time>
        </div>
        <p className="context-collection-note">Informations collectées dans notre conversation, conservées sur ce Mac. Elles ne sont pas actualisées automatiquement.</p>
      </header>

      <nav className="tabs context-tabs" aria-label="Vues du contexte">
        <button className={tab === 'summary' ? 'tab active' : 'tab'} aria-current={tab === 'summary' ? 'page' : undefined} onClick={() => setTab('summary')}>Synthèse</button>
        <button className={tab === 'sources' ? 'tab active' : 'tab'} aria-current={tab === 'sources' ? 'page' : undefined} onClick={() => setTab('sources')}>Sources ({project.sources.length})</button>
      </nav>

      {tab === 'summary' && <>
      <section className="context-section" aria-labelledby="context-summary-title">
        <h2 id="context-summary-title">Où en est le projet ?</h2>
        <p className="context-summary">{project.summary}</p>
      </section>

      {project.decisions.length > 0 && <section className="context-section" aria-labelledby="context-decisions-title">
        <h2 id="context-decisions-title">Décisions retenues</h2>
        <div className="context-findings">
          {project.decisions.map((decision, index) => <article className="context-finding" key={`${decision.title}-${index}`}>
            <h3>{decision.title}</h3>
            <p>{decision.detail}</p>
            <ul className="context-evidence" aria-label={`Sources : ${decision.title}`}>
              {decision.evidence.map((evidence, evidenceIndex) => <li key={`${evidence.url}-${evidenceIndex}`}>
                <a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.title} <span aria-hidden="true">↗</span></a>
              </li>)}
            </ul>
          </article>)}
        </div>
      </section>}

      {project.questions.length > 0 && <section className="context-section" aria-labelledby="context-questions-title">
        <div className="context-section-heading"><h2 id="context-questions-title">À clarifier</h2><span className="context-count">{project.questions.length}</span></div>
        <p className="context-section-note">Les points où les sources laissent une question ouverte ou se contredisent.</p>
        <div className="context-findings context-questions">
          {project.questions.map((question, index) => <article className="context-finding" key={`${question.title}-${index}`}>
            <h3>{question.title}</h3>
            <p>{question.detail}</p>
            <ul className="context-evidence" aria-label={`Sources : ${question.title}`}>
              {question.evidence.map((evidence, evidenceIndex) => <li key={`${evidence.url}-${evidenceIndex}`}>
                <a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.title} <span aria-hidden="true">↗</span></a>
              </li>)}
            </ul>
          </article>)}
        </div>
      </section>}
      </>}

      {tab === 'sources' && <>
      <section className="context-section" aria-labelledby="context-access-title">
        <div className="context-section-heading">
          <h2 id="context-access-title">Sources et accès</h2>
          <button className="secondary-button" disabled={checking} onClick={() => setCheckVersion((value) => value + 1)}>
            {checking ? 'Vérification…' : 'Vérifier les accès'}
          </button>
        </div>
        <p className="context-section-note">La collecte ci-dessous vient de la conversation. Ces accès indiquent ce que Work Assistant pourra consulter avec ton compte OpenAI.</p>
        {accessError && <p className="context-access-error" role="alert">{accessError}</p>}
        <div className="context-provider-list">
          {providers.map((provider) => {
            const coverage = project.coverage.find((item) => item.provider === provider.id);
            const connection = access.find((item) => item.provider === provider.id);
            return <article className="context-provider" key={provider.id}>
              <div className="context-provider-heading"><span className="context-provider-mark" aria-hidden="true">{provider.mark}</span><h3>{provider.name}</h3></div>
              <strong className="context-provider-count">{coverage?.label ?? 'Aucune collecte'}</strong>
              <p>{coverage?.detail ?? 'Aucun contenu de cette source dans ce contexte.'}</p>
              {coverage && <span className="context-coverage-label">{coverage.complete ? 'Périmètre lu' : 'Couverture partielle'}</span>}
              <div className="context-provider-access" aria-live="polite">
                <span className="context-access-label">Accès dans l’app</span>
                <span className={connection?.status === 'available' ? 'context-access-status available' : 'context-access-status'}>
                  {checking ? 'Vérification…' : connection ? accessLabels[connection.status] : 'Non vérifié'}
                </span>
                {connection?.message && <p>{connection.message}</p>}
                {connection?.installUrl?.startsWith('https://') && connection.status !== 'available' && (
                  <a className="context-connect-link" href={connection.installUrl} target="_blank" rel="noopener noreferrer">Configurer {provider.name} <span aria-hidden="true">↗</span></a>
                )}
              </div>
            </article>;
          })}
        </div>
        {checkedAt && <p className="editor-footnote">Dernière vérification des accès : <time dateTime={checkedAt}>{formatDate(checkedAt)}</time>.</p>}
      </section>

      <section className="context-section" aria-labelledby="context-catalog-title">
        <div className="context-section-heading"><h2 id="context-catalog-title">Documents et discussions</h2><span className="context-count">{project.sources.length}</span></div>
        <div className="context-filters" role="group" aria-label="Filtrer les sources">
          <button className={filter === 'all' ? 'context-filter selected' : 'context-filter'} aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setVisibleCount(12); }}>Tous <span>{project.sources.length}</span></button>
          {providers.map((provider) => <button key={provider.id} className={filter === provider.id ? 'context-filter selected' : 'context-filter'} aria-pressed={filter === provider.id} onClick={() => { setFilter(provider.id); setVisibleCount(12); }}>{provider.name} <span>{project.sources.filter((source) => source.provider === provider.id).length}</span></button>)}
        </div>
        <input className="context-search" type="search" aria-label="Rechercher dans les sources" placeholder="Rechercher un document, un ticket, une discussion…" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(12); }} />
        <p className="context-results-count" role="status">{sources.length === 0 ? 'Aucune source trouvée' : `${Math.min(visibleCount, sources.length)} sur ${sources.length} sources`}</p>
        <div className="context-catalog">
          {sources.length === 0 && <p className="context-section-note">Aucune source collectée pour ce filtre.</p>}
          {sources.slice(0, visibleCount).map((source) => <article className="context-source" key={source.id}>
            <div className="context-source-meta"><span>{providers.find((provider) => provider.id === source.provider)?.name}</span><span>{sourceKindLabels[source.kind] ?? 'Source'}</span>{source.updatedAt && <time dateTime={source.updatedAt}>Modifié le {formatDate(source.updatedAt)}</time>}</div>
            <h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a></h3>
            <p>{source.summary}</p>
          </article>)}
        </div>
        {visibleCount < sources.length && <button className="secondary-button context-show-more" onClick={() => setVisibleCount((count) => count + 12)}>Afficher la suite</button>}
      </section>

      {project.limitations.length > 0 && <section className="context-section context-limits" aria-labelledby="context-limits-title">
        <h2 id="context-limits-title">Ce qu’il reste à couvrir</h2>
        <ul>{project.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
      </section>}
      </>}
    </section>
  );
}
