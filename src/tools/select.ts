import type { Element, LinearElement, Point, ShapeElement } from '../core/types';
import type { Tool, ToolContext } from './types';
import { base, world } from './helpers';
import {
  boundsIntersect,
  elementBounds,
  hitTest,
  selectionBounds,
  type Bounds,
} from '../core/geometry';
import { createId, createNonce } from '../core/ids';
import { editTextAt } from './text';
import { editLabel } from './labelEditor';
import { bindTargetAt, centerOf } from '../core/bindings';
import {
  applyLayout,
  childrenOf,
  collapseButton,
  descendantsOf,
  isNode,
  neighbour,
  removeBranches,
  reparent,
  toggleCollapsed,
  type MindmapNode,
} from '../core/mindmap';
import { addChildNode, addSiblingNode, renameNode } from './mindmap';
import { dot, highlight, signButton, worldTransform } from './overlay';
import { snapBounds, type Guide } from './snapping';
import { duplicateElements } from '../core/duplicate';
const CLIP = 'ddraw-elements:';
type Mode = 'none' | 'drag' | 'marquee' | 'resize' | 'rotate' | 'endpoint' | 'connect';
type Direction = 'right' | 'down' | 'left' | 'up';
const DIRECTIONS: Direction[] = ['right', 'down', 'left', 'up'];
/** Handle ids beyond the 8 resize handles and the rotation handle (8). */
const START = 100;
const END = 101;
const CONNECT = 200;
const isShape = (el: Element | undefined | null): el is ShapeElement =>
  el?.type === 'rectangle' || el?.type === 'ellipse' || el?.type === 'diamond';
const isLinear = (el: Element | undefined | null): el is LinearElement =>
  el?.type === 'line' || el?.type === 'arrow';
