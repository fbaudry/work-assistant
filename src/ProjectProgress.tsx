import { useState } from 'react';
import type { ProjectContext } from './SourceContext';
import './project-progress.css';

type Progress = NonNullable<ProjectContext['progress']>;
type Issue = Progress['issues'][number];

const phaseLabels = {
  kickoff: 'Kick-off',
  'technical-framing': 'Cadrage tech',
  development: 'Développement',
};
const phaseStatusLabels = { completed: 'Réalisé', current: 'En cours', upcoming: 'À venir' };
const issueStatusLabels = {
  backlog: 'Backlog', todo: 'À faire', in_progress: 'En cours', in_review: 'En revue',
  to_test: 'À tester', done: 'Terminé', canceled: 'Annulé',
};
const activeStatuses = ['in_progress', 'in_review', 'to_test'];
const closedStatuses = ['done', 'canceled'];

function DevelopmentIssue({ issue, children, project }: { issue: Issue; children: Issue[]; project: ProjectContext }) {
  const source = project.sources.find((item) => item.id === issue.sourceId);
  if (!source) return null;
  const active = children.filter((child) => activeStatuses.includes(child.status)).length;
  const done = children.filter((child) => child.status === 'done').length;

  return <details className="context-disclosure progress-issue">
    <summary>
      <span className="progress-issue-heading">
        <span className="context-item-title">{source.title}</span>
        <span className="progress-issue-meta">
          {children.length > 0 ? <>{children.length} sous-tickets · {done} {done === 1 ? 'terminé' : 'terminés'}{active > 0 && <> · <strong>{active} {active === 1 ? 'actif' : 'actifs'}</strong></>}</> : 'Ticket autonome'}
          {issue.assignee && <span> · {issue.assignee}</span>}
        </span>
      </span>
      <span className={'progress-status ' + issue.status}>{children.length > 0 && 'Parent : '}{issueStatusLabels[issue.status]}</span>
    </summary>
    <div className="context-disclosure-content">
      <p>{source.summary}</p>
      <a className="context-original-link" href={source.url} target="_blank" rel="noopener noreferrer">Ouvrir {children.length > 0 ? 'le ticket parent' : 'le ticket'} dans Linear <span aria-hidden="true">↗</span></a>
      {children.length > 0 && <ul className="progress-child-list" aria-label={'Sous-tickets : ' + source.title}>
        {children.map((child) => {
          const childSource = project.sources.find((item) => item.id === child.sourceId);
          if (!childSource) return null;
          return <li key={child.sourceId}>
            <div className="progress-child-heading">
              <a href={childSource.url} target="_blank" rel="noopener noreferrer">{childSource.title} <span aria-hidden="true">↗</span></a>
              {child.assignee && <span className="progress-issue-meta">{child.assignee}</span>}
            </div>
            <span className={'progress-status ' + child.status}>{issueStatusLabels[child.status]}</span>
          </li>;
        })}
      </ul>}
    </div>
  </details>;
}

export default function ProjectProgress({ project, progress }: { project: ProjectContext; progress: Progress }) {
  const [showAll, setShowAll] = useState(false);
  const current = progress.phases.find((phase) => phase.status === 'current');
  const roots = progress.issues.filter((issue) => issue.parentId === null);
  const unfinishedRoots = roots.filter((issue) => !closedStatuses.includes(issue.status)
    || progress.issues.some((child) => child.parentId === issue.sourceId && !closedStatuses.includes(child.status)));
  const visibleRoots = showAll ? roots : unfinishedRoots;
  // Count only leaf tasks: a parent and its subtasks are not separate units of progress.
  const tasks = progress.issues.filter((issue) => !progress.issues.some((child) => child.parentId === issue.sourceId));
  const doneCount = tasks.filter((issue) => issue.status === 'done').length;
  const activeCount = tasks.filter((issue) => activeStatuses.includes(issue.status)).length;
  const upcomingCount = tasks.filter((issue) => issue.status === 'todo' || issue.status === 'backlog').length;
  const canceledCount = tasks.filter((issue) => issue.status === 'canceled').length;

  return <section className="context-section project-progress" aria-labelledby="project-progress-title">
    <p className="progress-eyebrow">Avancement du projet</p>
    <h2 id="project-progress-title">{current ? phaseLabels[current.id] + ' en cours' : 'Étapes du projet'}</h2>
    <ol className="progress-phases" aria-label="Étapes du projet">
      {progress.phases.map((phase, index) => <li className={'progress-phase ' + phase.status} key={phase.id} aria-current={phase.status === 'current' ? 'step' : undefined}>
        <div className="progress-phase-track"><span className="progress-phase-marker" aria-hidden="true">{phase.status === 'completed' ? '✓' : index + 1}</span></div>
        <details className="progress-phase-details">
          <summary>
            <span className="progress-phase-name">{phaseLabels[phase.id]}</span>
            <span className="progress-phase-state">{phase.id === 'technical-framing' && phase.status === 'completed' ? 'Initial réalisé' : phaseStatusLabels[phase.status]} <span aria-hidden="true">⌄</span></span>
          </summary>
          <div className="progress-phase-evidence">
            <p>{phase.summary}</p>
            <ul className="context-evidence" aria-label={'Sources : ' + phaseLabels[phase.id]}>
              {phase.sourceIds.map((id) => {
                const source = project.sources.find((item) => item.id === id);
                return source && <li key={id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a></li>;
              })}
            </ul>
          </div>
        </details>
      </li>)}
    </ol>
    {current && <p className="progress-current-summary">{current.summary}</p>}
    {tasks.length > 0 && <>
      <div className="progress-task-counts" aria-label="Avancement des tâches, sans compter deux fois les tickets parents">
        <span><strong>{doneCount}</strong> terminées</span>
        <span className="progress-active-count"><strong>{activeCount}</strong> actives</span>
        <span><strong>{upcomingCount}</strong> à venir</span>
        {canceledCount > 0 && <span><strong>{canceledCount}</strong> annulées</span>}
      </div>
      <p className="progress-count-note">Tâches Linear · actives = en cours, en revue ou à tester</p>
    </>}
    <details className="context-disclosure progress-development">
      <summary>
        <span className="context-item-title">Voir les US et les tickets</span>
        <span className="context-item-meta">{roots.length} {roots.length === 1 ? 'sujet' : 'sujets'}</span>
      </summary>
      <div className="progress-development-content">
        <h3>US et chantiers</h3>
        <p className="context-section-note">Les statuts des tickets parents et des sous-tickets peuvent différer. « Terminé » dans Linear ne confirme pas un déploiement.</p>
        <div className="context-filters" role="group" aria-label="Afficher les sujets de développement">
          <button className={'context-filter' + (!showAll ? ' selected' : '')} aria-pressed={!showAll} onClick={() => setShowAll(false)}>À poursuivre <span>{unfinishedRoots.length}</span></button>
          <button className={'context-filter' + (showAll ? ' selected' : '')} aria-pressed={showAll} onClick={() => setShowAll(true)}>Tous <span>{roots.length}</span></button>
        </div>
        {visibleRoots.length === 0 && <p className="context-section-note">Aucun sujet à poursuivre dans cette collecte.</p>}
        <div className="progress-issue-list">
          {visibleRoots.map((issue) => <DevelopmentIssue key={issue.sourceId} issue={issue} project={project} children={progress.issues.filter((child) => child.parentId === issue.sourceId)} />)}
        </div>
      </div>
    </details>
  </section>;
}
