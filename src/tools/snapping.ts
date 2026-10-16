import type { Bounds } from '../core/geometry';
export interface Guide {
  axis: 'x' | 'y';
  /** Position of the guide line on its axis. */
  at: number;
  from: number;
  to: number;
}
export interface Snap {
  dx: number;
  dy: number;
  guides: Guide[];
}
const xs = (b: Bounds) => [b.minX, (b.minX + b.maxX) / 2, b.maxX];
const ys = (b: Bounds) => [b.minY, (b.minY + b.maxY) / 2, b.maxY];
/**
 * Nudges `moving` so its edges or centre line up with those of `others` when
 * they are within `threshold`, and returns guide lines to show the match.
 */
export function snapBounds(moving: Bounds, others: readonly Bounds[], threshold: number): Snap {
  let bestX: { d: number; at: number } | null = null;
  let bestY: { d: number; at: number } | null = null;
  for (const o of others) {
    for (const a of xs(moving))
      for (const b of xs(o)) {
        const d = b - a;
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d)))
          bestX = { d, at: b };
      }
    for (const a of ys(moving))
      for (const b of ys(o)) {
        const d = b - a;
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d)))
          bestY = { d, at: b };
      }
  }
  const dx = bestX?.d ?? 0;
  const dy = bestY?.d ?? 0;
  const moved = {
    minX: moving.minX + dx,
    maxX: moving.maxX + dx,
    minY: moving.minY + dy,
    maxY: moving.maxY + dy,
  };
  const guides: Guide[] = [];
  const near = (v: number, w: number) => Math.abs(v - w) < 0.5;
  if (bestX) {
    const matches = others.filter((o) => xs(o).some((v) => near(v, bestX!.at)));
    guides.push({
      axis: 'x',
      at: bestX.at,
      from: Math.min(moved.minY, ...matches.map((o) => o.minY)),
      to: Math.max(moved.maxY, ...matches.map((o) => o.maxY)),
    });
  }
  if (bestY) {
    const matches = others.filter((o) => ys(o).some((v) => near(v, bestY!.at)));
    guides.push({
      axis: 'y',
      at: bestY.at,
      from: Math.min(moved.minX, ...matches.map((o) => o.minX)),
      to: Math.max(moved.maxX, ...matches.map((o) => o.maxX)),
    });
  }
  return { dx, dy, guides };
}
