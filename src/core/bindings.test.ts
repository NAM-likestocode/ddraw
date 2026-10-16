import { describe, expect, it } from 'vitest';
import { SceneStore } from './store';
import { BIND_GAP, outlinePoint, syncBindings } from './bindings';
import type { LinearElement } from './types';
import { arrow, shape } from '../test/fixtures';
function store() {
  const s = new SceneStore();
  s.setDeriver((ids) => syncBindings(s, ids));
  return s;
}
const ends = (a: LinearElement) => [
  [a.x + a.points[0]![0], a.y + a.points[0]![1]],
  [a.x + a.points.at(-1)![0], a.y + a.points.at(-1)![1]],
];
describe('attached arrows', () => {
  it('finds where a line from the centre leaves each outline', () => {
    const rect = shape('r', 0, 0, 100, 60);
    expect(outlinePoint(rect, { x: 500, y: 30 }, 0)).toEqual({ x: 100, y: 30 });
    const e = outlinePoint({ ...rect, type: 'ellipse' }, { x: 50, y: -500 }, 0);
    expect(e.x).toBeCloseTo(50);
    expect(e.y).toBeCloseTo(0);
    const d = outlinePoint({ ...rect, type: 'diamond' }, { x: 100, y: 60 }, 0);
    expect(d.x).toBeCloseTo(75);
    expect(d.y).toBeCloseTo(45);
  });
  it('snaps both ends to the shapes and follows a moved shape in one undo step', () => {
    const s = store();
    s.add(shape('a', 0, 0));
    s.add(shape('b', 300, 0));
    s.add(arrow('x', 'a', 'b'));
    expect(ends(s.get('x') as LinearElement)).toEqual([
      [100 + BIND_GAP, 30],
      [300 - BIND_GAP, 30],
    ]);
    s.update(['b'], (el) => {
      el.y = 200;
    });
    expect(ends(s.get('x') as LinearElement)[1]![1]).toBeGreaterThan(150);
    s.undo();
    expect(s.get('b')!.y).toBe(0);
    expect(ends(s.get('x') as LinearElement)[1]).toEqual([300 - BIND_GAP, 30]);
  });
  it('lets go of a shape that is deleted', () => {
    const s = store();
    s.add(shape('a', 0, 0));
    s.add(arrow('x', 'a', null));
    s.remove(['a']);
    expect((s.get('x') as LinearElement).startBinding).toBeNull();
  });
});
