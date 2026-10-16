import type { Element } from './types';
import { createId, createNonce } from './ids';

/**
 * Copies `elements` as new elements moved by `offset`. Links between the
 * copied elements (groups, attached arrows, mind-map branches) point at the
 * copies; links to anything that was not copied are dropped. A mind-map topic
 * copied without its parent becomes the main topic of a new map.
 */
export function duplicateElements(
  elements: readonly Element[],
  offset = { x: 20, y: 20 },
): Element[] {
  const ids = new Map(elements.map((e) => [e.id, createId()]));
  const groups = new Map<string, string>();
  const group = (id: string) => {
    let next = groups.get(id);
    if (!next) groups.set(id, (next = createId()));
    return next;
  };
  const copies = elements.map((e) => {
    const copy = structuredClone(e);
    copy.id = ids.get(e.id)!;
    copy.x += offset.x;
    copy.y += offset.y;
    copy.version = 1;
    copy.versionNonce = createNonce();
    copy.seed = createNonce();
    copy.groupIds = e.groupIds.map(group);
    if (copy.type === 'line' || copy.type === 'arrow') {
      const remap = (b: { elementId: string } | null | undefined) =>
        b && ids.has(b.elementId) ? { elementId: ids.get(b.elementId)! } : null;
      copy.startBinding = remap(copy.startBinding);
      copy.endBinding = remap(copy.endBinding);
    }
    return copy;
  });
  const byId = new Map(copies.map((c) => [c.id, c]));
  // Each copied topic either keeps its copied parent or starts a new map.
  for (const copy of copies) {
    if (!('mindmap' in copy) || !copy.mindmap) continue;
    const parent = copy.mindmap.parentId ? ids.get(copy.mindmap.parentId) : undefined;
    if (parent) copy.mindmap.parentId = parent;
    else copy.mindmap = { ...copy.mindmap, parentId: null, rootId: copy.id, color: '' };
  }
  const rootOf = (id: string): string => {
    const el = byId.get(id);
    if (!el || !('mindmap' in el) || !el.mindmap || !el.mindmap.parentId) return id;
    return rootOf(el.mindmap.parentId);
  };
  for (const copy of copies)
    if ('mindmap' in copy && copy.mindmap) copy.mindmap.rootId = rootOf(copy.id);
  return copies;
}
