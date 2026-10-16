import type { LinearElement, ShapeElement } from '../core/types';
export function shape(id: string, x: number, y: number, w = 100, h = 60): ShapeElement {
  return {
    id,
    type: 'rectangle',
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: '#fff',
    backgroundColor: 'transparent',
    fillStyle: 'none',
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
  };
}
export function arrow(id: string, from: string | null, to: string | null): LinearElement {
  return {
    ...shape(id, 0, 0, 10, 10),
    type: 'arrow',
    points: [
      [0, 0],
      [10, 10],
    ],
    startArrowhead: null,
    endArrowhead: 'arrow',
    startBinding: from ? { elementId: from } : null,
    endBinding: to ? { elementId: to } : null,
  };
}
