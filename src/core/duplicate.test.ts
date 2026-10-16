import { describe, expect, it } from 'vitest';
import { duplicateElements } from './duplicate';
import { arrow, shape } from '../test/fixtures';
import type { ShapeElement } from './types';

const node = (id: string, parentId: string | null, rootId: string): ShapeElement => ({
  ...shape(id, 0, 0),
  mindmap: { rootId, parentId, side: 'right', order: 0, collapsed: false, color: '#88C0D0' },
});

describe('duplicateElements', () => {
  it('keeps arrows attached to copied shapes and drops other links', () => {
    const [a, b, both, half] = duplicateElements([
      shape('a', 0, 0),
      shape('b', 200, 0),
      arrow('ab', 'a', 'b'),
      arrow('ax', 'a', 'x'),
    ]);
    expect(both).toMatchObject({
      startBinding: { elementId: a!.id },
      endBinding: { elementId: b!.id },
    });
    expect(half).toMatchObject({ startBinding: { elementId: a!.id }, endBinding: null });
    expect(a!.x).toBe(20);
  });
  it('gives copied groups a new shared id', () => {
    const [a, b] = duplicateElements([
      { ...shape('a', 0, 0), groupIds: ['g'] },
      { ...shape('b', 0, 0), groupIds: ['g'] },
    ]);
    expect(a!.groupIds[0]).not.toBe('g');
    expect(a!.groupIds).toEqual(b!.groupIds);
  });
  it('turns a copied branch into a new mind map', () => {
    const [top, leaf] = duplicateElements([node('c', 'root', 'root'), node('d', 'c', 'root')]) as [
      ShapeElement,
      ShapeElement,
    ];
    expect(top.mindmap).toMatchObject({ parentId: null, rootId: top.id });
    expect(leaf.mindmap).toMatchObject({ parentId: top.id, rootId: top.id });
  });
});
