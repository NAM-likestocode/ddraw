import './ui/theme.css';
import { App } from './app/App';
import { setPlatform } from './io/platform';

declare global {
  interface Window {
    __ddraw: { app: App; stress(n?: number): void };
  }
}

const desktop = '__TAURI_INTERNALS__' in window ? await import('./io/platform-tauri') : null;
if (desktop) setPlatform(desktop.tauriPlatform);

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app');
const app = new App(root);
window.__ddraw = { app, stress: (n = 5000) => app.stress(n) };

if (desktop) {
  try {
    const launchFile = await desktop.getLaunchFile();
    if (launchFile) app.loadFromString(launchFile.name, launchFile.data);
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Could not open launch file');
  }
}
