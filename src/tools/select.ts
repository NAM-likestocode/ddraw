import type { Element } from '../core/types';
import type { Tool, ToolContext } from './types';
import { world } from './helpers';
import { boundsIntersect, elementBounds, hitTest, selectionBounds } from '../core/geometry';
import { createId, createNonce } from '../core/ids';
import { editTextAt } from './text';
const CLIP = 'ddraw-elements:';
type Mode = 'none' | 'drag' | 'marquee' | 'resize' | 'rotate';
export const selectTool = (): Tool => {
  let mode: Mode = 'none';
  let last = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let current = { x: 0, y: 0 };
  let handle = -1;
  let originals = new Map<string, Element>();
  let originalBounds: ReturnType<typeof selectionBounds> = null;
  const selected = (ctx: ToolContext) =>
    [...ctx.appState.value.selectedIds]
      .map((id) => ctx.store.get(id))
      .filter((e): e is Element => Boolean(e));
  const hit = (x: number, y: number, ctx: ToolContext) => {
    const list = ctx.store.getElements();
    const tolerance = 6 / ctx.camera.state.zoom;
    const pointBounds = {
      minX: x - tolerance,
      minY: y - tolerance,
      maxX: x + tolerance,
      maxY: y + tolerance,
    };
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]!;
      if (
        !e.locked &&
        boundsIntersect(elementBounds(e), pointBounds) &&
        hitTest(e, { x, y }, tolerance)
      )
        return e;
    }
    return null;
  };
  const handleAt = (x: number, y: number, ctx: ToolContext): number => {
    const b = selectionBounds(selected(ctx));
    if (!b) return -1;
    const mx = (b.minX + b.maxX) / 2;
    const my = (b.minY + b.maxY) / 2;
    const z = ctx.camera.state.zoom;
    const points: [number, number][] = [
      [b.minX, b.minY],
      [mx, b.minY],
      [b.maxX, b.minY],
      [b.maxX, my],
      [b.maxX, b.maxY],
      [mx, b.maxY],
      [b.minX, b.maxY],
      [b.minX, my],
    ];
    if (Math.hypot(x - mx, y - (b.minY - 24 / z)) < 9 / z) return 8;
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (Math.hypot(x - p[0], y - p[1]) < 9 / z) return i;
    }
    return -1;
  };
  const duplicate = (ctx: ToolContext) => {
    const made: Element[] = [];
    for (const e of selected(ctx)) {
      const copy = structuredClone(e);
      copy.id = createId();
      copy.x += 20;
      copy.y += 20;
      copy.version = 1;
      copy.versionNonce = createNonce();
      copy.groupIds = [];
      ctx.store.add(copy);
      made.push(copy);
    }
    ctx.appState.update({ selectedIds: new Set(made.map((e) => e.id)) });
  };
  const resize = (p: { x: number; y: number }, shift: boolean, ctx: ToolContext) => {
    const b = originalBounds;
    if (!b) return;
    const left = handle === 0 || handle === 6 || handle === 7;
    const right = handle === 2 || handle === 3 || handle === 4;
    const top = handle === 0 || handle === 1 || handle === 2;
    const bottom = handle === 4 || handle === 5 || handle === 6;
    const ax = left ? b.maxX : b.minX;
    const ay = top ? b.maxY : b.minY;
    let sx = left ? (p.x - ax) / (b.minX - ax || 1) : right ? (p.x - ax) / (b.maxX - ax || 1) : 1;
    let sy = top ? (p.y - ay) / (b.minY - ay || 1) : bottom ? (p.y - ay) / (b.maxY - ay || 1) : 1;
    if (shift && sx !== 1 && sy !== 1) {
      const scale = Math.max(Math.abs(sx), Math.abs(sy));
      sx = Math.sign(sx) * scale;
      sy = Math.sign(sy) * scale;
    }
    ctx.store.update(originals.keys(), (el) => {
      const old = originals.get(el.id)!;
      el.x = ax + (old.x - ax) * sx;
      el.y = ay + (old.y - ay) * sy;
      el.width = old.width * sx;
      el.height = old.height * sy;
      if (
        (el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw') &&
        (old.type === 'line' || old.type === 'arrow' || old.type === 'freedraw')
      )
        el.points = old.points.map(
          (point) =>
            [point[0] * sx, point[1] * sy, ...(point.length > 2 ? [point[2]] : [])] as [
              number,
              number,
              number?,
            ],
        );
    });
  };
  const rotate = (p: { x: number; y: number }, shift: boolean, ctx: ToolContext) => {
    const b = originalBounds;
    if (!b) return;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const initial = Math.atan2(start.y - cy, start.x - cx);
    let delta = Math.atan2(p.y - cy, p.x - cx) - initial;
    if (shift) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12);
    const cs = Math.cos(delta);
    const sn = Math.sin(delta);
    ctx.store.update(originals.keys(), (el) => {
      const old = originals.get(el.id)!;
      const ox = old.x + old.width / 2 - cx;
      const oy = old.y + old.height / 2 - cy;
      const nx = cx + ox * cs - oy * sn;
      const ny = cy + ox * sn + oy * cs;
      el.x = nx - old.width / 2;
      el.y = ny - old.height / 2;
      el.angle = old.angle + delta;
    });
  };
  return {
    id: 'select',
    cursor: 'default',
    onPointerDown(e, ctx) {
      const p = world(e, ctx);
      last = start = current = p;
      handle = handleAt(p.x, p.y, ctx);
      if (handle >= 0) {
        mode = handle === 8 ? 'rotate' : 'resize';
        originalBounds = selectionBounds(selected(ctx));
        originals = new Map(selected(ctx).map((el) => [el.id, structuredClone(el)]));
        ctx.store.beginHistoryGroup();
        return;
      }
      const found = hit(p.x, p.y, ctx);
      if (found) {
        const ids = new Set(ctx.appState.value.selectedIds);
        if (e.shiftKey) {
          if (ids.has(found.id)) ids.delete(found.id);
          else ids.add(found.id);
        } else if (!ids.has(found.id)) {
          ids.clear();
          ids.add(found.id);
        }
        ctx.appState.update({ selectedIds: ids });
        mode = 'drag';
        ctx.store.beginHistoryGroup();
      } else {
        if (!e.shiftKey) ctx.appState.update({ selectedIds: new Set() });
        mode = 'marquee';
      }
    },
    onPointerMove(e, ctx) {
      if (mode === 'none') return;
      const p = world(e, ctx);
      current = p;
      if (mode === 'drag') {
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        if (dx || dy)
          ctx.store.update(ctx.appState.value.selectedIds, (el) => {
            el.x += dx;
            el.y += dy;
          });
        last = p;
      } else if (mode === 'resize') resize(p, e.shiftKey, ctx);
      else if (mode === 'rotate') rotate(p, e.shiftKey, ctx);
      else ctx.renderer.markDirty('interactive');
    },
    onPointerUp(_e, ctx) {
      if (mode === 'drag' || mode === 'resize' || mode === 'rotate') ctx.store.endHistoryGroup();
      else if (mode === 'marquee') {
        const box = {
          minX: Math.min(start.x, current.x),
          minY: Math.min(start.y, current.y),
          maxX: Math.max(start.x, current.x),
          maxY: Math.max(start.y, current.y),
        };
        const ids = new Set(ctx.appState.value.selectedIds);
        for (const el of ctx.store.getElements())
          if (boundsIntersect(box, elementBounds(el))) ids.add(el.id);
        ctx.appState.update({ selectedIds: ids });
      }
      mode = 'none';
      ctx.renderer.markDirty('interactive');
    },
    onDoubleClick(e, ctx) {
      const p = world(e, ctx);
      const el = hit(p.x, p.y, ctx);
      if (el?.type === 'text') editTextAt(el.x, el.y, ctx, el);
    },
    onKeyDown(e, ctx) {
      const mod = e.ctrlKey || e.metaKey;
      const ids = ctx.appState.value.selectedIds;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        ctx.store.remove(ids);
        ctx.appState.update({ selectedIds: new Set() });
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        ctx.store.update(ids, (el) => {
          if (e.key === 'ArrowLeft') el.x -= n;
          if (e.key === 'ArrowRight') el.x += n;
          if (e.key === 'ArrowUp') el.y -= n;
          if (e.key === 'ArrowDown') el.y += n;
        });
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        ctx.appState.update({ selectedIds: new Set(ctx.store.getElements().map((x) => x.id)) });
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate(ctx);
      } else if (mod && e.key.toLowerCase() === 'c') {
        const elements = selected(ctx);
        void navigator.clipboard?.writeText(CLIP + JSON.stringify(elements));
      } else if (mod && e.key.toLowerCase() === 'x') {
        const elements = selected(ctx);
        void navigator.clipboard?.writeText(CLIP + JSON.stringify(elements));
        ctx.store.remove(ids);
      } else if (mod && e.key.toLowerCase() === 'g') {
        if (e.shiftKey)
          ctx.store.update(ids, (el) => {
            el.groupIds = [];
          });
        else {
          const group = createId();
          ctx.store.update(ids, (el) => {
            el.groupIds = [...el.groupIds, group];
          });
        }
      }
    },
    render(ctx2d, ctx) {
      if (mode !== 'marquee') return;
      const a = ctx.camera.worldToScreen(start);
      const b = ctx.camera.worldToScreen(current);
      const d = devicePixelRatio;
      ctx2d.setTransform(d, 0, 0, d, 0, 0);
      ctx2d.fillStyle = '#CD7EBF22';
      ctx2d.strokeStyle = '#CD7EBF';
      ctx2d.lineWidth = 1;
      ctx2d.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx2d.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    },
    cancel(ctx) {
      if (mode === 'drag' || mode === 'resize' || mode === 'rotate') ctx.store.endHistoryGroup();
      mode = 'none';
    },
  };
};
