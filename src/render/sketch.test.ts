import rough from 'roughjs';
import { describe, expect, it, vi } from 'vitest';
import type { BaseElement, Element } from '../core/types';
import { exportToSvg } from '../io/export';
import { generateSketch, needsSketch, sketchFor } from './sketch';

const base: BaseElement = {
  id: 'shape',
  type: 'rectangle',
  x: 10,
  y: 20,
  width: 120,
  height: 80,
  angle: 0,
  strokeColor: '#171B24',
  backgroundColor: '#F8AB95',
  fillStyle: 'solid',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 100,
  roundness: 'sharp',
  seed: 42,
  version: 1,
  versionNonce: 1,
  isDeleted: false,
  groupIds: [],
  locked: false,
};

const rectangle: Element = { ...base, type: 'rectangle' };

const arrow = (endArrowhead: 'arrow' | null): Element => ({
  ...base,
  id: 'arrow',
  type: 'arrow',
  points: [
    [0, 0],
    [100, 40],
  ],
  startArrowhead: null,
  endArrowhead,
});

describe('needsSketch', () => {
  it('uses rough.js for sketchy and hatched shapes only', () => {
    expect(needsSketch(rectangle)).toBe(true);
    expect(needsSketch({ ...rectangle, roughness: 0 })).toBe(false);
    expect(needsSketch({ ...rectangle, roughness: 0, fillStyle: 'none' })).toBe(false);
    expect(needsSketch({ ...rectangle, roughness: 0, fillStyle: 'hachure' })).toBe(true);
  });
});

describe('sketchFor', () => {
  it('never calls rough.js for a clean element', () => {
    const spy = vi.spyOn(Object.getPrototypeOf(rough.generator()), 'rectangle');
    try {
      expect(sketchFor({ ...rectangle, id: 'clean', roughness: 0 })).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
      // Control: a sketchy element of the same shape does reach rough.js.
      expect(sketchFor({ ...rectangle, id: 'sketchy' })).toBeDefined();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('returns the cached sketch for the same element object', () => {
    expect(sketchFor(rectangle)).toBe(sketchFor(rectangle));
  });
});

describe('generateSketch', () => {
  it('gives identical path data for the same element and different data for another seed', () => {
    const data = (e: Element) => generateSketch(e).paths.map((path) => path.d);
    expect(data(rectangle)).toEqual(data(rectangle));
    expect(data({ ...rectangle, seed: 43 })).not.toEqual(data(rectangle));
  });

  it('draws outlines as dashable strokes and hatching as solid strokes in the background colour', () => {
    const hatched = generateSketch({ ...rectangle, roughness: 0, fillStyle: 'hachure' });
    const outlines = hatched.paths.filter((path) => path.stroke === base.strokeColor);
    const hatch = hatched.paths.filter((path) => path.stroke === base.backgroundColor);
    expect(outlines.length).toBeGreaterThan(0);
    expect(outlines.every((path) => path.dashed)).toBe(true);
    expect(hatch.length).toBeGreaterThan(0);
    expect(hatch.every((path) => !path.dashed && path.strokeWidth === 1)).toBe(true);
  });

  it('adds arrowhead strokes to an arrow', () => {
    const plain = generateSketch(arrow(null)).paths.length;
    const headed = generateSketch(arrow('arrow')).paths.length;
    expect(headed).toBeGreaterThan(plain);
  });
});

describe('SVG export', () => {
  it('writes the same path data that the canvas renderer draws', () => {
    const sketch = sketchFor(rectangle);
    expect(sketch?.paths.length).toBeGreaterThan(0);
    const svg = exportToSvg([rectangle], {});
    for (const path of sketch?.paths ?? []) expect(svg).toContain(`d="${path.d}"`);
  });
});
