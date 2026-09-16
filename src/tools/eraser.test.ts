import { describe, expect, it } from 'vitest';
import { eraserPathIntersects } from './eraser';
import type { ShapeElement } from '../core/types';

const rectangle = (patch: Partial<ShapeElement> = {}): ShapeElement => ({
  id: 'rectangle',
  type: 'rectangle',
  x: 20,
  y: 20,
  width: 80,
  height: 40,
  angle: 0,
  strokeColor: '#fff',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 0,
  opacity: 100,
  roundness: 'sharp',
  seed: 1,
  version: 1,
  versionNonce: 1,
  isDeleted: false,
  groupIds: [],
  locked: false,
  ...patch,
});

describe('eraser hit testing', () => {
  it('hits filled shapes along the pointer path', () => {
    const element = rectangle();
    expect(eraserPathIntersects(element, { x: 0, y: 40 }, { x: 120, y: 40 })).toBe(true);
    expect(eraserPathIntersects(element, { x: 0, y: 70 }, { x: 120, y: 70 })).toBe(false);
  });

  it('does not hit deleted elements', () => {
    expect(
      eraserPathIntersects(rectangle({ isDeleted: true }), { x: 0, y: 40 }, { x: 120, y: 40 }),
    ).toBe(false);
  });
});
