export interface Platform {
  openFile(): Promise<{ name: string; data: string } | null>;
  saveFile(suggestedName: string, data: string, onlySaveAs?: boolean): Promise<string | null>;
  isDesktop: boolean;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
};
class BrowserPlatform implements Platform {
  isDesktop = false;
  private handle: FileSystemFileHandle | null = null;
  async openFile(): Promise<{ name: string; data: string } | null> {
    const picker = (window as PickerWindow).showOpenFilePicker;
    if (picker) {
      const [handle] = await picker({
        types: [
          { description: 'Ddraw files', accept: { 'application/json': ['.ddraw', '.excalidraw'] } },
        ],
      });
      if (!handle) return null;
      this.handle = handle;
      const file = await handle.getFile();
      return { name: file.name, data: await file.text() };
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ddraw,.excalidraw,application/json';
      input.onchange = async () => {
        const file = input.files?.[0];
        resolve(file ? { name: file.name, data: await file.text() } : null);
      };
      input.click();
    });
  }
  async saveFile(name: string, data: string, onlySaveAs = false): Promise<string | null> {
    const picker = (window as PickerWindow).showSaveFilePicker;
    if (picker) {
      let handle = this.handle;
      if (!handle || onlySaveAs)
        handle = await picker({
          suggestedName: name,
          types: [{ description: 'Ddraw file', accept: { 'application/json': ['.ddraw'] } }],
        });
      this.handle = handle;
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return handle.name;
    }
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return name;
  }
}
let current: Platform = new BrowserPlatform();
export const getPlatform = (): Platform => current;
export const setPlatform = (platform: Platform): void => {
  current = platform;
};
