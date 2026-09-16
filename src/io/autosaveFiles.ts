import type { FileRecord } from '../core/types';

const DATABASE = 'ddraw-autosave';
const VERSION = 1;
const STORE = 'files';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE))
        database.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open autosave database'));
  });
}

export async function saveAutosaveFiles(files: Record<string, FileRecord>): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      store.clear();
      for (const file of Object.values(files)) store.put(file);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not autosave images'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Could not autosave images'));
    });
  } finally {
    database.close();
  }
}

export async function loadAutosaveFiles(): Promise<Record<string, FileRecord>> {
  const database = await openDatabase();
  try {
    const files = await new Promise<FileRecord[]>((resolve, reject) => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result as FileRecord[]);
      request.onerror = () =>
        reject(request.error ?? new Error('Could not restore autosaved images'));
    });
    return Object.fromEntries(files.map((file) => [file.id, file]));
  } finally {
    database.close();
  }
}
