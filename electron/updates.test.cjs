const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Updates } = require('./updates.cjs');

test('local builds never contact the release service or restart', async () => {
  const updater = new EventEmitter();
  updater.checkForUpdates = () => assert.fail('Local build checked updates');
  updater.quitAndInstall = () => assert.fail('Local build restarted');
  const updates = new Updates(updater, false, () => {});
  assert.equal((await updates.check()).status, 'development');
  assert.equal(updates.install(), false);
});

test('download completes before an explicit restart is allowed', async () => {
  const updater = new EventEmitter();
  let installs = 0;
  updater.checkForUpdates = async () => updater.emit('update-available', { version: '0.1.0-alpha.2.1' });
  updater.quitAndInstall = () => { installs += 1; };
  const observed = [];
  const updates = new Updates(updater, true, (state) => observed.push(state));
  await updates.check();
  updater.emit('download-progress', { percent: 51.6 });
  assert.deepEqual(updates.state, { status: 'downloading', version: '0.1.0-alpha.2.1', progress: 52 });
  assert.equal(updates.install(), false);
  updater.emit('update-downloaded', { version: '0.1.0-alpha.2.1' });
  assert.equal(installs, 0);
  assert.equal(updates.install(), true);
  assert.equal(installs, 1);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.deepEqual(observed.map(({ status }) => status), ['checking', 'available', 'downloading', 'ready']);
});

test('network failure can be retried without leaving the app stuck checking', async () => {
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => { throw new Error('offline'); };
  const updates = new Updates(updater, true, () => {});
  assert.equal((await updates.check()).status, 'error');
  updater.checkForUpdates = async () => updater.emit('update-not-available');
  assert.deepEqual(await updates.check(), { status: 'idle', message: 'Tu disposes de la dernière version.' });
});

test('an overlapping check cannot discard a downloaded update', async () => {
  const updater = new EventEmitter();
  let checks = 0;
  updater.checkForUpdates = async () => { checks += 1; };
  const updates = new Updates(updater, true, () => {});
  await Promise.all([updates.check(), updates.check()]);
  assert.equal(checks, 1);
  updater.emit('update-downloaded', { version: '0.1.0-alpha.2.1' });
  await updates.check();
  assert.equal(checks, 1);
  assert.equal(updates.state.status, 'ready');
});

test('an interrupted automatic download is handled and can be retried', async () => {
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => ({ downloadPromise: Promise.reject(new Error('download interrupted')) });
  const updates = new Updates(updater, true, () => {});
  assert.equal((await updates.check()).status, 'error');
  assert.equal(updates.install(), false);
  updater.checkForUpdates = async () => {
    updater.emit('update-downloaded', { version: '0.1.0-alpha.2.1' });
    return { downloadPromise: Promise.resolve([]) };
  };
  assert.deepEqual(await updates.check(), { status: 'ready', version: '0.1.0-alpha.2.1' });
});
