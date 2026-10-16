import type { Point } from '../core/types';
import type { Tool, ToolContext } from './types';
import { world } from './helpers';
import { addChild, addSibling, createNode, isNode, type NodeStyle } from '../core/mindmap';
import { createId } from '../core/ids';
import { editLabel, type LabelExit } from './labelEditor';
export function nodeStyle(ctx: ToolContext): NodeStyle {
  const s = ctx.appState.value.style;
  return {
    strokeColor: s.strokeColor,
    backgroundColor: ctx.appState.value.viewBackgroundColor,
    roughness: s.roughness,
    fontFamily: s.fontFamily,
  };
}
function editNode(ctx: ToolContext, id: string): void {
  const node = ctx.store.get(id);
  if (!isNode(node)) return;
  ctx.appState.update({ selectedIds: new Set([id]) });
  editLabel(node, ctx, {
    selectAll: true,
    onDone: (exit: LabelExit) => {
      if (exit === 'child') addChildNode(ctx, id);
    },
  });
}
/** Starts a new mind map at `at` and lets the user name it. */
export function startMindmap(ctx: ToolContext, at: Point): void {
  const id = createId();
  const root = createNode(
    { rootId: id, parentId: null, side: 'right', order: 0, collapsed: false, color: '' },
    at,
    'Main topic',
    nodeStyle(ctx),
    id,
  );
  ctx.store.add(root);
  editNode(ctx, id);
}
export function addChildNode(ctx: ToolContext, parentId: string): void {
  const node = addChild(ctx.store, parentId, nodeStyle(ctx), 'Topic');
  if (node) editNode(ctx, node.id);
}
export function addSiblingNode(ctx: ToolContext, id: string): void {
  const node = addSibling(ctx.store, id, nodeStyle(ctx), 'Topic');
  if (node) editNode(ctx, node.id);
}
export function renameNode(ctx: ToolContext, id: string): void {
  editNode(ctx, id);
}
export const mindmapTool = (): Tool => ({
  id: 'mindmap',
  cursor: 'crosshair',
  onPointerDown(e, ctx) {
    const p = world(e, ctx);
    const list = ctx.store.getElements();
    const found = [...list]
      .reverse()
      .find(
        (el) =>
          isNode(el) &&
          p.x >= Math.min(el.x, el.x + el.width) &&
          p.x <= Math.max(el.x, el.x + el.width) &&
          p.y >= Math.min(el.y, el.y + el.height) &&
          p.y <= Math.max(el.y, el.y + el.height),
      );
    ctx.finishTool();
    if (found) ctx.appState.update({ selectedIds: new Set([found.id]) });
    else startMindmap(ctx, p);
  },
});
