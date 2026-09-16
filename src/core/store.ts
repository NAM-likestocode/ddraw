import type { AppStateData, Element, FileRecord } from './types';
import { createNonce } from './ids';
export type ChangeOrigin = 'local' | 'remote' | 'history';
type StoreListener = (changedIds: Set<string>, origin: ChangeOrigin) => void;
type StateListener = (state: Readonly<AppStateData>) => void;
interface Snapshot {
  elements: Map<string, Element>;
  order: string[];
  files: Record<string, FileRecord>;
}
export class AppState {
  private listeners = new Set<StateListener>();
  constructor(public readonly value: AppStateData) {}
  update(patch: Partial<AppStateData> | ((state: AppStateData) => void)): void {
    if (typeof patch === 'function') patch(this.value);
    else Object.assign(this.value, patch);
    for (const listener of this.listeners) listener(this.value);
  }
  onChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
export class SceneStore {
  private elements = new Map<string, Element>();
  private order: string[] = [];
  private listeners = new Set<StoreListener>();
  private orderedElements: Element[] | null = null;
  private orderedElementsWithDeleted: Element[] | null = null;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private groupBefore: Snapshot | null = null;
  files: Record<string, FileRecord> = {};
  on(event: 'change', listener: StoreListener): () => void {
    void event;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(ids: Set<string>, origin: ChangeOrigin): void {
    this.orderedElements = null;
    this.orderedElementsWithDeleted = null;
    for (const listener of this.listeners) listener(ids, origin);
  }
  private snapshot(): Snapshot {
    return { elements: new Map(this.elements), order: [...this.order], files: { ...this.files } };
  }
  private remember(before: Snapshot): void {
    if (this.groupBefore) return;
    this.undoStack.push(before);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }
  beginHistoryGroup(): void {
    if (!this.groupBefore) this.groupBefore = this.snapshot();
  }
  endHistoryGroup(): void {
    if (!this.groupBefore) return;
    this.undoStack.push(this.groupBefore);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.groupBefore = null;
    this.redoStack = [];
  }
  get(id: string): Element | undefined {
    return this.elements.get(id);
  }
  getElements(includeDeleted = false): Element[] {
    const cached = includeDeleted ? this.orderedElementsWithDeleted : this.orderedElements;
    if (cached) return cached;
    const elements: Element[] = [];
    for (const id of this.order) {
      const element = this.elements.get(id);
      if (element && (includeDeleted || !element.isDeleted)) elements.push(element);
    }
    if (includeDeleted) this.orderedElementsWithDeleted = elements;
    else this.orderedElements = elements;
    return elements;
  }
  getSnapshotForSync(): Element[] {
    return this.getElements(true);
  }
  add(element: Element, origin: ChangeOrigin = 'local'): void {
    const before = origin === 'local' && !this.groupBefore ? this.snapshot() : null;
    this.elements.set(element.id, element);
    if (!this.order.includes(element.id)) this.order.push(element.id);
    if (before) this.remember(before);
    this.emit(new Set([element.id]), origin);
  }
  update(
    ids: Iterable<string>,
    mutator: (element: Element) => Element | void,
    origin: ChangeOrigin = 'local',
  ): void {
    const list = [...ids];
    const before = origin === 'local' && !this.groupBefore ? this.snapshot() : null;
    const changed = new Set<string>();
    for (const id of list) {
      const old = this.elements.get(id);
      if (!old) continue;
      const draft = structuredClone(old) as Element;
      const result = mutator(draft);
      const next = (result ?? draft) as Element;
      next.version = old.version + 1;
      next.versionNonce = createNonce();
      this.elements.set(id, next);
      changed.add(id);
    }
    if (!changed.size) return;
    if (before) this.remember(before);
    this.emit(changed, origin);
  }
  remove(ids: Iterable<string>): void {
    this.update(ids, (e) => {
      e.isDeleted = true;
    });
  }
  reorder(ids: Iterable<string>, action: 'forward' | 'backward' | 'front' | 'back'): void {
    const before = this.groupBefore ? null : this.snapshot();
    const selected = new Set(ids);
    if (action === 'front')
      this.order = [
        ...this.order.filter((id) => !selected.has(id)),
        ...this.order.filter((id) => selected.has(id)),
      ];
    else if (action === 'back')
      this.order = [
        ...this.order.filter((id) => selected.has(id)),
        ...this.order.filter((id) => !selected.has(id)),
      ];
    else if (action === 'forward') {
      for (let i = this.order.length - 2; i >= 0; i--)
        if (selected.has(this.order[i]!) && !selected.has(this.order[i + 1]!))
          [this.order[i], this.order[i + 1]] = [this.order[i + 1]!, this.order[i]!];
    } else {
      for (let i = 1; i < this.order.length; i++)
        if (selected.has(this.order[i]!) && !selected.has(this.order[i - 1]!))
          [this.order[i], this.order[i - 1]] = [this.order[i - 1]!, this.order[i]!];
    }
    if (before) this.remember(before);
    this.emit(new Set(selected), 'local');
  }
  replaceScene(
    elements: Element[],
    files: Record<string, FileRecord> = {},
    origin: ChangeOrigin = 'local',
  ): void {
    const before = origin === 'local' && !this.groupBefore ? this.snapshot() : null;
    const changed = new Set([...this.order, ...elements.map((element) => element.id)]);
    this.elements = new Map(elements.map((e) => [e.id, e]));
    this.order = elements.map((e) => e.id);
    this.files = { ...files };
    if (before) this.remember(before);
    this.emit(changed, origin);
  }
  applyRemote(incoming: Element[]): void {
    const changed = new Set<string>();
    for (const next of incoming) {
      const old = this.elements.get(next.id);
      if (
        !old ||
        next.version > old.version ||
        (next.version === old.version && next.versionNonce < old.versionNonce)
      ) {
        this.elements.set(next.id, next);
        if (!old) this.order.push(next.id);
        changed.add(next.id);
      }
    }
    if (changed.size) this.emit(changed, 'remote');
  }
  undo(): boolean {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.redoStack.push(this.snapshot());
    this.restore(snap);
    return true;
  }
  redo(): boolean {
    const snap = this.redoStack.pop();
    if (!snap) return false;
    this.undoStack.push(this.snapshot());
    this.restore(snap);
    return true;
  }
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.groupBefore = null;
  }
  private restore(s: Snapshot): void {
    const changed = new Set([...this.order, ...s.order]);
    this.elements = new Map(s.elements);
    this.order = [...s.order];
    this.files = { ...s.files };
    this.emit(changed, 'history');
  }
}
