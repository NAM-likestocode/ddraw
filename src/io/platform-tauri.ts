import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { Platform } from './platform';

const filters = [
  { name: 'Ddraw (*.ddraw)', extensions: ['ddraw'] },
  { name: 'Excalidraw (*.excalidraw)', extensions: ['excalidraw'] },
  { name: 'JSON', extensions: ['json'] },
];

let currentPath: string | null = null;

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

export const tauriPlatform: Platform = {
  isDesktop: true,

  async openFile() {
    const path = await open({ multiple: false, directory: false, filters });
    if (!path) return null;
    currentPath = path;
    return { name: fileName(path), data: await readTextFile(path) };
  },

  async saveFile(suggestedName, data, onlySaveAs = false) {
    let path = onlySaveAs ? null : currentPath;
    if (!path) path = await save({ defaultPath: suggestedName, filters });
    if (!path) return null;
    await writeTextFile(path, data);
    currentPath = path;
    return fileName(path);
  },

  async saveBinary(suggestedName, data, mime) {
    const extension = suggestedName.split('.').pop() ?? '';
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: mime, extensions: [extension] }],
    });
    if (!path) return null;
    const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
    await writeFile(path, bytes);
    return fileName(path);
  },
};

export async function getLaunchFile(): Promise<{ name: string; data: string } | null> {
  const path = await invoke<string | null>('launch_file');
  if (!path) return null;
  currentPath = path;
  return { name: fileName(path), data: await readTextFile(path) };
}
