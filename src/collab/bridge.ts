import * as Y from 'yjs';
import { createNonce } from '../core/ids';
import type { SceneStore } from '../core/store';
import type { Element, FileRecord } from '../core/types';

export type PlainElement = Element;

function wins(a: Element, b: Element): boolean {
  return a.version > b.version || (a.version === b.version && a.versionNonce < b.versionNonce);
}

/** DOM-free bridge between a SceneStore and a Y.Doc. */
export class CollabBridge {
  readonly elementsMap: Y.Map<PlainElement>;
  readonly filesMap: Y.Map<FileRecord>;
  private readonly origin = Symbol('ddraw-collab');
  private readonly known = new Map<string, Element>();
  private pending = new Set<string>();
  private queued = false;
  private unsubscribe: () => void;

  constructor(
    readonly doc: Y.Doc,
    private readonly store: SceneStore,
    private readonly onRemote: () => void = () => {},
  ) {
    this.elementsMap = doc.getMap<PlainElement>('elements');
    this.filesMap = doc.getMap<FileRecord>('files');
    for (const element of store.getSnapshotForSync())
      this.known.set(element.id, structuredClone(element));

    this.unsubscribe = store.on('change', (ids, changeOrigin) => {
      if (changeOrigin === 'remote') return;
      for (const id of ids) this.pending.add(id);
      if (!this.queued) {
        this.queued = true;
        queueMicrotask(() => this.flush());
      }
    });

    this.elementsMap.observe((event, transaction) => {
      if (transaction.origin === this.origin) return;
      const incoming: Element[] = [];
      for (const id of event.keysChanged) {
        const value = this.elementsMap.get(id);
        if (value) incoming.push(structuredClone(value));
      }
      this.store.applyRemote(incoming);

      // A Y.Map resolves concurrent writes by Yjs' item ordering. Re-assert the
      // winner according to Ddraw's version/nonce rule so every peer converges.
      const corrections: Element[] = [];
      for (const remote of incoming) {
        const local = this.store.get(remote.id);
        if (local && wins(local, remote)) corrections.push(local);
        else if (local) this.known.set(local.id, structuredClone(local));
      }
      this.onRemote();
      if (corrections.length) {
        this.doc.transact(() => {
          for (const element of corrections)
            this.elementsMap.set(element.id, structuredClone(element));
        }, this.origin);
      }
    });

    this.filesMap.observe((event, transaction) => {
      if (transaction.origin === this.origin) return;
      for (const id of event.keysChanged) {
        const file = this.filesMap.get(id);
        if (file) this.store.files[id] = structuredClone(file);
      }
      this.onRemote();
    });
  }

  private flush(): void {
    this.queued = false;
    if (!this.pending.size) return;
    const ids = this.pending;
    this.pending = new Set();
    this.doc.transact(() => {
      for (const id of ids) {
        const current = this.store.get(id);
        if (current) {
          const copy = structuredClone(current);
          this.known.set(id, copy);
          this.elementsMap.set(id, copy);
        } else {
          const previous = this.known.get(id) ?? this.elementsMap.get(id);
          if (previous) {
            const deleted = {
              ...structuredClone(previous),
              isDeleted: true,
              version: previous.version + 1,
              versionNonce: createNonce(),
            } as Element;
            this.known.set(id, deleted);
            this.elementsMap.set(id, deleted);
          }
        }
      }
      for (const [id, file] of Object.entries(this.store.files)) {
        if (!this.filesMap.has(id)) this.filesMap.set(id, structuredClone(file));
      }
    }, this.origin);
  }

  /** Populate an empty room from the current local scene. */
  pushFull(): void {
    this.doc.transact(() => {
      for (const element of this.store.getSnapshotForSync()) {
        const copy = structuredClone(element);
        this.known.set(element.id, copy);
        this.elementsMap.set(element.id, copy);
      }
      for (const [id, file] of Object.entries(this.store.files))
        this.filesMap.set(id, structuredClone(file));
    }, this.origin);
  }

  /** Apply the room's current state after initial synchronization. */
  pullFull(): void {
    this.store.applyRemote([...this.elementsMap.values()].map((value) => structuredClone(value)));
    for (const [id, file] of this.filesMap) this.store.files[id] = structuredClone(file);
    for (const element of this.store.getSnapshotForSync())
      this.known.set(element.id, structuredClone(element));
  }

  destroy(): void {
    this.flush();
    this.unsubscribe();
  }
}
