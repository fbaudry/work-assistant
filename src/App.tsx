import { useEffect, useState, type FormEvent } from 'react';
import type { UpdateState } from './bridge';

type Project = {
  id: string;
  name: string;
  objective: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

const storageKey = 'work-assistant.projects.v1';
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

function readProjects(): { projects: Project[]; error: string } {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return { projects: [], error: '' };
    const projects: unknown = JSON.parse(saved);
    if (!Array.isArray(projects) || !projects.every((project) =>
      project && ['id', 'name', 'objective', 'notes', 'createdAt', 'updatedAt'].every(
        (key) => typeof project[key] === 'string',
      ) && Number.isFinite(Date.parse(project.createdAt)) && Number.isFinite(Date.parse(project.updatedAt)),
    )) throw new Error('Invalid saved projects');
    return { projects, error: '' };
  } catch {
    return { projects: [], error: 'Les projets enregistrés n’ont pas pu être lus. Leur contenu est conservé ; relance l’application avant de créer un projet.' };
  }
}

export default function App() {
  const [initial] = useState(readProjects);
  const [projects, setProjects] = useState(initial.projects);
  const [screen, setScreen] = useState<'projects' | 'activity' | 'settings'>('projects');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'notes' | 'context'>('notes');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [saveError, setSaveError] = useState(initial.error);
  const [actionError, setActionError] = useState('');
  const [appInfo, setAppInfo] = useState<{ version: string; platform: string } | null>(null);
  const [updates, setUpdates] = useState<UpdateState>({ status: 'idle', message: 'Vérification non effectuée.' });
  const [restarting, setRestarting] = useState(false);
  const project = projects.find((item) => item.id === selectedId);

  useEffect(() => {
    const bridge = window.workAssistant;
    if (!bridge) {
      setUpdates({ status: 'development', message: 'Les mises à jour sont disponibles dans l’application installée.' });
      return;
    }
    let active = true;
    let receivedEvent = false;
    const unsubscribe = bridge.onUpdateState((state) => {
      receivedEvent = true;
      if (active) setUpdates(state);
    });
    bridge.getUpdateState().then((state) => {
      if (active && !receivedEvent) setUpdates(state);
    }).catch(() => {
      if (active && !receivedEvent) setUpdates({ status: 'error', message: 'Impossible de lire l’état des mises à jour.' });
    });
    bridge.getAppInfo().then((info) => { if (active) setAppInfo(info); }).catch(() => {
      if (active) setActionError('La version de l’application n’a pas pu être lue.');
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  function saveProjects(next: Project[]) {
    setProjects(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaveError('');
    } catch {
      setSaveError('L’enregistrement local a échoué. Garde cette fenêtre ouverte pour conserver tes modifications.');
    }
  }

  function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || initial.error) return;
    const now = new Date().toISOString();
    const created = { id: crypto.randomUUID(), name: name.trim(), objective: objective.trim(), notes: '', createdAt: now, updatedAt: now };
    saveProjects([...projects, created]);
    setSelectedId(created.id);
    setCreating(false);
    setName('');
    setObjective('');
    setTab('notes');
  }

  function openProject(id: string) {
    setScreen('projects');
    setSelectedId(id);
    setCreating(false);
    setTab('notes');
  }

  async function checkUpdates() {
    setActionError('');
    setUpdates({ status: 'checking' });
    try {
      const state = await window.workAssistant?.checkForUpdates();
      if (state) setUpdates(state);
    } catch {
      setUpdates({ status: 'error', message: 'La recherche a échoué. Vérifie ta connexion et réessaie.' });
    }
  }

  async function installUpdate() {
    setRestarting(true);
    setActionError('');
    try {
      const started = await window.workAssistant?.installUpdate();
      if (!started) {
        setRestarting(false);
        setActionError('La mise à jour n’est pas encore prête. Réessaie après le téléchargement.');
      }
    } catch {
      setRestarting(false);
      setActionError('Le redémarrage n’a pas pu être lancé. Réessaie dans quelques instants.');
    }
  }

  async function openFeedback() {
    setActionError('');
    try { await window.workAssistant?.openFeedback(); }
    catch { setActionError('Le navigateur n’a pas pu être ouvert. Le dépôt GitHub est fbaudry/work-assistant.'); }
  }

  const updateBusy = ['checking', 'available', 'downloading'].includes(updates.status);
  const updateTitle = {
    development: 'Version de développement',
    idle: 'Mises à jour',
    checking: 'Recherche d’une mise à jour…',
    available: 'Nouvelle version disponible',
    downloading: 'Téléchargement en cours…',
    ready: 'Mise à jour prête à installer',
    error: 'Mise à jour indisponible',
  }[updates.status];

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navigation principale">
        <div className="sidebar-titlebar" />
        <div className="brand"><span className="brand-mark" aria-hidden="true">W</span><span>Work Assistant</span></div>
        <nav className="main-nav">
          <button className={screen === 'projects' ? 'nav-item selected' : 'nav-item'} onClick={() => { setScreen('projects'); setSelectedId(null); setCreating(false); }} aria-current={screen === 'projects' ? 'page' : undefined}><span className="nav-icon" aria-hidden="true">▦</span>Projets</button>
          <button className={screen === 'activity' ? 'nav-item selected' : 'nav-item'} onClick={() => setScreen('activity')} aria-current={screen === 'activity' ? 'page' : undefined}><span className="nav-icon" aria-hidden="true">◷</span>Activité</button>
        </nav>
        {projects.length > 0 && <div className="project-navigation"><p className="sidebar-label">Mes projets</p>{projects.map((item) => <button key={item.id} className={screen === 'projects' && selectedId === item.id ? 'project-nav selected' : 'project-nav'} onClick={() => openProject(item.id)}><span className="project-dot" aria-hidden="true" />{item.name}</button>)}</div>}
        <div className="sidebar-bottom">
          <button className={screen === 'settings' ? 'nav-item selected' : 'nav-item'} onClick={() => setScreen('settings')} aria-current={screen === 'settings' ? 'page' : undefined}><span className="nav-icon" aria-hidden="true">⚙</span>Réglages{updates.status === 'ready' && <span className="update-dot" aria-label="Mise à jour disponible" />}</button>
          <span className="version-label">{appInfo ? `Version ${appInfo.version}` : 'Version de développement'}</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="titlebar"><span>{screen === 'settings' ? 'Réglages' : screen === 'activity' ? 'Activité' : project && !creating ? `Projets / ${project.name}` : 'Projets'}</span><button className="text-button no-drag" disabled={!window.workAssistant} onClick={openFeedback}>Donner mon avis ↗</button></header>
        {updates.status === 'ready' && screen !== 'settings' && <div className="update-banner"><span>La version {updates.version} est prête.</span><button className="text-button" onClick={() => setScreen('settings')}>Voir la mise à jour →</button></div>}
        {saveError && <div className="error-banner" role="alert">{saveError}</div>}
        {actionError && <div className="error-banner" role="alert">{actionError}</div>}

        <main>
          {screen === 'projects' && creating && <section className="page narrow-page">
            <button className="back-button" onClick={() => setCreating(false)}>← Projets</button>
            <h1>Nouveau projet</h1><p className="page-description">Un espace pour rassembler ton objectif et tes notes.</p>
            <form onSubmit={createProject} className="project-form">
              <label htmlFor="project-name">Nom du projet</label><input id="project-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus required placeholder="Ex. Améliorer la recherche" />
              <label htmlFor="project-objective">Objectif <span className="optional">facultatif</span></label><textarea id="project-objective" value={objective} onChange={(event) => setObjective(event.target.value)} maxLength={2000} rows={4} placeholder="Quel résultat veux-tu obtenir ?" />
              <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setCreating(false)}>Annuler</button><button className="primary-button" disabled={!name.trim() || Boolean(initial.error)}>Créer le projet</button></div>
            </form>
          </section>}

          {screen === 'projects' && !creating && !project && <section className="page">
            <div className="page-heading"><div><h1>Projets</h1><p className="page-description">Tes espaces de travail, conservés sur ce Mac.</p></div><button className="primary-button" onClick={() => setCreating(true)} disabled={Boolean(initial.error)}>+ Nouveau projet</button></div>
            {projects.length === 0 ? <div className="empty-state"><div className="empty-symbol" aria-hidden="true">▦</div><h2>Commençons par un projet</h2><p>Donne-lui un nom, pose ton objectif et rassemble tes premières notes.</p><button className="secondary-button" onClick={() => setCreating(true)} disabled={Boolean(initial.error)}>Créer mon premier projet</button></div> : <div className="project-list"><div className="list-heading"><span>Nom</span><span>Dernière modification</span></div>{projects.map((item) => <button key={item.id} className="project-row" onClick={() => openProject(item.id)}><span className="project-row-name"><span className="folder-symbol" aria-hidden="true">▱</span><span><strong>{item.name}</strong><span className="project-objective-preview">{item.objective || 'Aucun objectif renseigné'}</span></span></span><time dateTime={item.updatedAt}>{dateFormat.format(new Date(item.updatedAt))}</time></button>)}</div>}
            <div className="first-version-note"><span className="small-label">Première version</span><p>Les projets et notes sont disponibles. Les connexions aux outils et le travail avec l’IA seront ajoutés progressivement.</p></div>
          </section>}

          {screen === 'projects' && !creating && project && <section className="project-page">
            <div className="project-header"><h1>{project.name}</h1><p className="page-description">{project.objective || 'Ajoute tes idées dans les notes pour commencer.'}</p><nav className="tabs" aria-label="Contenu du projet"><button aria-current={tab === 'notes' ? 'page' : undefined} className={tab === 'notes' ? 'tab active' : 'tab'} onClick={() => setTab('notes')}>Notes</button><button aria-current={tab === 'context' ? 'page' : undefined} className={tab === 'context' ? 'tab active' : 'tab'} onClick={() => setTab('context')}>Sources</button></nav></div>
            {tab === 'notes' ? <div className="notes-page"><div className="notes-heading"><label htmlFor="project-notes">Notes du projet</label><span aria-live="polite" className={saveError ? 'save-status has-error' : 'save-status'}>{saveError ? 'Non enregistré' : 'Enregistré sur ce Mac'}</span></div><textarea id="project-notes" className="notes-editor" value={project.notes} placeholder="Contexte, décisions, prochaines étapes…" onChange={(event) => saveProjects(projects.map((item) => item.id === project.id ? { ...item, notes: event.target.value, updatedAt: new Date().toISOString() } : item))} /><p className="editor-footnote">Ces notes restent locales. Elles ne sont pas envoyées à une IA.</p></div> : <div className="sources-page"><h2>Le contexte du projet</h2><p className="section-description">Les connexions seront ajoutées au fil des prochaines versions. Aucune donnée n’est synchronisée pour le moment.</p><div className="source-list">{[['Notion', 'Pages, spécifications et comptes rendus'], ['Linear', 'Tickets et commentaires'], ['Slack', 'Conversations du projet'], ['GitHub', 'Pull requests, revues et actions']].map(([label, description]) => <div className="source-row" key={label}><div><strong>{label}</strong><p>{description}</p></div><span className="status-label">Non connecté</span></div>)}</div></div>}
          </section>}

          {screen === 'activity' && <section className="page"><h1>Activité</h1><p className="page-description">Les dernières modifications de tes projets locaux.</p>{projects.length === 0 ? <div className="empty-state"><div className="empty-symbol" aria-hidden="true">◷</div><h2>Aucune activité pour le moment</h2><p>Les projets que tu crées et modifies apparaîtront ici.</p><button className="secondary-button" onClick={() => { setScreen('projects'); setCreating(true); }} disabled={Boolean(initial.error)}>Créer un projet</button></div> : <div className="activity-list">{[...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((item) => <button className="activity-row" key={item.id} onClick={() => openProject(item.id)}><span className="activity-marker" aria-hidden="true" /><span><strong>{item.name}</strong><span>{item.createdAt === item.updatedAt ? 'Projet créé' : 'Notes modifiées'}</span></span><time dateTime={item.updatedAt}>{dateFormat.format(new Date(item.updatedAt))}</time></button>)}</div>}</section>}

          {screen === 'settings' && <section className="page settings-page"><h1>Réglages</h1><p className="page-description">L’application et ses mises à jour.</p><section className="settings-section"><h2>Work Assistant</h2><dl className="app-details"><div><dt>Version installée</dt><dd>{appInfo?.version ?? 'Développement'}</dd></div><div><dt>Canal</dt><dd>Alpha</dd></div><div><dt>Données</dt><dd>Enregistrées sur ce Mac</dd></div></dl></section><section className="settings-section"><h2>{updateTitle}</h2><div aria-live="polite"><p className="section-description">{updates.message || (updates.status === 'checking' ? 'Recherche des versions publiées sur GitHub…' : updates.status === 'downloading' ? `Version ${updates.version ?? ''}` : updates.status === 'ready' ? `La version ${updates.version ?? ''} sera installée au redémarrage.` : updates.status === 'available' ? `Préparation du téléchargement de la version ${updates.version ?? ''}.` : 'Vérification non effectuée.')}</p>{updates.status === 'downloading' && <div className="download-progress"><progress max={100} value={updates.progress ?? 0} aria-label="Téléchargement de la mise à jour" /><span>{Math.round(updates.progress ?? 0)} %</span></div>}</div><div className="settings-actions">{updates.status === 'ready' ? <button className="primary-button" disabled={restarting || Boolean(saveError)} onClick={installUpdate}>{restarting ? 'Redémarrage…' : 'Redémarrer et mettre à jour'}</button> : <button className="secondary-button" disabled={updateBusy || updates.status === 'development' || !window.workAssistant} onClick={checkUpdates}>{updateBusy ? 'Vérification en cours…' : 'Rechercher une mise à jour'}</button>}</div><p className="editor-footnote">Les nouvelles versions sont téléchargées pendant que l’application est ouverte. Tu choisis quand la redémarrer.</p></section><section className="settings-section"><h2>Construisons la suite</h2><p className="section-description">Partage ce qui te manque ou ce qui te gêne. Le bouton ouvre une nouvelle issue GitHub à compléter avant publication.</p><button className="secondary-button" disabled={!window.workAssistant} onClick={openFeedback}>Donner mon avis sur GitHub ↗</button></section></section>}
        </main>
      </div>
    </div>
  );
}
