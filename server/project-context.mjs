import { readFile } from 'node:fs/promises';

const providers = ['notion', 'linear', 'slack'];
const text = (value) => typeof value === 'string';
const date = (value) => text(value) && Number.isFinite(Date.parse(value));
const https = (value) => {
  if (!text(value) || !URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
};

// This file is generated locally by an explicit context collection. It is data,
// not executable content or instructions. Never load it into the client bundle.
export async function readProjectContext(filename) {
  let contents;
  try { contents = await readFile(filename, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { projects: [] }; throw error; }
  const data = JSON.parse(contents);
  if (!Array.isArray(data.projects)) throw new Error('Invalid context');
  for (const project of data.projects) {
    if (![project.id, project.name, project.objective, project.summary].every(text)
      || !date(project.collectedAt) || project.collectionMode !== 'conversation'
      || !Array.isArray(project.sources) || !Array.isArray(project.coverage)
      || !Array.isArray(project.decisions) || !Array.isArray(project.questions)
      || !Array.isArray(project.limitations) || !project.limitations.every(text)) throw new Error('Invalid context');
    for (const source of project.sources) {
      if (![source.id, source.title, source.summary, source.kind].every(text)
        || !providers.includes(source.provider) || !https(source.url)
        || (source.updatedAt !== null && !date(source.updatedAt))) throw new Error('Invalid source');
    }
    if (project.referenceSourceIds !== undefined) {
      const ids = project.referenceSourceIds;
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.length > 3
        || !ids.every((id) => text(id) && project.sources.some((source) => source.id === id))) {
        throw new Error('Invalid project references');
      }
    }
    if (project.progress !== undefined) {
      const progress = project.progress;
      const phaseIds = ['kickoff', 'technical-framing', 'development'];
      const phaseStatuses = ['completed', 'current', 'upcoming'];
      const issueStatuses = ['backlog', 'todo', 'in_progress', 'in_review', 'to_test', 'done', 'canceled'];
      if (!progress || !Array.isArray(progress.phases) || progress.phases.length !== 3
        || !Array.isArray(progress.issues)) throw new Error('Invalid project progress');
      for (const [index, phase] of progress.phases.entries()) {
        if (!phase || phase.id !== phaseIds[index] || !phaseStatuses.includes(phase.status)
          || !text(phase.summary) || !Array.isArray(phase.sourceIds) || phase.sourceIds.length === 0
          || new Set(phase.sourceIds).size !== phase.sourceIds.length
          || !phase.sourceIds.every((id) => project.sources.some((source) => source.id === id))
          || (index > 0 && phaseStatuses.indexOf(phase.status) < phaseStatuses.indexOf(progress.phases[index - 1].status))) {
          throw new Error('Invalid project phase');
        }
      }
      if (progress.phases.filter((phase) => phase.status === 'current').length > 1) throw new Error('Invalid current phase');
      if (new Set(progress.issues.map((issue) => issue?.sourceId)).size !== progress.issues.length) throw new Error('Duplicate development issue');
      for (const issue of progress.issues) {
        if (!issue || !issueStatuses.includes(issue.status)
          || (issue.assignee !== null && !text(issue.assignee))
          || !project.sources.some((source) => source.id === issue.sourceId && source.provider === 'linear' && source.kind === 'issue')) {
          throw new Error('Invalid development issue');
        }
        if (issue.parentId !== null) {
          const parent = progress.issues.find((entry) => entry?.sourceId === issue.parentId);
          // The overview exposes user stories and their direct tickets, without
          // silently losing deeper levels or counting a ticket twice.
          if (!parent || parent.sourceId === issue.sourceId || parent.parentId !== null) throw new Error('Invalid development parent');
        }
      }
    }
    for (const item of [...project.decisions, ...project.questions]) {
      if (!text(item.title) || !text(item.detail) || !Array.isArray(item.evidence)
        || !item.evidence.every((link) => text(link.title) && https(link.url))) throw new Error('Invalid evidence');
    }
    for (const coverage of project.coverage) {
      if (!providers.includes(coverage.provider) || !text(coverage.label) || !text(coverage.detail)
        || typeof coverage.complete !== 'boolean') throw new Error('Invalid coverage');
    }
  }
  return data;
}
