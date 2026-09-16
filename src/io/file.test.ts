import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from './file';
import { DEFAULT_APP_STATE } from '../core/types';
import type { ShapeElement } from '../core/types';
it('round trips ddraw files', () => {
  const element: ShapeElement = {
    id: 'r',
    type: 'rectangle',
    x: 1,
    y: 2,
    width: 3,
    height: 4,
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
    version: 2,
    versionNonce: 3,
    isDeleted: false,
    groupIds: [],
    locked: false,
  };
  const state = DEFAULT_APP_STATE();
  state.gridEnabled = true;
  const result = deserialize(serialize([element], state, {}));
  expect(result.elements).toHaveLength(1);
  expect(result.elements[0]).toMatchObject({ id: 'r', x: 1, roundness: 'sharp' });
  expect(result.appState.gridEnabled).toBe(true);
});