export const selectTool = (): Tool => {
  let mode: Mode = 'none';
  let start = { x: 0, y: 0 };
  let current = { x: 0, y: 0 };
  let handle = -1;
  let moved = false;
  let originals = new Map<string, Element>();
  let originalBounds: Bounds | null = null;
  let snapTargets: Bounds[] = [];
  let guides: Guide[] = [];
  /** Shape that an arrow end or a dragged branch would attach to on release. */
  let target: Element | null = null;
  let connectArrow: string | null = null;
  const selected = (ctx: ToolContext) =>
    [...ctx.appState.value.selectedIds]
      .map((id) => ctx.store.get(id))
      .filter((e): e is Element => Boolean(e && !e.isDeleted));
  const single = (ctx: ToolContext) => {
    const list = selected(ctx);
    return list.length === 1 ? list[0]! : null;
  };
  const zoom = (ctx: ToolContext) => ctx.camera.state.zoom;
  const hit = (x: number, y: number, ctx: ToolContext) => {
    const list = ctx.store.getElements();
    const tolerance = 6 / zoom(ctx);
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
  /** Points where the quick-connect buttons sit around a shape. */
  const connectPoints = (el: Element, ctx: ToolContext): Point[] => {
    const b = elementBounds(el);
    const off = 34 / zoom(ctx);
    const mx = (b.minX + b.maxX) / 2;
    const my = (b.minY + b.maxY) / 2;
    if (isNode(el)) {
      const right = el.mindmap.side === 'right' || el.mindmap.parentId === null;
      return [{ x: right ? b.maxX + off : b.minX - off, y: my }];
    }
    return [
      { x: b.maxX + off, y: my },
      { x: mx, y: b.maxY + off },
      { x: b.minX - off, y: my },
      { x: mx, y: b.minY - off - 24 / zoom(ctx) },
    ];
  };
  const showConnect = (ctx: ToolContext): Element | null => {
    const el = single(ctx);
    return el && isShape(el) && !el.locked && mode === 'none' ? el : null;
  };
  const handleAt = (x: number, y: number, ctx: ToolContext): number => {
    const z = zoom(ctx);
    const near = (p: Point, r = 9) => Math.hypot(x - p.x, y - p.y) < r / z;
    const one = single(ctx);
    if (isLinear(one) && !one.locked) {
      const first = one.points[0]!;
      const last = one.points.at(-1)!;
      if (near({ x: one.x + last[0], y: one.y + last[1] })) return END;
      if (near({ x: one.x + first[0], y: one.y + first[1] })) return START;
    }
    const connector = showConnect(ctx);
    if (connector) {
      const points = connectPoints(connector, ctx);
      for (let i = 0; i < points.length; i++) if (near(points[i]!, 11)) return CONNECT + i;
    }
    const b = selectionBounds(selected(ctx));
    if (!b) return -1;
    const mx = (b.minX + b.maxX) / 2;
    const my = (b.minY + b.maxY) / 2;
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
    if (near({ x: mx, y: b.minY - 24 / z })) return 8;
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (near({ x: p[0], y: p[1] })) return i;
    }
    return -1;
  };
  /** A mind-map node whose collapse button is at `p`. */
  const collapseAt = (p: Point, ctx: ToolContext): MindmapNode | null => {
    const z = zoom(ctx);
    const ids = ctx.appState.value.selectedIds;
    for (const el of ctx.store.getElements()) {
      if (!isNode(el) || el.mindmap.parentId === null) continue;
      if (!el.mindmap.collapsed && !ids.has(el.id)) continue;
      const b = collapseButton(el);
      if (Math.hypot(p.x - b.x, p.y - b.y) < 10 / z && childrenOf(ctx.store, el.id).length)
        return el;
    }
    return null;
  };
  const duplicate = (ctx: ToolContext) => {
    const source = [...dragSet(ctx)]
      .map((id) => ctx.store.get(id))
      .filter((e): e is Element => Boolean(e && !e.isDeleted));
    const made = duplicateElements(source);
    ctx.store.beginHistoryGroup();
    for (const copy of made) ctx.store.add(copy);
    ctx.store.endHistoryGroup();
    const picked = new Set(ctx.appState.value.selectedIds);
    ctx.appState.update({
      selectedIds: new Set(made.filter((_, i) => picked.has(source[i]!.id)).map((e) => e.id)),
    });
  };
  /** The selection plus the branches below any selected mind-map nodes. */
  const dragSet = (ctx: ToolContext): Set<string> => {
    const ids = new Set(ctx.appState.value.selectedIds);
    for (const id of [...ids])
      if (isNode(ctx.store.get(id))) for (const d of descendantsOf(ctx.store, id)) ids.add(d);
    return ids;
  };
  /** Arrows dragged on their own let go of shapes that are staying behind. */
  const releaseBindings = (ids: Set<string>, ctx: ToolContext) => {
    const loose = [...ids].filter((id) => {
      const el = ctx.store.get(id);
      return (
        isLinear(el) &&
        ((el.startBinding && !ids.has(el.startBinding.elementId)) ||
          (el.endBinding && !ids.has(el.endBinding.elementId)))
      );
    });
    if (loose.length)
      ctx.store.update(loose, (el) => {
        if (!isLinear(el)) return;
        if (el.startBinding && !ids.has(el.startBinding.elementId)) el.startBinding = null;
        if (el.endBinding && !ids.has(el.endBinding.elementId)) el.endBinding = null;
      });
  };
  /** The single mind-map branch being dragged, if that is what is happening. */
  const draggedBranch = (ctx: ToolContext): MindmapNode | null => {
    const el = single(ctx);
    return isNode(el) && el.mindmap.parentId !== null ? el : null;
  };
  const drag = (p: Point, e: PointerEvent, ctx: ToolContext) => {
    if (!moved) {
      moved = true;
      const ids = dragSet(ctx);
      releaseBindings(ids, ctx);
      originals = new Map(
        [...ids].flatMap((id) => {
          const el = ctx.store.get(id);
          return el ? [[id, structuredClone(el)] as const] : [];
        }),
      );
      originalBounds = selectionBounds([...originals.values()]);
      const viewport = ctx.camera.state;
      const view = {
        minX: -viewport.x / viewport.zoom,
        minY: -viewport.y / viewport.zoom,
        maxX: (ctx.host.clientWidth - viewport.x) / viewport.zoom,
        maxY: (ctx.host.clientHeight - viewport.y) / viewport.zoom,
      };
      snapTargets = ctx.store
        .getElements()
        .filter((el) => !ids.has(el.id) && !isLinear(el))
        .map(elementBounds)
        .filter((b) => boundsIntersect(b, view));
    }
    let dx = p.x - start.x;
    let dy = p.y - start.y;
    guides = [];
    const branch = draggedBranch(ctx);
    if (originalBounds && !e.altKey && !branch) {
      const b = originalBounds;
      const snap = snapBounds(
        { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy },
        snapTargets,
        6 / zoom(ctx),
      );
      dx += snap.dx;
      dy += snap.dy;
      guides = snap.guides;
    }
    ctx.store.update(originals.keys(), (el) => {
      const old = originals.get(el.id)!;
      el.x = old.x + dx;
      el.y = old.y + dy;
    });
    if (branch) {
      const ignore = new Set([branch.id, ...descendantsOf(ctx.store, branch.id)]);
      const over = bindTargetAt(ctx.store, p, 0, ignore);
      target = isNode(over) ? over : null;
    }
  };
  /** Drops a dragged branch onto a new parent, or back into place. */
  const dropBranch = (ctx: ToolContext) => {
    const branch = draggedBranch(ctx);
    if (!branch) return;
    if (target && isNode(target)) {
      const root = ctx.store.get(target.mindmap.rootId);
      const side =
        root && target.id === root.id
          ? current.x < centerOf(root).x
            ? 'left'
            : 'right'
          : undefined;
      if (reparent(ctx.store, branch.id, target.id, side)) return;
    }
    const root = ctx.store.get(branch.mindmap.rootId);
    if (root && branch.mindmap.parentId === root.id) {
      const side = centerOf(branch).x < centerOf(root).x ? 'left' : 'right';
      if (side !== branch.mindmap.side) {
        reparent(ctx.store, branch.id, root.id, side);
        return;
      }
    }
    applyLayout(ctx.store, branch.mindmap.rootId);
  };
  const resize = (p: Point, shift: boolean, ctx: ToolContext) => {
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
  const rotate = (p: Point, shift: boolean, ctx: ToolContext) => {
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
  /** Moves one end of a line or arrow to `p` (world), keeping the other points in place. */
  const moveEnd = (id: string, which: number, p: Point, ctx: ToolContext) => {
    ctx.store.update([id], (el) => {
      if (!isLinear(el)) return;
      const points = el.points.map(([x, y]) => ({ x: el.x + x, y: el.y + y }));
      points[which === START ? 0 : points.length - 1] = p;
      const minX = Math.min(...points.map((q) => q.x));
      const minY = Math.min(...points.map((q) => q.y));
      el.x = minX;
      el.y = minY;
      el.width = Math.max(...points.map((q) => q.x)) - minX;
      el.height = Math.max(...points.map((q) => q.y)) - minY;
      el.points = points.map((q) => [q.x - minX, q.y - minY]);
      el.angle = 0;
      if (which === START) el.startBinding = null;
      else el.endBinding = null;
    });
  };
  /** Adds a copy of `source` next to it in `direction`, joined by an arrow. */
  const connectNew = (source: ShapeElement, direction: Direction, ctx: ToolContext) => {
    const w = Math.abs(source.width);
    const h = Math.abs(source.height);
    const gap = 90;
    const b = elementBounds(source);
    const step = {
      right: { x: w + gap, y: 0 },
      left: { x: -(w + gap), y: 0 },
      down: { x: 0, y: h + gap },
      up: { x: 0, y: -(h + gap) },
    }[direction];
    const sideways =
      direction === 'right' || direction === 'left' ? { x: 0, y: h + 30 } : { x: w + 30, y: 0 };
    let x = b.minX + step.x;
    let y = b.minY + step.y;
    const others = ctx.store.getElements().map(elementBounds);
    for (let i = 0; i < 12; i++) {
      const box = { minX: x - 8, minY: y - 8, maxX: x + w + 8, maxY: y + h + 8 };
      if (!others.some((o) => boundsIntersect(o, box))) break;
      x += sideways.x;
      y += sideways.y;
    }
    const shape: ShapeElement = {
      ...structuredClone(source),
      id: createId(),
      x,
      y,
      width: w,
      height: h,
      angle: 0,
      seed: createNonce(),
      version: 1,
      versionNonce: createNonce(),
      groupIds: [],
      locked: false,
    };
    delete shape.label;
    delete shape.mindmap;
    const arrow = arrowBetween(source, centerOf(shape), ctx);
    arrow.endBinding = { elementId: shape.id };
    ctx.store.beginHistoryGroup();
    ctx.store.add(shape);
    ctx.store.add(arrow);
    ctx.store.endHistoryGroup();
    ctx.appState.update({ selectedIds: new Set([shape.id]) });
    editLabel(shape, ctx);
  };
  const arrowBetween = (source: Element, to: Point, ctx: ToolContext): LinearElement => {
    const from = centerOf(source);
    const s = ctx.appState.value.style;
    return {
      ...base('arrow', Math.min(from.x, to.x), Math.min(from.y, to.y), ctx),
      type: 'arrow',
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
      points: [
        [from.x - Math.min(from.x, to.x), from.y - Math.min(from.y, to.y)],
        [to.x - Math.min(from.x, to.x), to.y - Math.min(from.y, to.y)],
      ],
      startArrowhead: s.startArrowhead,
      endArrowhead: s.endArrowhead ?? 'arrow',
      startBinding: { elementId: source.id },
      endBinding: null,
    };
  };
  const finishGesture = (ctx: ToolContext) => {
    mode = 'none';
    target = null;
    guides = [];
    connectArrow = null;
    originals = new Map();
    ctx.renderer.markDirty('interactive');
  };
  return {
    id: 'select',
    cursor: 'default',
    onPointerDown(e, ctx) {
      const p = world(e, ctx);
      start = current = p;
      moved = false;
      handle = handleAt(p.x, p.y, ctx);
      if (handle >= CONNECT) {
        mode = 'connect';
        return;
      }
      if (handle === START || handle === END) {
        mode = 'endpoint';
        ctx.store.beginHistoryGroup();
        return;
      }
      if (handle >= 0) {
        mode = handle === 8 ? 'rotate' : 'resize';
        originalBounds = selectionBounds(selected(ctx));
        originals = new Map(selected(ctx).map((el) => [el.id, structuredClone(el)]));
        ctx.store.beginHistoryGroup();
        return;
      }
      const collapsible = collapseAt(p, ctx);
      if (collapsible) {
        toggleCollapsed(ctx.store, collapsible.id);
        ctx.appState.update({ selectedIds: new Set([collapsible.id]) });
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
      const far = Math.hypot(p.x - start.x, p.y - start.y) > 4 / zoom(ctx);
      if (mode === 'drag') {
        if (moved || far) drag(p, e, ctx);
      } else if (mode === 'resize') resize(p, e.shiftKey, ctx);
      else if (mode === 'rotate') rotate(p, e.shiftKey, ctx);
      else if (mode === 'endpoint') {
        const line = single(ctx);
        if (!isLinear(line)) return;
        moveEnd(line.id, handle, p, ctx);
        target =
          line.type === 'arrow' && !e.ctrlKey
            ? bindTargetAt(ctx.store, p, 4 / zoom(ctx), new Set([line.id]))
            : null;
      } else if (mode === 'connect') {
        const source = single(ctx);
        if (!source || isNode(source)) return;
        if (!connectArrow && far) {
          const arrow = arrowBetween(source, p, ctx);
          connectArrow = arrow.id;
          ctx.store.beginHistoryGroup();
          ctx.store.add(arrow);
        }
        if (connectArrow) {
          moveEnd(connectArrow, END, p, ctx);
          target = bindTargetAt(ctx.store, p, 4 / zoom(ctx), new Set([connectArrow, source.id]));
        }
      }
      ctx.renderer.markDirty('interactive');
    },
    onPointerUp(_e, ctx) {
      if (mode === 'drag') {
        if (moved) dropBranch(ctx);
        ctx.store.endHistoryGroup();
      } else if (mode === 'resize' || mode === 'rotate') ctx.store.endHistoryGroup();
      else if (mode === 'endpoint') {
        const line = single(ctx);
        if (isLinear(line) && target)
          ctx.store.update([line.id], (el) => {
            if (!isLinear(el)) return;
            if (handle === START) el.startBinding = { elementId: target!.id };
            else el.endBinding = { elementId: target!.id };
          });
        ctx.store.endHistoryGroup();
      } else if (mode === 'connect') {
        const source = single(ctx);
        if (connectArrow) {
          const id = connectArrow;
          if (target)
            ctx.store.update([id], (el) => {
              if (isLinear(el)) el.endBinding = { elementId: target!.id };
            });
          ctx.store.endHistoryGroup();
          ctx.appState.update({ selectedIds: new Set([id]) });
        } else if (isNode(source)) addChildNode(ctx, source.id);
        else if (isShape(source)) connectNew(source, DIRECTIONS[handle - CONNECT]!, ctx);
      } else if (mode === 'marquee') {
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
      finishGesture(ctx);
    },
    onDoubleClick(e, ctx) {
      const p = world(e, ctx);
      const el = hit(p.x, p.y, ctx);
      if (el?.type === 'text') editTextAt(el.x, el.y, ctx, el);
      else if (isNode(el)) renameNode(ctx, el.id);
      else if (isShape(el)) {
        ctx.appState.update({ selectedIds: new Set([el.id]) });
        editLabel(el, ctx);
      } else if (!el) editTextAt(p.x, p.y, ctx);
    },
    onKeyDown(e, ctx) {
      const mod = e.ctrlKey || e.metaKey;
      const ids = ctx.appState.value.selectedIds;
      const one = single(ctx);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const nodes = [...ids].filter((id) => isNode(ctx.store.get(id)));
        ctx.store.beginHistoryGroup();
        const next = nodes.length ? removeBranches(ctx.store, nodes) : null;
        ctx.store.remove(ids);
        ctx.store.endHistoryGroup();
        ctx.appState.update({ selectedIds: new Set(next ? [next] : []) });
      } else if (e.key === 'Tab' && isNode(one)) {
        e.preventDefault();
        addChildNode(ctx, one.id);
      } else if (e.key === 'Enter' && !mod && one) {
        e.preventDefault();
        if (isNode(one)) addSiblingNode(ctx, one.id);
        else if (isShape(one)) editLabel(one, ctx);
        else if (one.type === 'text') editTextAt(one.x, one.y, ctx, one);
      } else if (e.key === 'F2' && one) {
        if (isNode(one)) renameNode(ctx, one.id);
        else if (isShape(one)) editLabel(one, ctx);
        else if (one.type === 'text') editTextAt(one.x, one.y, ctx, one);
      } else if (e.key.startsWith('Arrow') && isNode(one) && !e.shiftKey && !e.altKey && !mod) {
        e.preventDefault();
        const direction = e.key.slice(5).toLowerCase() as 'left' | 'right' | 'up' | 'down';
        const next = neighbour(ctx.store, one.id, direction);
        if (next) ctx.appState.update({ selectedIds: new Set([next]) });
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        ctx.store.update(dragSet(ctx), (el) => {
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
    render(c2d, ctx) {
      if (mode === 'marquee') {
        const a = ctx.camera.worldToScreen(start);
        const b = ctx.camera.worldToScreen(current);
        const d = devicePixelRatio;
        c2d.setTransform(d, 0, 0, d, 0, 0);
        c2d.fillStyle = '#CD7EBF22';
        c2d.strokeStyle = '#CD7EBF';
        c2d.lineWidth = 1;
        c2d.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        c2d.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        return;
      }
      const z = worldTransform(c2d, ctx);
      if (target) highlight(c2d, target, z);
      for (const g of guides) {
        c2d.strokeStyle = '#CD7EBF';
        c2d.lineWidth = 1 / z;
        c2d.setLineDash([4 / z, 4 / z]);
        c2d.beginPath();
        if (g.axis === 'x') {
          c2d.moveTo(g.at, g.from);
          c2d.lineTo(g.at, g.to);
        } else {
          c2d.moveTo(g.from, g.at);
          c2d.lineTo(g.to, g.at);
        }
        c2d.stroke();
        c2d.setLineDash([]);
      }
      const one = single(ctx);
      if (isLinear(one) && (mode === 'none' || mode === 'endpoint')) {
        const first = one.points[0]!;
        const last = one.points.at(-1)!;
        dot(c2d, { x: one.x + first[0], y: one.y + first[1] }, z, Boolean(one.startBinding));
        dot(c2d, { x: one.x + last[0], y: one.y + last[1] }, z, Boolean(one.endBinding));
      }
      const connector = showConnect(ctx);
      if (connector) for (const p of connectPoints(connector, ctx)) signButton(c2d, p, z, '+');
      for (const id of ctx.appState.value.selectedIds) {
        const el = ctx.store.get(id);
        if (
          isNode(el) &&
          el.mindmap.parentId &&
          !el.mindmap.collapsed &&
          childrenOf(ctx.store, id).length
        )
          signButton(c2d, collapseButton(el), z, '-', el.mindmap.color);
      }
    },
    cancel(ctx) {
      if (mode === 'drag' || mode === 'resize' || mode === 'rotate' || mode === 'endpoint')
        ctx.store.endHistoryGroup();
      if (mode === 'connect' && connectArrow) ctx.store.endHistoryGroup();
      finishGesture(ctx);
    },
  };
};
