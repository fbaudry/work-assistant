// Only these providers are part of the current project setup. Never return the
// user's complete app inventory, account details or connector credentials.
export function projectSources(apps, installedApps) {
  return [['notion', 'Notion'], ['linear', 'Linear'], ['slack', 'Slack']].map(([provider, name]) => {
    const namedRuntime = installedApps.find((installed) => typeof installed.runtimeName === 'string' && installed.runtimeName.toLowerCase() === provider);
    const matches = apps.filter((app) => typeof app.name === 'string' && app.name.toLowerCase() === provider);
    const app = apps.find((item) => item.id === namedRuntime?.id)
      ?? matches.find((item) => installedApps.some((installed) => installed.id === item.id && installed.enabled && installed.callable))
      ?? matches.find((item) => item.isAccessible) ?? matches[0];
    const runtime = namedRuntime ?? (app && installedApps.find((item) => item.id === app.id));
    const url = app?.installUrl && URL.canParse(app.installUrl) ? new URL(app.installUrl) : null;
    const installUrl = url?.protocol === 'https:' && url.hostname === 'chatgpt.com' && !url.port && !url.username && !url.password
      ? url.href : null;
    const source = { provider, id: runtime?.id ?? app?.id ?? null, name, installUrl };

    if (app?.isEnabled === false || runtime?.enabled === false) {
      return { ...source, status: 'disabled', message: 'Cette source est désactivée dans ton compte ou sa configuration.' };
    }
    if (runtime?.enabled && runtime.callable) {
      return { ...source, status: 'available', message: 'Des outils de cette source sont accessibles. Le contexte du projet peut être préparé.' };
    }
    if (!app && !runtime) return { ...source, status: 'unavailable', message: 'Cette source n’apparaît pas dans le catalogue de cette session OpenAI.' };
    if (app && !app.isAccessible && !runtime) {
      return { ...source, status: 'not_connected', message: 'Connecte cette source depuis OpenAI, puis vérifie à nouveau.' };
    }
    return { ...source, status: 'unavailable', message: 'La source est visible, mais ses outils ne sont pas disponibles pour Work Assistant.' };
  });
}
