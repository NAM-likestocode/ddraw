import './ui/theme.css';
import { App } from './app/App';
declare global {
  interface Window {
    __ddraw: { app: App; stress(n?: number): void };
  }
}
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app');
const app = new App(root);
window.__ddraw = { app, stress: (n = 5000) => app.stress(n) };
