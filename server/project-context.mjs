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
