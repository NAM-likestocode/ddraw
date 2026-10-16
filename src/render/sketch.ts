import rough from 'roughjs';
import type { Drawable, Options } from 'roughjs/bin/core';
import type { Arrowhead, Element } from '../core/types';

// Hand-drawn ("sketchy") geometry from rough.js. Each shape becomes plain SVG path data in scene
// coordinates, so the canvas (Path2D) and the SVG export draw exactly the same paths.

export interface SketchPath {
  /** SVG path data in scene coordinates, rounded to 2 decimals. */
  readonly d: string;
  /** 'none' when the path is not stroked. */
  readonly stroke: string;
  readonly strokeWidth: number;
  /** 'none' when the path is not filled. */
  readonly fill: string;
  /** Outlines follow the element's dash style. Hatch lines and fills are always solid. */
  readonly dashed: boolean;
}

export interface Sketch {
  readonly paths: readonly SketchPath[];
}

const SKETCHABLE = new Set<string>(['rectangle', 'ellipse', 'diamond', 'line', 'arrow']);
const DECIMALS = 2;
const generator = rough.generator();
const sketches = new WeakMap<Element, Sketch>();

/** Clean shapes (roughness 0 with a solid or no fill) keep the plain canvas path. */
export function needsSketch(e: Element): boolean {
  if (!SKETCHABLE.has(e.type)) return false;
  return e.roughness > 0 || e.fillStyle === 'hachure' || e.fillStyle === 'cross-hatch';
}

/**
 * Cached sketch for an element. Elements are never mutated (each edit creates a new object),
 * so a cached sketch cannot go stale.
 */
export function sketchFor(e: Element): Sketch | undefined {
  if (!needsSketch(e)) return undefined;
  let sketch = sketches.get(e);
  if (!sketch) {
    sketch = generateSketch(e);
    sketches.set(e, sketch);
  }
  return sketch;
}

/** Builds a sketch without caching it. The same element and seed always give the same paths. */
export function generateSketch(e: Element): Sketch {
  const paths: SketchPath[] = [];
  if (e.type === 'rectangle') {
    const x = Math.min(e.x, e.x + e.width);
    const y = Math.min(e.y, e.y + e.height);
    const width = Math.abs(e.width);
    const height = Math.abs(e.height);
    const options = closedOptions(e);
    const radius = e.roundness === 'round' ? Math.min(12, width / 4, height / 4) : 0;
    const drawable =
      radius > 0
        ? generator.path(roundedRect(x, y, width, height, radius), options)
        : generator.rectangle(x, y, width, height, options);
    paths.push(...toSketchPaths(drawable));
  } else if (e.type === 'ellipse') {
    const drawable = generator.ellipse(
      e.x + e.width / 2,
      e.y + e.height / 2,
      Math.abs(e.width),
      Math.abs(e.height),
      closedOptions(e),
    );
    paths.push(...toSketchPaths(drawable));
  } else if (e.type === 'diamond') {
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;
    const corners: [number, number][] = [
      [cx, e.y],
      [e.x + e.width, cy],
      [cx, e.y + e.height],
      [e.x, cy],
    ];
    paths.push(...toSketchPaths(generator.polygon(corners, closedOptions(e))));
  } else if (e.type === 'line' || e.type === 'arrow') {
    const points = e.points.map((point): [number, number] => [e.x + point[0], e.y + point[1]]);
    if (points.length > 1) {
      const options = baseOptions(e);
      paths.push(...toSketchPaths(generator.linearPath(points, options)));
      const last = points.length - 1;
      paths.push(...headPaths(e, e.endArrowhead, points[last]!, points[last - 1]!));
      paths.push(...headPaths(e, e.startArrowhead, points[0]!, points[1]!));
    }
  }
  return { paths };
}

