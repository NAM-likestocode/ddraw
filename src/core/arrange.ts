import type { Element } from './types';
import { elementBounds, selectionBounds, type Bounds } from './geometry';

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type Axis = 'x' | 'y';
export interface Move {
  dx: number;
  dy: number;
}

/** Splits elements into units that move together: each outermost group, or a single element. */
export function unitsOf(elements: readonly Element[]): Element[][] {
  const units = new Map<string, Element[]>();
  for (const el of elements) {
    const key = el.groupIds.at(-1) ?? `#${el.id}`;
    const unit = units.get(key) ?? [];
    unit.push(el);
    units.set(key, unit);
  }
  return [...units.values()];
}

const boundsOf = (unit: Element[]): Bounds =>
  unit.length === 1 ? elementBounds(unit[0]!) : selectionBounds(unit)!;

function toMoves(units: Element[][], shift: (b: Bounds) => Move): Map<string, Move> {
  const moves = new Map<string, Move>();
  for (const unit of units) {
    const move = shift(boundsOf(unit));
    if (Math.abs(move.dx) < 1e-9 && Math.abs(move.dy) < 1e-9) continue;
    for (const el of unit) moves.set(el.id, move);
  }
  return moves;
}

/** How far each element moves to line the units up along one edge or centre line. */
export function alignMoves(elements: readonly Element[], how: Alignment): Map<string, Move> {
  const units = unitsOf(elements);
  const all = selectionBounds(elements);
  if (units.length < 2 || !all) return new Map();
  const cx = (all.minX + all.maxX) / 2;
  const cy = (all.minY + all.maxY) / 2;
  return toMoves(units, (b) => {
    switch (how) {
      case 'left':
        return { dx: all.minX - b.minX, dy: 0 };
      case 'right':
        return { dx: all.maxX - b.maxX, dy: 0 };
      case 'center':
        return { dx: cx - (b.minX + b.maxX) / 2, dy: 0 };
      case 'top':
        return { dx: 0, dy: all.minY - b.minY };
      case 'bottom':
        return { dx: 0, dy: all.maxY - b.maxY };
      case 'middle':
        return { dx: 0, dy: cy - (b.minY + b.maxY) / 2 };
    }
  });
}

/** How far each element moves to leave equal gaps between the units along `axis`. */
export function distributeMoves(elements: readonly Element[], axis: Axis): Map<string, Move> {
  const units = unitsOf(elements);
  if (units.length < 3) return new Map();
  const [min, max] = axis === 'x' ? (['minX', 'maxX'] as const) : (['minY', 'maxY'] as const);
  const sorted = units
    .map((unit) => ({ unit, b: boundsOf(unit) }))
    .sort((a, b) => a.b[min] + a.b[max] - (b.b[min] + b.b[max]));
  const start = Math.min(...sorted.map((u) => u.b[min]));
  const end = Math.max(...sorted.map((u) => u.b[max]));
  const used = sorted.reduce((sum, u) => sum + u.b[max] - u.b[min], 0);
  const gap = (end - start - used) / (sorted.length - 1);
  const target = new Map<Element[], number>();
  let at = start;
  for (const u of sorted) {
    target.set(u.unit, at - u.b[min]);
    at += u.b[max] - u.b[min] + gap;
  }
  const moves = new Map<string, Move>();
  for (const [unit, delta] of target) {
    if (Math.abs(delta) < 1e-9) continue;
    const move = axis === 'x' ? { dx: delta, dy: 0 } : { dx: 0, dy: delta };
    for (const el of unit) moves.set(el.id, move);
  }
  return moves;
}
