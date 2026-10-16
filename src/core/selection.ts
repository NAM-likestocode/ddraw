import type { AppState, SceneStore } from './store';
import type { Element } from './types';
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
