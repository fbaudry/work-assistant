import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readProjectContext } from './project-context.mjs';

async function contextFile(t, contents) {
  const directory = await mkdtemp(join(tmpdir(), 'work-assistant-context-test-'));
  const filename = join(directory, 'context.json');
  t.after(() => rm(directory, { recursive: true, force: true }));
  if (contents !== undefined) await writeFile(filename, contents, { mode: 0o600 });
  return filename;
}

function project() {
  return {
    id: 'example-project', name: 'Projet de test', objective: 'Valider une collecte locale',
    summary: 'Une décision documentée et un point encore ouvert.',
    collectedAt: '2026-01-10T09:00:00.000Z', collectionMode: 'conversation',
    sources: [
      { id: 'page-1', provider: 'notion', kind: 'page', title: 'Cadrage fictif', url: 'https://example.test/docs/brief', summary: 'Périmètre initial.', updatedAt: '2026-01-08T10:00:00.000Z' },
      { id: 'issue-1', provider: 'linear', kind: 'issue', title: 'Ticket fictif', url: 'https://example.test/issues/1', summary: 'En cours.', updatedAt: '2026-01-09T11:00:00.000Z' },
      { id: 'thread-1', provider: 'slack', kind: 'thread', title: 'Discussion fictive', url: 'https://example.test/threads/1', summary: 'Question à clarifier.', updatedAt: null },
    ],
    coverage: [
      { provider: 'notion', label: 'Une page lue', detail: 'Les sous-pages ne sont pas incluses.', complete: false },
      { provider: 'linear', label: 'Un ticket lu', detail: 'Commentaires inclus.', complete: true },
      { provider: 'slack', label: 'Une discussion lue', detail: 'Canal ciblé uniquement.', complete: false },
    ],
    decisions: [{ title: 'Première étape', detail: 'Le périmètre est limité à un parcours.', evidence: [{ title: 'Cadrage fictif', url: 'https://example.test/docs/brief' }] }],
    questions: [{ title: 'Dépendance à préciser', detail: 'Le calendrier reste à confirmer.', evidence: [{ title: 'Discussion fictive', url: 'https://example.test/threads/1' }] }],
    limitations: ['Collecte ponctuelle.', 'Une source ne fournit pas de date de modification.'],
  };
}

test('a missing snapshot means no collected projects', async (t) => {
  const filename = await contextFile(t);
  assert.deepEqual(await readProjectContext(filename), { projects: [] });
});

test('preserves the complete collected payload, including evidence, dates and coverage limits', async (t) => {
  const expected = { projects: [project()] };
  const filename = await contextFile(t, JSON.stringify(expected));
  assert.deepEqual(await readProjectContext(filename), expected);
});

test('malformed snapshots fail instead of pretending the collection is empty', async (t) => {
  for (const contents of ['', '{"projects":', 'null', '{"projects":{}}', '{"projects":[{}]}']) {
    const filename = await contextFile(t, contents);
    await assert.rejects(readProjectContext(filename));
  }
});

test('project references link to existing collected sources and preserve their order', async (t) => {
  const entry = { ...project(), referenceSourceIds: ['thread-1', 'page-1'] };
  const filename = await contextFile(t, JSON.stringify({ projects: [entry] }));
  assert.deepEqual(await readProjectContext(filename), { projects: [entry] });
  for (const referenceSourceIds of [null, 'page-1', ['missing-page'], ['page-1', 'page-1']]) {
    const invalid = await contextFile(t, JSON.stringify({ projects: [{ ...project(), referenceSourceIds }] }));
    await assert.rejects(readProjectContext(invalid));
  }
});

test('rejects unsafe URLs both in sources and in cited evidence', async (t) => {
  for (const url of [
    'javascript:alert(1)', 'data:text/html,unsafe', 'file:///private/context.json',
    'http://example.test/docs/brief', 'https://user:password@example.test/docs/brief', 'not-a-url',
  ]) {
    for (const location of ['source', 'decision', 'question']) {
      const entry = project();
      if (location === 'source') entry.sources[0].url = url;
      if (location === 'decision') entry.decisions[0].evidence[0].url = url;
      if (location === 'question') entry.questions[0].evidence[0].url = url;
      const filename = await contextFile(t, JSON.stringify({ projects: [entry] }));
      await assert.rejects(readProjectContext(filename));
    }
  }
});

test('rejects misleading collection provenance and malformed coverage or dates', async (t) => {
  for (const change of [
    (entry) => { entry.collectionMode = 'automatic'; },
    (entry) => { entry.collectedAt = 'unknown'; },
    (entry) => { entry.sources[0].updatedAt = 'unknown'; },
    (entry) => { entry.coverage[0].complete = 'yes'; },
    (entry) => { entry.sources[0].provider = 'unsupported'; },
  ]) {
    const entry = project();
    change(entry);
    const filename = await contextFile(t, JSON.stringify({ projects: [entry] }));
    await assert.rejects(readProjectContext(filename));
  }
});
