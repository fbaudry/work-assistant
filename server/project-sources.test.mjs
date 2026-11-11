import assert from 'node:assert/strict';
import test from 'node:test';
import { projectSources } from './project-sources.mjs';

test('visibility alone never marks a source available and effective disabled state wins', () => {
  const result = projectSources([
    { id: 'notion', name: 'Notion', isEnabled: true, isAccessible: true },
    { id: 'linear', name: 'Linear', isEnabled: false, isAccessible: true },
    { id: 'slack', name: 'Slack', isEnabled: true, isAccessible: true },
  ], [
    { id: 'linear', enabled: true, callable: true },
    { id: 'slack', enabled: false, callable: true },
  ]);
  assert.deepEqual(result.map(({ provider, status }) => ({ provider, status })), [
    { provider: 'notion', status: 'unavailable' },
    { provider: 'linear', status: 'disabled' },
    { provider: 'slack', status: 'disabled' },
  ]);
});

test('only official HTTPS ChatGPT installation links reach the browser', () => {
  for (const installUrl of [
    'https://attacker.example/install',
    'https://chatgpt.com.attacker.example/install',
    'http://chatgpt.com/install',
    'https://chatgpt.com:8080/install',
    'https://user:secret@chatgpt.com/install',
    'javascript:alert(1)',
    'not-a-url',
  ]) {
    const [source] = projectSources([
      { id: 'notion', name: 'Notion', isEnabled: true, isAccessible: false, installUrl },
    ], []);
    assert.equal(source.installUrl, null, installUrl);
    assert.equal(source.status, 'not_connected');
  }
});

test('an installed callable provider is preferred to its unconnected directory duplicate', () => {
  const [source] = projectSources([
    { id: 'notion-directory', name: 'Notion', isEnabled: true, isAccessible: false },
    { id: 'notion-connected', name: 'Notion', isEnabled: true, isAccessible: true },
  ], [{ id: 'notion-connected', enabled: true, callable: true }]);
  assert.equal(source.id, 'notion-connected');
  assert.equal(source.status, 'available');
});

test('installed providers remain available when absent from the public app directory', () => {
  const sources = projectSources([
    { id: 'unrelated', name: 'Gradient Maker - Linear Color', isEnabled: true, isAccessible: false },
  ], [
    { id: 'connected-notion', runtimeName: 'Notion', enabled: true, callable: true },
    { id: 'connected-linear', runtimeName: 'Linear', enabled: true, callable: true },
    { id: 'connected-slack', runtimeName: 'Slack', enabled: true, callable: true },
  ]);
  assert.deepEqual(sources.map(({ provider, id, status, installUrl }) => ({ provider, id, status, installUrl })), [
    { provider: 'notion', id: 'connected-notion', status: 'available', installUrl: null },
    { provider: 'linear', id: 'connected-linear', status: 'available', installUrl: null },
    { provider: 'slack', id: 'connected-slack', status: 'available', installUrl: null },
  ]);
});
