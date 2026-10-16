import type { Element, LinearElement, Point } from './types';
import type { SceneStore } from './store';
import { rotatePoint } from './geometry';
/** Distance kept between an attached arrow end and the shape's outline. */
export const BIND_GAP = 6;
export function canBind(el: Element | undefined): el is Element {
  return Boolean(
    el && !el.isDeleted && el.type !== 'line' && el.type !== 'arrow' && el.type !== 'freedraw',
  );
}
export function centerOf(el: Element): Point {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}
/** Where a line from the shape's centre toward `toward` leaves the shape, plus `gap`. */
export function outlinePoint(el: Element, toward: Point, gap = BIND_GAP): Point {
  const c = centerOf(el);
  const local = rotatePoint(toward.x, toward.y, c.x, c.y, -el.angle);
  const dx = local.x - c.x;
  const dy = local.y - c.y;
  const length = Math.hypot(dx, dy);
  if (!length) return c;
  const hw = Math.abs(el.width) / 2 || 1;
  const hh = Math.abs(el.height) / 2 || 1;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const t =
    el.type === 'ellipse'
      ? 1 / Math.hypot(dx / hw, dy / hh)
      : el.type === 'diamond'
        ? 1 / (ax / hw + ay / hh)
        : Math.min(ax ? hw / ax : Infinity, ay ? hh / ay : Infinity);
  const x = c.x + dx * t + (dx / length) * gap;
  const y = c.y + dy * t + (dy / length) * gap;
  return rotatePoint(x, y, c.x, c.y, el.angle);
}
function worldPoints(a: LinearElement): Point[] {
  const cx = a.x + a.width / 2;
  const cy = a.y + a.height / 2;
  return a.points.map(([px, py]) => rotatePoint(a.x + px, a.y + py, cx, cy, a.angle));
}
function setWorldPoints(a: LinearElement, points: Point[]): void {
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  a.angle = 0;
  a.x = minX;
  a.y = minY;
  a.width = Math.max(...points.map((p) => p.x)) - minX;
  a.height = Math.max(...points.map((p) => p.y)) - minY;
  a.points = points.map((p) => [p.x - minX, p.y - minY]);
}
/**
 * Moves the attached ends of `arrow` onto the outlines of the shapes they are
 * attached to, and drops attachments to shapes that no longer exist.
 */
export function routeArrow(arrow: LinearElement, get: (id: string) => Element | undefined): void {
  const start = arrow.startBinding ? get(arrow.startBinding.elementId) : undefined;
  const end = arrow.endBinding ? get(arrow.endBinding.elementId) : undefined;
  if (arrow.startBinding && !canBind(start)) arrow.startBinding = null;
  if (arrow.endBinding && !canBind(end)) arrow.endBinding = null;
  if (!arrow.startBinding && !arrow.endBinding) return;
  const points = worldPoints(arrow);
  if (points.length < 2) return;
  const last = points.length - 1;
  const bent = points.length > 2;
  const from = arrow.startBinding ? start : undefined;
  const to = arrow.endBinding ? end : undefined;
  const startAim = bent ? points[1]! : to ? centerOf(to) : points[last]!;
  const endAim = bent ? points[last - 1]! : from ? centerOf(from) : points[0]!;
  if (from) points[0] = outlinePoint(from, startAim);
  if (to) points[last] = outlinePoint(to, endAim);
  setWorldPoints(arrow, points);
}
function bindsTo(el: Element, ids: Set<string>): boolean {
  if (el.type !== 'line' && el.type !== 'arrow') return false;
  if (!el.startBinding && !el.endBinding) return false;
  return (
    ids.has(el.id) ||
    (el.startBinding ? ids.has(el.startBinding.elementId) : false) ||
    (el.endBinding ? ids.has(el.endBinding.elementId) : false)
  );
}
const samePoints = (a: LinearElement, b: LinearElement) =>
  a.x === b.x &&
  a.y === b.y &&
  a.angle === b.angle &&
  a.startBinding?.elementId === b.startBinding?.elementId &&
  a.endBinding?.elementId === b.endBinding?.elementId &&
  a.points.length === b.points.length &&
  a.points.every((p, i) => p[0] === b.points[i]![0] && p[1] === b.points[i]![1]);
/** Re-routes every arrow attached to (or being) one of `changed`. Part of the same undo step. */
export function syncBindings(store: SceneStore, changed: Set<string>): void {
  const updates = new Map<string, LinearElement>();
  const get = (id: string) => store.get(id);
  for (const el of store.getElements(true)) {
    if (el.isDeleted || !bindsTo(el, changed)) continue;
    const routed = structuredClone(el) as LinearElement;
    routeArrow(routed, get);
    if (!samePoints(routed, el as LinearElement)) updates.set(el.id, routed);
  }
  if (updates.size) store.update(updates.keys(), (el) => updates.get(el.id));
}
/** The topmost shape an arrow end at `p` would attach to. */
export function bindTargetAt(
  store: SceneStore,
  p: Point,
  margin: number,
  ignore: Set<string> = new Set(),
): Element | null {
  const list = store.getElements();
  for (let i = list.length - 1; i >= 0; i--) {
    const el = list[i]!;
    if (ignore.has(el.id) || !canBind(el) || el.locked) continue;
    const c = centerOf(el);
    const q = rotatePoint(p.x, p.y, c.x, c.y, -el.angle);
    const hw = Math.abs(el.width) / 2 + margin;
    const hh = Math.abs(el.height) / 2 + margin;
    const dx = Math.abs(q.x - c.x);
    const dy = Math.abs(q.y - c.y);
    const inside =
      el.type === 'ellipse'
        ? (dx / hw) ** 2 + (dy / hh) ** 2 <= 1
        : el.type === 'diamond'
          ? dx / hw + dy / hh <= 1
          : dx <= hw && dy <= hh;
    if (inside) return el;
  }
  return null;
}
