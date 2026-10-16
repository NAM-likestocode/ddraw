import type { Element } from '../core/types';
import { sketchBranch } from './sketch';
import { branchCurve, collapseButton, isNode, type MindmapNode } from '../core/mindmap';

export interface Branch {
  /** SVG path data in scene coordinates. */
  d: string;
  color: string;
  width: number;
  opacity: number;
}

/** The branch lines joining each node in `nodes` to its parent. */
export function branchesOf(
  nodes: readonly Element[],
  get: (id: string) => Element | undefined,
): Branch[] {
  const out: Branch[] = [];
  for (const node of nodes) {
    if (!isNode(node) || !node.mindmap.parentId) continue;
    const parent = get(node.mindmap.parentId);
    if (!isNode(parent)) continue;
    const curve = branchCurve(parent, node);
    const width = parent.mindmap.parentId === null ? 3 : 2;
    const [a, b, c, d] = curve.map((p) => `${p.x} ${p.y}`);
    out.push({
      d:
        node.roughness > 0
          ? sketchBranch(curve, width, node.roughness, node.seed)
          : `M ${a} C ${b} ${c} ${d}`,
      color: node.mindmap.color || node.strokeColor,
      width,
      opacity: node.opacity / 100,
    });
  }
  return out;
}

/**
 * Draws the curved branch lines of every mind map in `visible`, under the
 * nodes, plus a badge with the number of hidden topics on collapsed nodes.
 */
export function drawMindmaps(
  ctx: CanvasRenderingContext2D,
  visible: readonly Element[],
  get: (id: string) => Element | undefined,
  all: () => readonly Element[] = () => visible,
): void {
  const nodes = visible.filter(isNode);
  if (!nodes.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const branch of branchesOf(nodes, get)) {
    ctx.strokeStyle = branch.color;
    ctx.globalAlpha = branch.opacity;
    ctx.lineWidth = branch.width;
    ctx.stroke(new Path2D(branch.d));
  }
  ctx.globalAlpha = 1;
  for (const node of nodes) {
    if (!node.mindmap.collapsed) continue;
    const count = hiddenCount(node, all());
    if (count) drawBadge(ctx, node, count);
  }
  ctx.restore();
}

function hiddenCount(node: MindmapNode, all: readonly Element[]): number {
  const children = new Map<string, string[]>();
  for (const el of all)
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
