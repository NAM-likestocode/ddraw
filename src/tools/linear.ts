import type { Element, LinearElement, Point } from '../core/types';
import type { Tool, ToolContext } from './types';
import { base, world } from './helpers';
import { bindTargetAt } from '../core/bindings';
import { highlight, worldTransform } from './overlay';
export function linearTool(type: 'line' | 'arrow'): Tool {
  let id: string | null = null;
  let down = false;
  let moved = false;
  let downAt = { x: 0, y: 0 };
  let preview = { x: 0, y: 0 };
  const vertices: { x: number; y: number }[] = [];
  /** Shapes the arrow's first point and current point would attach to. */
  let startTarget: Element | null = null;
  let hover: Element | null = null;
  const targetAt = (p: Point, e: PointerEvent, ctx: ToolContext) =>
    type === 'arrow' && !e.ctrlKey && !e.metaKey
      ? bindTargetAt(ctx.store, p, 4 / ctx.camera.state.zoom, new Set(id ? [id] : []))
      : null;
  const sync = (ctx: ToolContext, includePreview = true) => {
    if (!id || !vertices.length) return;
    const all = includePreview ? [...vertices, preview] : vertices;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of all) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    ctx.store.update([id], (el) => {
      if (el.type !== 'line' && el.type !== 'arrow') return;
      el.x = minX;
      el.y = minY;
      el.width = maxX - minX;
      el.height = maxY - minY;
      el.points = all.map((p) => [p.x - minX, p.y - minY]);
    });
  };
  const finish = (ctx: ToolContext) => {
    if (!id) return;
    if (vertices.length < 2 && preview) vertices.push(preview);
    sync(ctx, false);
    const startId = startTarget?.id;
    const endId = hover && hover.id !== startId ? hover.id : null;
    if (startId || endId)
      ctx.store.update([id], (el) => {
        if (el.type !== 'arrow') return;
        el.startBinding = startId ? { elementId: startId } : null;
        el.endBinding = endId ? { elementId: endId } : null;
      });
    ctx.store.endHistoryGroup();
    startTarget = hover = null;
    const finishedId = id;
    id = null;
    down = false;
    vertices.length = 0;
    ctx.appState.update({ selectedIds: new Set([finishedId]), drawingId: null });
    ctx.finishTool();
  };
  const cancel = (ctx: ToolContext) => {
    if (id) {
      ctx.store.remove([id]);
      ctx.store.endHistoryGroup();
      id = null;
      down = false;
      vertices.length = 0;
    }
    startTarget = hover = null;
    if (ctx.appState.value.drawingId !== null) ctx.appState.update({ drawingId: null });
  };
  return {
    id: type,
    cursor: 'crosshair',
    onPointerDown(e, ctx) {
      const p = world(e, ctx);
      down = true;
      moved = false;
      downAt = p;
      preview = p;
      if (!id) {
        vertices.length = 0;
        vertices.push(p);
        startTarget = targetAt(p, e, ctx);
        const s = ctx.appState.value.style;
        const el = {
          ...base(type, p.x, p.y, ctx),
          type,
          points: [
            [0, 0],
            [0, 0],
          ],
          startArrowhead: s.startArrowhead,
          endArrowhead: type === 'arrow' ? s.endArrowhead : null,
        } as LinearElement;
        id = el.id;
        ctx.store.beginHistoryGroup();
        ctx.appState.update({ selectedIds: new Set(), drawingId: id });
        ctx.store.add(el);
      }
      sync(ctx);
    },
    onPointerMove(e, ctx) {
      const p = world(e, ctx);
      hover = targetAt(p, e, ctx);
      ctx.renderer.markDirty('interactive');
      if (!id) return;
      preview = p;
      if (down && Math.hypot(preview.x - downAt.x, preview.y - downAt.y) > 3) moved = true;
      sync(ctx);
    },
    onPointerUp(e, ctx) {
      if (!id || !down) return;
      preview = world(e, ctx);
      hover = targetAt(preview, e, ctx);
      down = false;
      if (moved) {
        vertices.push(preview);
        finish(ctx);
      } else if (
        vertices.length > 1 ||
        Math.hypot(preview.x - vertices[0]!.x, preview.y - vertices[0]!.y) > 1
      ) {
        vertices.push(preview);
        sync(ctx);
      }
    },
    onDoubleClick(_e, ctx) {
      finish(ctx);
    },
    onKeyDown(e, ctx) {
      if (e.key === 'Enter') finish(ctx);
      else if (e.key === 'Escape') cancel(ctx);
    },
    render(c2d, ctx) {
      const z = worldTransform(c2d, ctx);
      if (startTarget && id) highlight(c2d, startTarget, z);
      if (hover && hover.id !== startTarget?.id) highlight(c2d, hover, z);
    },
    cancel,
  };
}
