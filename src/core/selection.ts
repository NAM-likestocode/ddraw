import type { AppState, SceneStore } from './store';
import type { Element, Point } from './types';
import { boundsIntersect, elementBounds, hitTest } from './geometry';
import { descendantsOf, isNode, removeBranches } from './mindmap';
import { duplicateElements } from './duplicate';

/** The selected ids plus every topic below a selected mind-map topic. */
export function withBranches(store: SceneStore, ids: Iterable<string>): Set<string> {
  const out = new Set(ids);
  for (const id of [...out])
    if (isNode(store.get(id))) for (const d of descendantsOf(store, id)) out.add(d);
  return out;
}

/** Copies the selection (with whole mind-map branches) and selects the copies. */
export function duplicateSelection(store: SceneStore, state: AppState): void {
  const picked = state.value.selectedIds;
  const source = [...withBranches(store, picked)]
    .map((id) => store.get(id))
    .filter((e): e is Element => Boolean(e && !e.isDeleted));
  if (!source.length) return;
  const made = duplicateElements(source);
  store.beginHistoryGroup();
  for (const copy of made) store.add(copy);
  store.endHistoryGroup();
  state.update({
    selectedIds: new Set(made.filter((_, i) => picked.has(source[i]!.id)).map((e) => e.id)),
  });
}

/** Deletes the selection; deleting a topic removes its branch and selects its parent. */
export function deleteSelection(store: SceneStore, state: AppState): void {
  const ids = state.value.selectedIds;
  if (!ids.size) return;
  const nodes = [...ids].filter((id) => isNode(store.get(id)));
  store.beginHistoryGroup();
  const next = nodes.length ? removeBranches(store, nodes) : null;
  store.remove(ids);
  store.endHistoryGroup();
  state.update({ selectedIds: new Set(next ? [next] : []) });
}

/** Clipboard text that marks copied Ddraw elements. */
export const CLIPBOARD_PREFIX = 'ddraw-elements:';

/** The selected elements with whole mind-map branches, in drawing order. */
export function selectionWithBranches(store: SceneStore, state: AppState): Element[] {
  const ids = withBranches(store, state.value.selectedIds);
  return store.getElements().filter((e) => ids.has(e.id));
}

/** Clipboard text for the selection, or '' when nothing is selected. */
export function selectionToClipboard(store: SceneStore, state: AppState): string {
  const list = selectionWithBranches(store, state);
  return list.length ? CLIPBOARD_PREFIX + JSON.stringify(list) : '';
}

/**
 * Adds copies of elements from the clipboard and selects them. Returns false
 * when `text` is not copied Ddraw elements.
 */
export function pasteElements(
  store: SceneStore,
  state: AppState,
  text: string,
  at?: Point,
): boolean {
  if (!text.startsWith(CLIPBOARD_PREFIX)) return false;
  let incoming: Element[];
  try {
    incoming = JSON.parse(text.slice(CLIPBOARD_PREFIX.length)) as Element[];
  } catch {
    return false;
  }
  if (!Array.isArray(incoming) || !incoming.length) return false;
  let offset = { x: 20, y: 20 };
  if (at) {
    const minX = Math.min(...incoming.map((e) => elementBounds(e).minX));
    const minY = Math.min(...incoming.map((e) => elementBounds(e).minY));
    offset = { x: at.x - minX, y: at.y - minY };
  }
  const copies = duplicateElements(incoming, offset);
  store.beginHistoryGroup();
  for (const copy of copies) store.add(copy);
  store.endHistoryGroup();
  state.update({ selectedIds: new Set(copies.map((e) => e.id)) });
  return true;
}

/** The topmost unlocked element under `p`, if any. */
export function elementAt(store: SceneStore, p: Point, tolerance: number): Element | null {
  const list = store.getElements();
  const near = {
    minX: p.x - tolerance,
    minY: p.y - tolerance,
    maxX: p.x + tolerance,
    maxY: p.y + tolerance,
  };
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i]!;
    if (!e.locked && boundsIntersect(elementBounds(e), near) && hitTest(e, p, tolerance)) return e;
  }
  return null;
}
