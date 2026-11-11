class Updates {
  constructor(updater, enabled, notify) {
    this.updater = updater;
    this.enabled = enabled;
    this.notify = notify;
    this.state = enabled
      ? { status: 'idle', message: 'Les mises à jour sont vérifiées au démarrage.' }
      : { status: 'development', message: 'Version locale. Les mises à jour seront disponibles avec la première version signée.' };

    updater.channel = 'alpha';
    updater.allowPrerelease = true;
    updater.allowDowngrade = false;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.on('checking-for-update', () => this.set({ status: 'checking' }));
    updater.on('update-available', ({ version }) => this.set({ status: 'available', version }));
    updater.on('download-progress', ({ percent }) => this.set({
      status: 'downloading', version: this.state.version, progress: Math.round(percent),
    }));
    updater.on('update-not-available', () => this.set({ status: 'idle', message: 'Tu disposes de la dernière version.' }));
    updater.on('update-downloaded', ({ version }) => this.set({ status: 'ready', version }));
    updater.on('error', () => this.set({
      status: 'error', message: 'La mise à jour a échoué. Vérifie ta connexion puis réessaie. La version actuelle reste utilisable.',
    }));
  }

  set(state) {
    this.state = state;
    this.notify(state);
  }

  async check() {
    if (!this.enabled || ['checking', 'available', 'downloading', 'ready'].includes(this.state.status)) return this.state;
    this.set({ status: 'checking' });
    try {
      const result = await this.updater.checkForUpdates();
      await result?.downloadPromise;
    } catch {
      this.set({ status: 'error', message: 'Impossible de vérifier les mises à jour. Réessaie dans un instant.' });
    }
    return this.state;
  }

  install() {
    if (!this.enabled || this.state.status !== 'ready') return false;
    this.updater.quitAndInstall();
    return true;
  }
}

module.exports = { Updates };
