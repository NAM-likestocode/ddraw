import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from './file';
import { DEFAULT_APP_STATE } from '../core/types';
import type { ShapeElement } from '../core/types';
import { arrow, shape } from '../test/fixtures';
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
it('keeps labels, mind-map links and attached arrows', () => {
  const node: ShapeElement = {
    ...shape('n', 0, 0),
    label: { text: 'Hi', fontSize: 18, fontFamily: 'hand' },
    mindmap: {
      rootId: 'n',
      parentId: null,
      side: 'right',
      order: 0,
      collapsed: true,
      color: '#abc',
    },
  };
  const json = serialize([node, arrow('a', 'n', null)], DEFAULT_APP_STATE(), {});
  expect(JSON.parse(json).version).toBe(2);
  const [n, a] = deserialize(json).elements;
  expect(n).toMatchObject({ label: node.label, mindmap: node.mindmap });
  expect(a).toMatchObject({ startBinding: { elementId: 'n' }, endBinding: null });
});
it('opens version 1 files and refuses newer ones', () => {
  const v1 = JSON.stringify({ type: 'ddraw', version: 1, elements: [shape('r', 5, 5)] });
  const [r] = deserialize(v1).elements;
  expect(r).toMatchObject({ id: 'r', x: 5 });
  expect(r).not.toHaveProperty('label');
  const newer = JSON.stringify({ type: 'ddraw', version: 99, elements: [] });
  expect(() => deserialize(newer)).toThrow(/newer/);
});
