import { useEffect, useState } from 'react';
import ProjectProgress from './ProjectProgress';
import ProjectAgent from './ProjectAgent';
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
  referenceSourceIds?: string[];
  progress?: {
    phases: {
      id: 'kickoff' | 'technical-framing' | 'development';
      status: 'completed' | 'current' | 'upcoming';
      summary: string;
      sourceIds: string[];
    }[];
    issues: {
      sourceId: string;
      parentId: string | null;
      status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'to_test' | 'done' | 'canceled';
      assignee: string | null;
    }[];
  };
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
  const [tab, setTab] = useState<'overview' | 'decisions' | 'sources'>('overview');
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [filter, setFilter] = useState<Provider | 'all'>('all');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(12);
  const [access, setAccess] = useState<SourceAccess[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState('');
  const [accessError, setAccessError] = useState('');
  const [checkVersion, setCheckVersion] = useState(0);

  useEffect(() => {
    if (tab !== 'sources') return;
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
        setAccessError('Impossible de vérifier les accès de Work Assistant. Les références déjà collectées restent disponibles.');
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    }
    void checkAccess();
    return () => controller.abort();
  }, [tab, checkVersion]);

  const query = search.trim().toLocaleLowerCase('fr-FR');
  const sources = project.sources.filter((source) => (filter === 'all' || source.provider === filter)
    && (!query || (source.title + ' ' + source.summary).toLocaleLowerCase('fr-FR').includes(query)));
  const questions = showAllQuestions ? project.questions : project.questions.slice(0, 3);
  const references = (project.referenceSourceIds ?? [])
    .map((id) => project.sources.find((source) => source.id === id))
    .filter((source) => source !== undefined)
    .slice(0, 3);

  return (
    <section className="page context-page">
      <header className="context-header">
        <h1>{project.name}</h1>
        <p className="page-description">{project.objective}</p>
        <p className="context-dateline">
          Point du <time dateTime={project.collectedAt}>{formatDate(project.collectedAt)}</time>
          <span aria-hidden="true"> · </span>
          {project.coverage.some((item) => !item.complete) ? 'Collecte partielle' : 'Collecte ponctuelle'}
        </p>
      </header>

      <ProjectAgent project={project} />

      <nav className="tabs context-tabs" aria-label="Vues du projet">
        <button className={tab === 'overview' ? 'tab active' : 'tab'} aria-current={tab === 'overview' ? 'page' : undefined} onClick={() => setTab('overview')}>Vue d’ensemble</button>
        <button className={tab === 'decisions' ? 'tab active' : 'tab'} aria-current={tab === 'decisions' ? 'page' : undefined} onClick={() => setTab('decisions')}>Décisions <span>{project.decisions.length}</span></button>
        <button className={tab === 'sources' ? 'tab active' : 'tab'} aria-current={tab === 'sources' ? 'page' : undefined} onClick={() => setTab('sources')}>Sources <span>{project.sources.length}</span></button>
      </nav>

      {tab === 'overview' && <>
        {project.progress && <ProjectProgress project={project} progress={project.progress} />}
        <section className="context-section" aria-labelledby="context-summary-title">
          <h2 id="context-summary-title">En bref</h2>
          <p className="context-summary">{project.summary}</p>
        </section>

        {project.questions.length > 0 && <section className="context-section" aria-labelledby="context-questions-title">
          <h2 id="context-questions-title">À éclaircir</h2>
          <p className="context-section-note">Points à vérifier dans les sources. Sélection de lecture de l’assistant.</p>
          <div className="context-findings" id="context-questions">
            {questions.map((question, index) => <details className="context-disclosure context-question" key={question.title + '-' + index}>
              <summary>
                <span className="context-item-title">{question.title}</span>
                <span className="context-item-meta">{question.evidence.length} {question.evidence.length === 1 ? 'source' : 'sources'}</span>
              </summary>
              <div className="context-disclosure-content">
                <p>{question.detail}</p>
                <ul className="context-evidence" aria-label={'Sources : ' + question.title}>
                  {question.evidence.map((evidence, evidenceIndex) => <li key={evidence.url + '-' + evidenceIndex}>
                    <a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.title} <span aria-hidden="true">↗</span></a>
                  </li>)}
                </ul>
              </div>
            </details>)}
          </div>
          {project.questions.length > 3 && <button
            className="context-inline-button"
            aria-expanded={showAllQuestions}
            aria-controls="context-questions"
            onClick={() => setShowAllQuestions((value) => !value)}
          >{showAllQuestions ? 'Réduire la liste' : 'Voir les ' + project.questions.length + ' points'}</button>}
        </section>}

        {references.length > 0 && <section className="context-section" aria-labelledby="context-references-title">
          <h2 id="context-references-title">Documents repères</h2>
          <div className="context-reference-list">
            {references.map((source) => <a className="context-reference" key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">
              <span>{source.title}</span>
              <span className="context-reference-provider">{providers.find((provider) => provider.id === source.provider)?.name} <span aria-hidden="true">↗</span></span>
            </a>)}
          </div>
        </section>}
      </>}

      {tab === 'decisions' && <section className="context-section" aria-labelledby="context-decisions-title">
        <h2 id="context-decisions-title">Décisions documentées</h2>
        <p className="context-section-note">Choix décrits dans les documents du projet ; leur mise en œuvre n’a pas été vérifiée dans cette collecte.</p>
        {project.decisions.length === 0 && <p className="context-section-note">Aucune décision documentée dans cette collecte.</p>}
        <div className="context-findings">
          {project.decisions.map((decision, index) => <details className="context-disclosure" key={decision.title + '-' + index}>
            <summary>
              <span className="context-item-title">{decision.title}</span>
              <span className="context-item-meta">{decision.evidence.length} {decision.evidence.length === 1 ? 'source' : 'sources'}</span>
            </summary>
            <div className="context-disclosure-content">
              <p>{decision.detail}</p>
              <ul className="context-evidence" aria-label={'Sources : ' + decision.title}>
                {decision.evidence.map((evidence, evidenceIndex) => <li key={evidence.url + '-' + evidenceIndex}>
                  <a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.title} <span aria-hidden="true">↗</span></a>
                </li>)}
              </ul>
            </div>
          </details>)}
        </div>
      </section>}

      {tab === 'sources' && <>
        <section className="context-section" aria-labelledby="context-catalog-title">
          <h2 id="context-catalog-title">Références du projet</h2>
          <p className="context-section-note">Retrouve un document, un ticket ou une discussion. Ouvre une référence pour lire son résumé et consulter l’original.</p>
          <input className="context-search" type="search" aria-label="Rechercher dans les sources" placeholder="Rechercher un document, un ticket, une discussion…" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(12); }} />
          <div className="context-filters" role="group" aria-label="Filtrer les sources">
            <button className={filter === 'all' ? 'context-filter selected' : 'context-filter'} aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setVisibleCount(12); }}>Tous <span>{project.sources.length}</span></button>
            {providers.map((provider) => <button key={provider.id} className={filter === provider.id ? 'context-filter selected' : 'context-filter'} aria-pressed={filter === provider.id} onClick={() => { setFilter(provider.id); setVisibleCount(12); }}>{provider.name} <span>{project.sources.filter((source) => source.provider === provider.id).length}</span></button>)}
          </div>
          <p className="context-results-count" role="status">{sources.length === 0 ? 'Aucune référence trouvée' : Math.min(visibleCount, sources.length) + ' sur ' + sources.length + (sources.length === 1 ? ' référence' : ' références')}</p>
          <div className="context-catalog">
            {sources.slice(0, visibleCount).map((source) => <details className="context-disclosure context-source" key={source.id}>
              <summary>
                <span className="context-source-heading">
                  <span className="context-item-title">{source.title}</span>
                  <span className="context-source-meta">
                    <span>{providers.find((provider) => provider.id === source.provider)?.name}</span>
                    <span>{sourceKindLabels[source.kind] ?? 'Source'}</span>
                    {source.updatedAt && <time dateTime={source.updatedAt}>Modifié le {formatDate(source.updatedAt)}</time>}
                  </span>
                </span>
              </summary>
              <div className="context-disclosure-content">
                <p>{source.summary}</p>
                <a className="context-original-link" href={source.url} target="_blank" rel="noopener noreferrer">Ouvrir dans {providers.find((provider) => provider.id === source.provider)?.name} <span aria-hidden="true">↗</span></a>
              </div>
            </details>)}
          </div>
          {visibleCount < sources.length && <button className="secondary-button context-show-more" onClick={() => setVisibleCount((count) => count + 12)}>Afficher la suite</button>}
        </section>

        <details className="context-collection-details">
          <summary>Accès et couverture de la collecte</summary>
          <div className="context-collection-content">
            <p className="context-section-note">Informations collectées dans notre conversation, conservées sur ce Mac. Elles ne sont pas actualisées automatiquement.</p>
            <div className="context-section-heading">
              <h2>Accès de Work Assistant</h2>
              <button className="secondary-button" disabled={checking} onClick={() => setCheckVersion((value) => value + 1)}>
                {checking ? 'Vérification…' : 'Vérifier les accès'}
              </button>
            </div>
            <p className="context-section-note">Ces accès indiquent ce que l’app pourra consulter avec ton compte OpenAI. Ils sont distincts de la collecte déjà réalisée.</p>
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
                    <span className={connection?.status === 'available' && !checking ? 'context-access-status available' : 'context-access-status'}>
                      {checking ? 'Vérification…' : connection ? accessLabels[connection.status] : 'Non vérifié'}
                    </span>
                    {!checking && connection?.message && <p>{connection.message}</p>}
                    {!checking && connection?.installUrl?.startsWith('https://') && connection.status !== 'available' && (
                      <a className="context-connect-link" href={connection.installUrl} target="_blank" rel="noopener noreferrer">Configurer {provider.name} <span aria-hidden="true">↗</span></a>
                    )}
                  </div>
                </article>;
              })}
            </div>
            {checkedAt && <p className="context-access-checked">Dernière vérification : <time dateTime={checkedAt}>{formatDate(checkedAt)}</time>.</p>}
            {project.limitations.length > 0 && <section className="context-limits" aria-labelledby="context-limits-title">
              <h2 id="context-limits-title">Ce qu’il reste à couvrir</h2>
              <ul>{project.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
            </section>}
          </div>
        </details>
      </>}
    </section>
  );
}
