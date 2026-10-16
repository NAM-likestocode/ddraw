import type { Element } from '../core/types';
import { branchCurve, collapseButton, isNode, type MindmapNode } from '../core/mindmap';

/**
 * Draws the curved branch lines of every mind map in `visible`, under the
 * nodes, plus a badge with the number of hidden topics on collapsed nodes.
 */
export function drawMindmaps(
  ctx: CanvasRenderingContext2D,
  visible: readonly Element[],
  all: ReadonlyMap<string, Element>,
): void {
  const nodes = visible.filter(isNode);
  if (!nodes.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const node of nodes) {
    const parentId = node.mindmap.parentId;
    if (!parentId) continue;
    const parent = all.get(parentId);
    if (!isNode(parent) || parent.isDeleted) continue;
    const [a, b, c, d] = branchCurve(parent, node);
    ctx.strokeStyle = node.mindmap.color || node.strokeColor;
    ctx.globalAlpha = node.opacity / 100;
    ctx.lineWidth = parent.mindmap.parentId === null ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.bezierCurveTo(b.x, b.y, c.x, c.y, d.x, d.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const node of nodes) {
    if (!node.mindmap.collapsed) continue;
    const count = hiddenCount(node, all);
    if (count) drawBadge(ctx, node, count);
  }
  ctx.restore();
}

function hiddenCount(node: MindmapNode, all: ReadonlyMap<string, Element>): number {
  const children = new Map<string, string[]>();
  for (const el of all.values())
    if (isNode(el) && el.mindmap.rootId === node.mindmap.rootId && el.mindmap.parentId) {
      const list = children.get(el.mindmap.parentId) ?? [];
      list.push(el.id);
      children.set(el.mindmap.parentId, list);
    }
  let count = 0;
  const stack = [...(children.get(node.id) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    count++;
    stack.push(...(children.get(id) ?? []));
  }
  return count;
}

function drawBadge(ctx: CanvasRenderingContext2D, node: MindmapNode, count: number): void {
  const p = collapseButton(node);
  const r = 9;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = node.mindmap.color || node.strokeColor;
  ctx.fill();
  ctx.fillStyle = '#171B24';
  ctx.font = '600 11px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(count > 99 ? '99+' : String(count), p.x, p.y + 0.5);
}
