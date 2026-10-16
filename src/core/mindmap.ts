import type { Element, FontFamily, MindmapLink, Point, ShapeElement } from './types';
import type { SceneStore } from './store';
import { createId, createNonce } from './ids';
import { LABEL_PADDING, LINE_HEIGHT, measureText } from './text';
export type MindmapNode = ShapeElement & { mindmap: MindmapLink };
/** Colours given to the main branches in turn; sub-branches keep their branch's colour. */
export const BRANCH_COLORS = [
  '#88C0D0',
  '#A3BE8C',
  '#EBCB8B',
  '#D08770',
  '#B48EAD',
  '#8FBCBB',
  '#BF616A',
  '#81A1C1',
];
const ROOT_GAP = 72;
const BRANCH_GAP = 44;
const SIBLING_GAP = 14;
export function isNode(el: Element | undefined | null): el is MindmapNode {
  return Boolean(el && !el.isDeleted && 'mindmap' in el && el.mindmap);
}
export function isRoot(el: Element | undefined | null): el is MindmapNode {
  return isNode(el) && el.mindmap.parentId === null;
}
/** All live nodes of the mind map rooted at `rootId`. */
export function nodesOf(store: SceneStore, rootId: string): MindmapNode[] {
  return store
    .getElements(true)
    .filter((el): el is MindmapNode => isNode(el) && el.mindmap.rootId === rootId);
}
export function childrenOf(store: SceneStore, id: string): MindmapNode[] {
  const parent = store.get(id);
  if (!isNode(parent)) return [];
  return nodesOf(store, parent.mindmap.rootId)
    .filter((n) => n.mindmap.parentId === id)
    .sort((a, b) => a.mindmap.order - b.mindmap.order);
}
/** Ids of a node's children, grandchildren and so on (not the node itself). */
export function descendantsOf(store: SceneStore, id: string): string[] {
  const node = store.get(id);
  if (!isNode(node)) return [];
  const byParent = new Map<string, string[]>();
  for (const n of nodesOf(store, node.mindmap.rootId)) {
    const parent = n.mindmap.parentId;
    if (parent) byParent.set(parent, [...(byParent.get(parent) ?? []), n.id]);
  }
  const out: string[] = [];
  const walk = (parent: string) => {
    for (const child of byParent.get(parent) ?? []) {
      out.push(child);
      walk(child);
    }
  };
  walk(id);
  return out;
}
/** Nodes hidden because a node above them is collapsed. */
export function hiddenByCollapse(elements: Map<string, Element>): Set<string> {
  const hidden = new Set<string>();
  let anyCollapsed = false;
  for (const el of elements.values())
    if (isNode(el) && el.mindmap.collapsed) {
      anyCollapsed = true;
      break;
    }
  if (!anyCollapsed) return hidden;
  const known = new Map<string, boolean>();
  const check = (el: MindmapNode, depth: number): boolean => {
    const cached = known.get(el.id);
    if (cached !== undefined) return cached;
    const parent = el.mindmap.parentId ? elements.get(el.mindmap.parentId) : undefined;
    const result =
      depth < 1000 && isNode(parent) ? parent.mindmap.collapsed || check(parent, depth + 1) : false;
    known.set(el.id, result);
    return result;
  };
  for (const el of elements.values()) if (isNode(el) && check(el, 0)) hidden.add(el.id);
  return hidden;
}
/** Size that fits a node's text. */
export function nodeSize(text: string, fontSize: number, family: FontFamily, root: boolean) {
  const measured = measureText(text || ' ', fontSize, family);
  const padX = root ? 28 : LABEL_PADDING + 8;
  const padY = root ? 18 : LABEL_PADDING;
  return {
    width: Math.max(root ? 160 : 72, Math.ceil(measured.width + padX * 2)),
    height: Math.max(fontSize * LINE_HEIGHT, measured.height) + padY * 2,
  };
}
export interface NodeStyle {
  strokeColor: string;
  backgroundColor: string;
  roughness: number;
  fontFamily: FontFamily;
}
export function createNode(
  link: MindmapLink,
  at: Point,
  text: string,
  style: NodeStyle,
  id = createId(),
): MindmapNode {
  const root = link.parentId === null;
  const fontSize = root ? 24 : 18;
  const size = nodeSize(text, fontSize, style.fontFamily, root);
  return {
    id,
    type: 'rectangle',
    x: at.x - (root ? size.width / 2 : 0),
    y: at.y - size.height / 2,
    width: size.width,
    height: size.height,
    angle: 0,
    strokeColor: root ? style.strokeColor : link.color,
    backgroundColor: style.backgroundColor,
    fillStyle: 'solid',
    strokeWidth: root ? 3 : 2,
    strokeStyle: 'solid',
    roughness: style.roughness,
    opacity: 100,
    roundness: 'round',
    seed: createNonce(),
    version: 1,
    versionNonce: createNonce(),
    isDeleted: false,
    groupIds: [],
    locked: false,
    label: { text, fontSize, fontFamily: style.fontFamily },
    mindmap: link,
  };
}
/** Positions every visible node of a mind map around its root. */
export function computeLayout(store: SceneStore, rootId: string): Map<string, Point> {
  const root = store.get(rootId);
  const out = new Map<string, Point>();
  if (!isRoot(root)) return out;
  const byParent = new Map<string, MindmapNode[]>();
  for (const n of nodesOf(store, rootId)) {
    const parent = n.mindmap.parentId;
    if (parent) byParent.set(parent, [...(byParent.get(parent) ?? []), n]);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.mindmap.order - b.mindmap.order);
  const kids = (n: MindmapNode) => (n.mindmap.collapsed ? [] : (byParent.get(n.id) ?? []));
  const heights = new Map<string, number>();
  const stackHeight = (list: MindmapNode[]) =>
    list.reduce((sum, n) => sum + subtreeHeight(n), 0) + SIBLING_GAP * Math.max(0, list.length - 1);
  const subtreeHeight = (n: MindmapNode): number => {
    let h = heights.get(n.id);
    if (h === undefined) {
      h = Math.max(Math.abs(n.height), stackHeight(kids(n)));
      heights.set(n.id, h);
    }
    return h;
  };
  const placeStack = (
    list: MindmapNode[],
    side: 'left' | 'right',
    edge: number,
    centerY: number,
  ) => {
    let y = centerY - stackHeight(list) / 2;
    for (const n of list) {
      const h = subtreeHeight(n);
      place(n, side, edge, y + h / 2);
      y += h + SIBLING_GAP;
    }
  };
  const place = (n: MindmapNode, side: 'left' | 'right', edge: number, centerY: number) => {
    const w = Math.abs(n.width);
    const x = side === 'right' ? edge : edge - w;
    out.set(n.id, { x, y: centerY - Math.abs(n.height) / 2 });
    placeStack(kids(n), side, side === 'right' ? x + w + BRANCH_GAP : x - BRANCH_GAP, centerY);
  };
  const rx = Math.min(root.x, root.x + root.width);
  const ry = Math.min(root.y, root.y + root.height);
  const cy = ry + Math.abs(root.height) / 2;
  const top = kids(root);
  placeStack(
    top.filter((n) => n.mindmap.side === 'right'),
    'right',
    rx + Math.abs(root.width) + ROOT_GAP,
    cy,
  );
  placeStack(
    top.filter((n) => n.mindmap.side === 'left'),
    'left',
    rx - ROOT_GAP,
    cy,
  );
  return out;
}
/** Moves the nodes of a mind map to their laid-out positions. */
export function applyLayout(store: SceneStore, rootId: string): void {
  const layout = computeLayout(store, rootId);
  const moved = [...layout].filter(([id, p]) => {
    const el = store.get(id)!;
    return (
      Math.abs(Math.min(el.x, el.x + el.width) - p.x) > 0.01 ||
      Math.abs(Math.min(el.y, el.y + el.height) - p.y) > 0.01
    );
  });
  if (!moved.length) return;
  store.update(
    moved.map(([id]) => id),
    (el) => {
      const p = layout.get(el.id)!;
      el.x = p.x + (el.width < 0 ? -el.width : 0);
      el.y = p.y + (el.height < 0 ? -el.height : 0);
    },
  );
}
/** Side for a new main branch: whichever side has fewer branches, right first. */
function freeSide(store: SceneStore, rootId: string): 'left' | 'right' {
  const top = childrenOf(store, rootId);
  const right = top.filter((n) => n.mindmap.side === 'right').length;
  return right <= top.length - right ? 'right' : 'left';
}
function nextColor(store: SceneStore, rootId: string): string {
  const used = childrenOf(store, rootId).length;
  return BRANCH_COLORS[used % BRANCH_COLORS.length]!;
}
/** Adds a child under `parentId` (placed after `after` if given) and lays the map out again. */
export function addChild(
  store: SceneStore,
  parentId: string,
  style: NodeStyle,
  text = '',
  after?: string,
): MindmapNode | null {
  const parent = store.get(parentId);
  if (!isNode(parent)) return null;
  const rootId = parent.mindmap.rootId;
  const atRoot = parent.mindmap.parentId === null;
  const siblings = childrenOf(store, parentId);
  const index = after ? siblings.findIndex((n) => n.id === after) : -1;
  const previous = siblings[index];
  const nextSibling = siblings[index + 1];
  const order =
    index < 0
      ? (siblings.at(-1)?.mindmap.order ?? 0) + 1
      : nextSibling
        ? (previous!.mindmap.order + nextSibling.mindmap.order) / 2
        : previous!.mindmap.order + 1;
  const side = atRoot ? (previous?.mindmap.side ?? freeSide(store, rootId)) : parent.mindmap.side;
  const link: MindmapLink = {
    rootId,
    parentId,
    side,
    order,
    collapsed: false,
    color: atRoot ? nextColor(store, rootId) : parent.mindmap.color,
  };
  const node = createNode(link, { x: parent.x, y: parent.y }, text, style);
  store.beginHistoryGroup();
  if (parent.mindmap.collapsed)
    store.update([parentId], (el) => {
      if (isNode(el)) el.mindmap.collapsed = false;
    });
  store.add(node);
  applyLayout(store, rootId);
  store.endHistoryGroup();
  return store.get(node.id) as MindmapNode;
}
/** Adds a node next to `id`, or a child if `id` is the root. */
export function addSibling(
  store: SceneStore,
  id: string,
  style: NodeStyle,
  text = '',
): MindmapNode | null {
  const node = store.get(id);
  if (!isNode(node)) return null;
  if (!node.mindmap.parentId) return addChild(store, id, style, text);
  return addChild(store, node.mindmap.parentId, style, text, id);
}
/** Deletes nodes with everything below them; returns a node to select afterwards. */
export function removeBranches(store: SceneStore, ids: Iterable<string>): string | null {
  const doomed = new Set<string>();
  const roots = new Set<string>();
  let next: string | null = null;
  for (const id of ids) {
    const node = store.get(id);
    if (!isNode(node)) continue;
    doomed.add(id);
    for (const d of descendantsOf(store, id)) doomed.add(d);
    roots.add(node.mindmap.rootId);
    next ??= node.mindmap.parentId;
  }
  if (!doomed.size) return null;
  store.beginHistoryGroup();
  store.remove(doomed);
  for (const root of roots) if (!doomed.has(root)) applyLayout(store, root);
  store.endHistoryGroup();
  return next && !doomed.has(next) ? next : null;
}
export function toggleCollapsed(store: SceneStore, id: string, collapsed?: boolean): void {
  const node = store.get(id);
  if (!isNode(node) || !childrenOf(store, id).length) return;
  const value = collapsed ?? !node.mindmap.collapsed;
  if (value === node.mindmap.collapsed) return;
  store.beginHistoryGroup();
  store.update([id], (el) => {
    if (isNode(el)) el.mindmap.collapsed = value;
  });
  applyLayout(store, node.mindmap.rootId);
  store.endHistoryGroup();
}
/** Moves `id` and its branch under `parentId`. Refuses to move a node into its own branch. */
export function reparent(
  store: SceneStore,
  id: string,
  parentId: string,
  side?: 'left' | 'right',
): boolean {
  const node = store.get(id);
  const parent = store.get(parentId);
  if (!isNode(node) || !isNode(parent) || node.mindmap.parentId === null) return false;
  if (id === parentId || descendantsOf(store, id).includes(parentId)) return false;
  const rootId = parent.mindmap.rootId;
  const atRoot = parent.mindmap.parentId === null;
  const newSide = atRoot ? (side ?? node.mindmap.side) : parent.mindmap.side;
  const color = atRoot
    ? node.mindmap.parentId === parentId
      ? node.mindmap.color
      : nextColor(store, rootId)
    : parent.mindmap.color;
  const order =
    (childrenOf(store, parentId)
      .filter((n) => n.id !== id)
      .at(-1)?.mindmap.order ?? 0) + 1;
  const branch = [id, ...descendantsOf(store, id)];
  const oldRoot = node.mindmap.rootId;
  store.beginHistoryGroup();
  store.update(branch, (el) => {
    if (!isNode(el)) return;
    el.mindmap.rootId = rootId;
    el.mindmap.side = newSide;
    el.mindmap.color = color;
    if (el.strokeColor === node.mindmap.color || el.id === id) el.strokeColor = color;
    if (el.id === id) {
      el.mindmap.parentId = parentId;
      el.mindmap.order = order;
    }
  });
  if (parent.mindmap.collapsed)
    store.update([parentId], (el) => {
      if (isNode(el)) el.mindmap.collapsed = false;
    });
  applyLayout(store, rootId);
  if (oldRoot !== rootId) applyLayout(store, oldRoot);
  store.endHistoryGroup();
  return true;
}
/** Re-sizes a node to fit its text, then lays out its map again. */
export function fitNode(store: SceneStore, id: string): void {
  const node = store.get(id);
  if (!isNode(node) || !node.label) return;
  const size = nodeSize(
    node.label.text,
    node.label.fontSize,
    node.label.fontFamily,
    node.mindmap.parentId === null,
  );
  store.beginHistoryGroup();
  if (size.width !== Math.abs(node.width) || size.height !== Math.abs(node.height))
    store.update([id], (el) => {
      // Keep the root centred where it was; other nodes are positioned by the layout.
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      el.width = size.width;
      el.height = size.height;
      el.x = cx - size.width / 2;
      el.y = cy - size.height / 2;
    });
  applyLayout(store, node.mindmap.rootId);
  store.endHistoryGroup();
}
/** Finds the node to move to with the arrow keys, following the map's layout. */
export function neighbour(
  store: SceneStore,
  id: string,
  direction: 'left' | 'right' | 'up' | 'down',
): string | null {
  const node = store.get(id);
  if (!isNode(node)) return null;
  const { parentId, side } = node.mindmap;
  if (direction === 'up' || direction === 'down') {
    if (!parentId) return null;
    const siblings = childrenOf(store, parentId).filter((n) => n.mindmap.side === side);
    const i = siblings.findIndex((n) => n.id === id);
    return siblings[i + (direction === 'up' ? -1 : 1)]?.id ?? null;
  }
  const outward = parentId === null || direction === side;
  if (outward) {
    if (node.mindmap.collapsed) return null;
    const kids = childrenOf(store, id).filter(
      (n) => parentId !== null || n.mindmap.side === direction,
    );
    return kids[Math.floor((kids.length - 1) / 2)]?.id ?? null;
  }
  return parentId;
}
/** The branch line from a node's parent to the node, as a cubic curve. */
export function branchCurve(parent: Element, child: MindmapNode): [Point, Point, Point, Point] {
  const right = child.mindmap.side === 'right';
  const px = Math.min(parent.x, parent.x + parent.width);
  const cx = Math.min(child.x, child.x + child.width);
  const start = {
    x: right ? px + Math.abs(parent.width) : px,
    y: parent.y + parent.height / 2,
  };
  const end = { x: right ? cx : cx + Math.abs(child.width), y: child.y + child.height / 2 };
  const bend = (end.x - start.x) / 2;
  return [start, { x: start.x + bend, y: start.y }, { x: end.x - bend, y: end.y }, end];
}
/** Where a node's collapse button sits: just past its outer edge. */
export function collapseButton(node: MindmapNode): Point {
  const x = Math.min(node.x, node.x + node.width);
  const outerRight = node.mindmap.side === 'right' || node.mindmap.parentId === null;
  return { x: outerRight ? x + Math.abs(node.width) + 10 : x - 10, y: node.y + node.height / 2 };
}
