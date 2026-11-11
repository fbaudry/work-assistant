import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createProjectAgents } from './project-agent.mjs';

function project(id = 'example-project') {
  return {
    id, name: 'Projet fictif', objective: 'Livrer un parcours de démonstration.',
    collectedAt: '2026-01-10T09:00:00.000Z', summary: 'Le premier ticket est en cours.',
    sources: [{ id: 'issue-1', title: 'Ticket fictif', url: 'https://example.test/issues/1', summary: 'En cours.' }],
  };
}

const report = {
  headline: 'Le premier parcours avance', summary: 'Le ticket est en cours. La livraison reste à vérifier.',
  updates: [{ kind: 'progress', title: 'Développement commencé', detail: 'Le ticket indique un travail en cours.', sourceIds: ['issue-1'] }],
  nextAction: 'Vérifier le résultat du premier parcours.',
};

async function fixture(t, projects = [project()]) {
  const directory = await mkdtemp(join(tmpdir(), 'work-assistant-agent-test-'));
  const dataDirectory = join(directory, 'private');
  const calls = [];
  let currentTime = new Date('2026-01-10T10:00:00.000Z');
  let context = { projects };
  const services = [];
  const auth = {
    generateProjectUpdate(input) {
      const result = Promise.withResolvers();
      calls.push({ ...input, ...result });
      return result.promise;
    },
  };
  function create() {
    const service = createProjectAgents({ auth, dataDirectory, readContext: async () => context,
      now: () => currentTime, startTimer: false });
    services.push(service);
    return service;
  }
  t.after(async () => {
    for (const service of services) await service.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    agent: create(), create, calls, dataDirectory,
    setProjects(value) { context = { projects: value }; },
    setTime(value) { currentTime = new Date(value); },
  };
}

async function settled(agent, id = 'example-project') {
  // Generation is controlled by the test; yield only for the atomic file write.
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const state = await agent.state(id);
    if (state.status !== 'running') return state;
    await new Promise(setImmediate);
  }
  assert.fail('Agent did not finish its controlled generation');
}

function complete(call, value = report) {
  call.resolve({ text: JSON.stringify(value), model: 'test-model' });
}

test('coalesces concurrent checks and skips unchanged context after a private, cited report is saved', async (t) => {
  const { agent, calls, dataDirectory } = await fixture(t);
  await Promise.all([agent.act('example-project', 'check'), agent.act('example-project', 'check')]);
  assert.equal(calls.length, 1);
  assert.equal((await agent.state('example-project')).status, 'running');
  assert.match(calls[0].prompt, /CONTEXTE/);
  complete(calls[0]);
  const state = await settled(agent);
  assert.equal(state.status, 'idle');
  assert.equal(state.reports.length, 1);
  assert.deepEqual(state.reports[0], {
    headline: report.headline, summary: report.summary, nextAction: report.nextAction,
    updates: [{ kind: 'progress', title: 'Développement commencé', detail: 'Le ticket indique un travail en cours.',
      evidence: [{ title: 'Ticket fictif', url: 'https://example.test/issues/1' }] }],
    id: state.reports[0].id, createdAt: '2026-01-10T10:00:00.000Z',
    contextAt: '2026-01-10T09:00:00.000Z', model: 'test-model',
  });
  assert.match(state.reports[0].id, /^[a-f0-9-]{36}$/);
  const saved = JSON.parse(await readFile(join(dataDirectory, 'agents.json'), 'utf8'));
  assert.deepEqual(saved.agents[0].reports, state.reports);
  assert.equal((await stat(dataDirectory)).mode & 0o777, 0o700);
  assert.equal((await stat(join(dataDirectory, 'agents.json'))).mode & 0o777, 0o600);
  await agent.act('example-project', 'check');
  await agent.checkAll();
  assert.equal(calls.length, 1);
});

test('rejects fabricated citations while retaining the last successful report and allowing an explicit retry', async (t) => {
  const { agent, calls } = await fixture(t);
  await agent.act('example-project', 'run');
  complete(calls[0]);
  const previous = (await settled(agent)).reports;
  await agent.act('example-project', 'run');
  assert.match(calls[1].prompt, /CONTEXTE IDENTIQUE AU DERNIER POINT : OUI/);
  complete(calls[1], { ...report, updates: [{ ...report.updates[0], sourceIds: ['invented-source'] }] });
  const failed = await settled(agent);
  assert.equal(failed.status, 'error');
  assert.deepEqual(failed.reports, previous);
  assert.doesNotMatch(failed.error, /invented-source|JSON|stack/);
  await agent.act('example-project', 'run');
  complete(calls[2], { ...report, headline: 'Point corrigé' });
  const retried = await settled(agent);
  assert.equal(retried.status, 'idle');
  assert.equal(retried.reports[0].headline, 'Point corrigé');
  assert.deepEqual(retried.reports[1], previous[0]);
});

