import type { AppStateData, Element, FileRecord } from './types';
import { createNonce } from './ids';
import { hiddenByCollapse } from './mindmap';
export type ChangeOrigin = 'local' | 'remote' | 'history';
type StoreListener = (changedIds: Set<string>, origin: ChangeOrigin) => void;
type StateListener = (state: Readonly<AppStateData>) => void;
/**
 * One undo step: the touched elements before and after the change. Undo/redo
 * re-apply these states as new versions, so collaborators accept them and
 * elements that other people changed in the meantime are left alone.
 */
interface HistoryEntry {
  before: Map<string, Element | undefined>;
  after: Map<string, Element | undefined>;
  orderBefore: string[];
  orderAfter: string[];
}
interface OpenEntry {
  before: Map<string, Element | undefined>;
  orderBefore: string[];
  grouped: boolean;
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
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private open: OpenEntry | null = null;
  private deriver: ((changed: Set<string>) => void) | null = null;
  private deriving = false;
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
  /** Records the pre-change state of `ids`; returns true if this call opened the entry. */
  private track(ids: Iterable<string>): boolean {
    const opened = !this.open;
    if (!this.open) this.open = { before: new Map(), orderBefore: [...this.order], grouped: false };
    for (const id of ids)
      if (!this.open.before.has(id)) this.open.before.set(id, this.elements.get(id));
    return opened;
  }
  private commit(): void {
    const open = this.open;
    this.open = null;
    if (!open) return;
    const after = new Map<string, Element | undefined>();
    let changed = open.orderBefore.join() !== this.order.join();
    for (const [id, previous] of open.before) {
      const current = this.elements.get(id);
      after.set(id, current);
      if (current !== previous) changed = true;
    }
    if (!changed) return;
    this.undoStack.push({
      before: open.before,
      after,
      orderBefore: open.orderBefore,
      orderAfter: [...this.order],
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }
  /** Runs a local change, recording it as its own undo step unless a group is open. */
  private record(ids: Iterable<string>, change: () => void): void {
    const list = new Set(ids);
    const opened = this.track(list);
    change();
    if (this.deriver && !this.deriving) {
      this.deriving = true;
      try {
        this.deriver(list);
      } finally {
        this.deriving = false;
      }
    }
    if (opened) this.commit();
  }
  /**
   * Registers follow-up edits for local changes (e.g. attached arrows following
   * a moved shape). They run inside the same undo step.
   */
  setDeriver(deriver: ((changed: Set<string>) => void) | null): void {
    this.deriver = deriver;
  }
  beginHistoryGroup(): void {
    if (this.open) this.open.grouped = true;
    else this.open = { before: new Map(), orderBefore: [...this.order], grouped: true };
  }
  endHistoryGroup(): void {
    if (this.open?.grouped) this.commit();
  }
  get(id: string): Element | undefined {
    return this.elements.get(id);
  }
  /**
   * Elements in stacking order. By default this is what is on the canvas: deleted
   * elements and mind-map nodes inside a collapsed branch are left out.
   */
  getElements(includeDeleted = false): Element[] {
    const cached = includeDeleted ? this.orderedElementsWithDeleted : this.orderedElements;
    if (cached) return cached;
    const elements: Element[] = [];
    const hidden = includeDeleted ? null : hiddenByCollapse(this.elements);
    for (const id of this.order) {
      const element = this.elements.get(id);
      if (element && (includeDeleted || (!element.isDeleted && !hidden!.has(id))))
        elements.push(element);
    }
    if (includeDeleted) this.orderedElementsWithDeleted = elements;
    else this.orderedElements = elements;
    return elements;
  }
  getSnapshotForSync(): Element[] {
    return this.getElements(true);
  }
  add(element: Element, origin: ChangeOrigin = 'local'): void {
    const apply = () => {
      this.elements.set(element.id, element);
      if (!this.order.includes(element.id)) this.order.push(element.id);
    };
    if (origin === 'local') this.record([element.id], apply);
    else apply();
    this.emit(new Set([element.id]), origin);
  }
  update(
    ids: Iterable<string>,
    mutator: (element: Element) => Element | void,
    origin: ChangeOrigin = 'local',
  ): void {
    const list = [...ids].filter((id) => this.elements.has(id));
    if (!list.length) return;
    const apply = () => {
      for (const id of list) {
        const old = this.elements.get(id)!;
        const draft = structuredClone(old) as Element;
        const result = mutator(draft);
        const next = (result ?? draft) as Element;
        next.version = old.version + 1;
        next.versionNonce = createNonce();
        this.elements.set(id, next);
      }
    };
    if (origin === 'local') this.record(list, apply);
    else apply();
    this.emit(new Set(list), origin);
  }
  remove(ids: Iterable<string>): void {
    this.update(ids, (e) => {
      e.isDeleted = true;
    });
  }
  reorder(ids: Iterable<string>, action: 'forward' | 'backward' | 'front' | 'back'): void {
    const selected = new Set(ids);
    this.record([], () => this.applyReorder(selected, action));
    this.emit(new Set(selected), 'local');
  }
  private applyReorder(
    selected: Set<string>,
    action: 'forward' | 'backward' | 'front' | 'back',
  ): void {
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
  }
  replaceScene(
    elements: Element[],
    files: Record<string, FileRecord> = {},
    origin: ChangeOrigin = 'local',
  ): void {
    const changed = new Set([...this.order, ...elements.map((element) => element.id)]);
    const apply = () => {
      this.elements = new Map(elements.map((e) => [e.id, e]));
      this.order = elements.map((e) => e.id);
      this.files = { ...files };
    };
    if (origin === 'local') this.record(changed, apply);
    else apply();
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
    if (this.open) this.commit();
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push(entry);
    this.restore(entry.before, entry.orderBefore);
    return true;
  }
  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push(entry);
    this.restore(entry.after, entry.orderAfter);
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
    this.open = null;
  }
  /**
   * Re-applies recorded states as new versions. An element that did not exist
   * in the target state is soft-deleted rather than dropped, so peers see it go.
   */
  private restore(states: Map<string, Element | undefined>, order: string[]): void {
    const changed = new Set<string>();
    for (const [id, target] of states) {
      const current = this.elements.get(id);
      if (!target) {
        if (!current || current.isDeleted) continue;
        this.elements.set(id, {
          ...current,
          isDeleted: true,
          version: current.version + 1,
          versionNonce: createNonce(),
        });
      } else {
        this.elements.set(id, {
          ...structuredClone(target),
          version: Math.max(current?.version ?? 0, target.version) + 1,
          versionNonce: createNonce(),
        });
      }
      changed.add(id);
    }
    // Keep the recorded stacking order, plus anything added since (e.g. by peers).
    const known = new Set(order);
    const next = order.filter((id) => this.elements.has(id));
    for (const id of this.order) if (!known.has(id)) next.push(id);
    for (const id of changed) if (!next.includes(id)) next.push(id);
    if (next.join() !== this.order.join()) for (const id of next) changed.add(id);
    this.order = next;
    this.emit(changed, 'history');
  }
}
