import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseVersion } from './version.mjs';

test('versions distinguish successive runs and retries without relying on build metadata', () => {
  assert.equal(releaseVersion('42', '1'), '0.1.0-alpha.42.1');
  assert.equal(releaseVersion('42', '2'), '0.1.0-alpha.42.2');
  assert.equal(releaseVersion('43', '1'), '0.1.0-alpha.43.1');
});

test('invalid CI metadata cannot create an ambiguous version', () => {
  for (const value of [undefined, '0', '01', '-1', 'alpha', '42\n']) assert.throws(() => releaseVersion(value, '1'));
  assert.throws(() => releaseVersion('42', '0'));
});
