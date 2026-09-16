import type { Element, Point } from '../core/types';
import { boundsIntersect, elementBounds, hitTest } from '../core/geometry';
import type { Tool, ToolContext } from './types';
import { world } from './helpers';

export const ERASER_RADIUS = 8;

/** Return whether an eraser segment comes within tolerance of an element's hit area. */
export function eraserPathIntersects(
  element: Element,
  from: Point,
  to: Point,
  tolerance = ERASER_RADIUS,
): boolean {
  if (element.isDeleted || tolerance < 0) return false;
  const margin = tolerance + element.strokeWidth / 2;
  const pathBounds = {
    minX: Math.min(from.x, to.x) - margin,
    minY: Math.min(from.y, to.y) - margin,
    maxX: Math.max(from.x, to.x) + margin,
    maxY: Math.max(from.y, to.y) + margin,
  };
  if (!boundsIntersect(elementBounds(element), pathBounds)) return false;

  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(tolerance / 2, 0.5);
  const samples = Math.max(1, Math.ceil(distance / step));
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    if (
      hitTest(
        element,
        { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
        tolerance,
      )
    )
      return true;
  }
  return false;
}

export const eraserTool = (): Tool => {
  let active = false;
  let last: Point | null = null;
  let cursor: Point | null = null;
  let historyStarted = false;
  const erasedIds = new Set<string>();

  const eraseBetween = (from: Point, to: Point, ctx: ToolContext) => {
    const ids: string[] = [];
    for (const element of ctx.store.getElements()) {
      if (element.locked || erasedIds.has(element.id)) continue;
      if (eraserPathIntersects(element, from, to, ERASER_RADIUS / ctx.camera.state.zoom)) {
        erasedIds.add(element.id);
        ids.push(element.id);
      }
    }
    if (!ids.length) return;
    if (!historyStarted) {
      ctx.store.beginHistoryGroup();
      historyStarted = true;
    }
    // Soft-delete as the pointer moves so erased elements disappear immediately. The group
    // keeps the whole stroke as one undoable action.
    ctx.store.remove(ids);
  };

  const updateCursor = (point: Point, ctx: ToolContext) => {
    cursor = point;
    ctx.renderer.markDirty('interactive');
  };

  return {
    id: 'eraser',
    cursor: 'none',
    onPointerDown(event, ctx) {
      const point = world(event, ctx);
      active = true;
      last = point;
      erasedIds.clear();
      ctx.appState.update({ selectedIds: new Set() });
      updateCursor(point, ctx);
      eraseBetween(point, point, ctx);
    },
    onPointerMove(event, ctx) {
      const point = world(event, ctx);
      updateCursor(point, ctx);
      if (!active) return;
      eraseBetween(last ?? point, point, ctx);
      last = point;
    },
    onPointerUp(event, ctx) {
      if (!active) return;
      const point = world(event, ctx);
      eraseBetween(last ?? point, point, ctx);
      active = false;
      last = null;
      if (historyStarted) {
        ctx.store.endHistoryGroup();
        historyStarted = false;
      }
      updateCursor(point, ctx);
      erasedIds.clear();
    },
    render(ctx2d, ctx) {
      if (!cursor) return;
      const point = ctx.camera.worldToScreen(cursor);
      const dpr = Math.max(1, devicePixelRatio || 1);
      ctx2d.save();
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.fillStyle = '#D8DEE922';
      ctx2d.strokeStyle = '#D8DEE9';
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.arc(point.x, point.y, ERASER_RADIUS, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.stroke();
      ctx2d.restore();
    },
    cancel(ctx) {
      active = false;
      last = null;
      if (historyStarted) {
        ctx.store.endHistoryGroup();
        historyStarted = false;
      }
      erasedIds.clear();
      ctx.renderer.markDirty('interactive');
    },
  };
};
