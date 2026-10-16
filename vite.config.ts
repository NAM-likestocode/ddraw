import { defineConfig } from 'vite';
import { version } from './package.json';

export default defineConfig({
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(version) },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  server: { port: 1420, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