/** Options shared by every shape: seed, roughness and stroke. */
function baseOptions(e: Element): Options {
  const clean = e.roughness === 0;
  // rough.js falls back to Math.random() when the seed is 0, which would redraw differently.
  const seed = Number.isInteger(e.seed) && e.seed !== 0 ? e.seed : 1;
  const weight = Math.max(e.strokeWidth, 1);
  return {
    seed,
    roughness: e.roughness,
    stroke: e.strokeColor,
    strokeWidth: e.strokeWidth,
    hachureGap: weight * 4,
    fillWeight: weight / 2,
    // Roughness 0 must not draw a second, offset stroke.
    disableMultiStroke: clean,
    disableMultiStrokeFill: clean,
    preserveVertices: true,
  };
}

/** Options for closed shapes: the outline plus the fill, when the element has one. */
function closedOptions(e: Element): Options {
  const options = baseOptions(e);
  if (e.fillStyle === 'none' || e.backgroundColor === 'transparent') return options;
  const fillStyle =
    e.fillStyle === 'solid' ? 'solid' : e.fillStyle === 'cross-hatch' ? 'cross-hatch' : 'hachure';
  // Hatch lines use the background colour, as in Excalidraw.
  return { ...options, fill: e.backgroundColor, fillStyle };
}

/** Arrowhead geometry matches the clean canvas arrowheads: same size and orientation. */
function headPaths(
  e: Element,
  type: Arrowhead,
  tip: [number, number],
  previous: [number, number],
): SketchPath[] {
  if (!type) return [];
  const angle = Math.atan2(tip[1] - previous[1], tip[0] - previous[0]);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const size = 8 + e.strokeWidth * 2;
  // Maps an offset in the arrow's own frame (along the line, then across it) to scene coordinates.
  const at = (along: number, across: number): [number, number] => [
    tip[0] + along * cos - across * sin,
    tip[1] + along * sin + across * cos,
  ];
  const options = baseOptions(e);
  if (type === 'dot') {
    const diameter = (size * 2) / 3;
    // Dots are filled with the stroke colour so they stay visible on transparent backgrounds.
    const dot = generator.ellipse(tip[0], tip[1], diameter, diameter, {
      ...options,
      fill: e.strokeColor,
      fillStyle: 'solid',
    });
    return toSketchPaths(dot).filter((path) => path.fill !== 'none');
  }
  if (type === 'bar') {
    const [x1, y1] = at(0, -size / 2);
    const [x2, y2] = at(0, size / 2);
    return toSketchPaths(generator.line(x1, y1, x2, y2, options));
  }
  const barbs: [number, number][] = [at(-size, -size / 2), tip, at(-size, size / 2)];
  return toSketchPaths(generator.linearPath(barbs, options));
}

/** Rounded-rectangle outline, with the same corner radius as the canvas roundRect call. */
function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const k = r * 0.5523; // Bezier handle length for a quarter circle
  return [
    `M ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `C ${x + w - r + k} ${y} ${x + w} ${y + r - k} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h - r}`,
    `C ${x + w} ${y + h - r + k} ${x + w - r + k} ${y + h} ${x + w - r} ${y + h}`,
    `L ${x + r} ${y + h}`,
    `C ${x + r - k} ${y + h} ${x} ${y + h - r + k} ${x} ${y + h - r}`,
    `L ${x} ${y + r}`,
    `C ${x} ${y + r - k} ${x + r - k} ${y} ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

/**
 * Converts rough.js sets to SVG path data. Sets keep rough's order (fill, then hatching, then
 * outline). This mirrors rough's own toPaths(), but rounds numbers to keep the strings short.
 */
function toSketchPaths(drawable: Drawable): SketchPath[] {
  const o = drawable.options;
  return drawable.sets.map((set): SketchPath => {
    const d = generator.opsToPath(set, DECIMALS);
    if (set.type === 'path') {
      return { d, stroke: o.stroke, strokeWidth: o.strokeWidth, fill: 'none', dashed: true };
    }
    if (set.type === 'fillPath') {
      return { d, stroke: 'none', strokeWidth: 0, fill: o.fill ?? 'none', dashed: false };
    }
    // Hatch lines are strokes in the fill colour.
    return { d, stroke: o.fill ?? 'none', strokeWidth: o.fillWeight, fill: 'none', dashed: false };
  });
}