test('local notes are analyzed without invented sources and only content changes trigger another point', async (t) => {
  const { agent, calls } = await fixture(t, []);
  const local = { id: 'local-example', name: 'Projet fictif', objective: 'Préparer un prototype.', notes: 'Le premier écran est prêt.', updatedAt: '2026-01-10T09:00:00.000Z' };
  await agent.act(local.id, 'check', local);
  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /Le premier écran est prêt/);
  const update = { ...report, updates: [{ kind: 'progress', title: 'Premier écran prêt', detail: 'Les notes indiquent que cet écran est prêt.', sourceIds: [] }] };
  complete(calls[0], update);
  assert.deepEqual((await settled(agent, local.id)).reports[0].updates[0].evidence, []);
  await agent.act(local.id, 'check', { ...local, updatedAt: '2026-01-10T09:10:00.000Z' });
  assert.equal(calls.length, 1);
  await agent.act(local.id, 'check', { ...local, notes: 'Le second écran est prêt.', updatedAt: '2026-01-10T09:15:00.000Z' });
  assert.equal(calls.length, 2);
  assert.match(calls[1].prompt, /Le second écran est prêt/);
  complete(calls[1], update);
  await settled(agent, local.id);
});

test('pause aborts an active run, ignores its late result, and resume starts a fresh run', async (t) => {
  const { agent, calls } = await fixture(t);
  await agent.act('example-project', 'run');
  const paused = await agent.act('example-project', 'pause');
  assert.equal(paused.status, 'paused');
  assert.equal(paused.startedAt, null);
  assert.equal(calls[0].signal.aborted, true);
  await agent.act('example-project', 'check');
  await agent.checkAll();
  assert.equal(calls.length, 1);
  await agent.act('example-project', 'resume');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].signal.aborted, false);
  complete(calls[0], { ...report, headline: 'Résultat abandonné' });
  await new Promise(setImmediate);
  assert.equal((await agent.state('example-project')).status, 'running');
  assert.deepEqual((await agent.state('example-project')).reports, []);
  complete(calls[1], { ...report, headline: 'Résultat après reprise' });
  const state = await settled(agent);
  assert.equal(state.enabled, true);
  assert.deepEqual(state.reports.map((item) => item.headline), ['Résultat après reprise']);
});

test('a new service preserves paused agents and their cached reports', async (t) => {
  const { agent, create, calls } = await fixture(t);
  await agent.act('example-project', 'run');
  complete(calls[0]);
  const reports = (await settled(agent)).reports;
  await agent.act('example-project', 'pause');
  await agent.close();
  const reloaded = create();
  const state = await reloaded.state('example-project');
  assert.equal(state.status, 'paused');
  assert.equal(state.enabled, false);
  assert.deepEqual(state.reports, reports);
  await reloaded.act('example-project', 'check');
  await reloaded.checkAll();
  assert.equal(calls.length, 1);
});

test('a restart retries an interrupted changed snapshot instead of caching an unfinished run', async (t) => {
  const { agent, create, calls, setProjects } = await fixture(t);
  await agent.act('example-project', 'check');
  complete(calls[0]);
  const reports = (await settled(agent)).reports;
  setProjects([{ ...project(), summary: 'Le ticket est maintenant en revue.' }]);
  await agent.act('example-project', 'check');
  assert.equal(calls.length, 2);
  await agent.close();
  assert.equal(calls[1].signal.aborted, true);
  const reloaded = create();
  assert.deepEqual((await reloaded.state('example-project')).reports, reports);
  await reloaded.act('example-project', 'check');
  assert.equal(calls.length, 3);
  complete(calls[1], { ...report, headline: 'Ancien processus' });
  complete(calls[2], { ...report, headline: 'Après redémarrage' });
  const state = await settled(reloaded);
  assert.deepEqual(state.reports.map((item) => item.headline), ['Après redémarrage', report.headline]);
  await reloaded.close();
  const cached = create();
  await cached.act('example-project', 'check');
  assert.equal(calls.length, 3);
});

test('background checks require a recent heartbeat and analyze changes for every enabled project only', async (t) => {
  const initial = [project('project-a'), project('project-b'), project('project-c')];
  const { agent, calls, setProjects, setTime } = await fixture(t, initial);
  await agent.state('project-a');
  await agent.state('project-b');
  await agent.act('project-c', 'pause');
  await agent.checkAll();
  assert.equal(calls.length, 0);
  await agent.act('project-a', 'check');
  await agent.checkAll();
  assert.equal(calls.length, 2);
  complete(calls[0]);
  complete(calls[1]);
  await settled(agent, 'project-a');
  await settled(agent, 'project-b');
  setProjects(initial.map((value) => ({ ...value, summary: 'Une nouvelle étape est documentée.' })));
  setTime('2026-01-10T10:01:29.000Z');
  await Promise.all([agent.checkAll(), agent.checkAll()]);
  assert.equal(calls.length, 4);
  assert.match(calls[2].prompt, /"id":"project-a"/);
  assert.match(calls[3].prompt, /"id":"project-b"/);
  complete(calls[2]);
  complete(calls[3]);
  await settled(agent, 'project-a');
  await settled(agent, 'project-b');
  setProjects(initial.map((value) => ({ ...value, summary: 'Une autre étape est documentée.' })));
  setTime('2026-01-10T10:01:31.000Z');
  await agent.checkAll();
  assert.equal(calls.length, 4);
  agent.heartbeat();
  await agent.checkAll();
  assert.equal(calls.length, 6);
  assert.equal((await agent.state('project-c')).status, 'paused');
  complete(calls[4]);
  complete(calls[5]);
  await settled(agent, 'project-a');
  await settled(agent, 'project-b');
});
