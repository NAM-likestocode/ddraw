import { describe, expect, it } from 'vitest';
import { SceneStore } from './store';
import {
  addChild,
  addSibling,
  childrenOf,
  createNode,
  descendantsOf,
  neighbour,
  removeBranches,
  reparent,
  toggleCollapsed,
  type MindmapNode,
} from './mindmap';
const style = {
  strokeColor: '#fff',
  backgroundColor: '#000',
  roughness: 0,
  fontFamily: 'sans' as const,
};
function map() {
  const s = new SceneStore();
  s.add(
    createNode(
      { rootId: 'root', parentId: null, side: 'right', order: 0, collapsed: false, color: '#fff' },
      { x: 0, y: 0 },
      'Topic',
      style,
      'root',
    ),
  );
  return s;
}
describe('mind maps', () => {
  it('spreads main branches over both sides and stacks siblings', () => {
    const s = map();
    const a = addChild(s, 'root', style)!;
    const b = addChild(s, 'root', style)!;
    const c = addSibling(s, a.id, style)!;
    const root = s.get('root')!;
    expect(a.mindmap.side).toBe('right');
    expect(b.mindmap.side).toBe('left');
    expect(s.get(a.id)!.x).toBeGreaterThan(root.x + root.width);
    expect(s.get(b.id)!.x + s.get(b.id)!.width).toBeLessThan(root.x);
    expect(childrenOf(s, 'root').map((n) => n.id)).toEqual([a.id, c.id, b.id]);
    expect(s.get(c.id)!.y).toBeGreaterThan(s.get(a.id)!.y);
    expect(a.mindmap.color).not.toBe(b.mindmap.color);
  });
  it('hides collapsed branches and removes whole branches', () => {
    const s = map();
    const a = addChild(s, 'root', style)!;
    const a1 = addChild(s, a.id, style)!;
    const a2 = addChild(s, a1.id, style)!;
    expect(descendantsOf(s, a.id)).toEqual([a1.id, a2.id]);
    toggleCollapsed(s, a.id);
    expect(s.getElements().map((e) => e.id)).toEqual(['root', a.id]);
    expect(s.getElements(true)).toHaveLength(4);
    expect(removeBranches(s, [a.id])).toBe('root');
    expect(s.getElements().map((e) => e.id)).toEqual(['root']);
    s.undo();
    expect(s.getElements(true).filter((e) => !e.isDeleted)).toHaveLength(4);
  });
  it('moves branches to a new parent but not into themselves', () => {
    const s = map();
    const a = addChild(s, 'root', style)!;
    const b = addChild(s, 'root', style)!;
    const a1 = addChild(s, a.id, style)!;
    expect(reparent(s, a.id, a1.id)).toBe(false);
    expect(reparent(s, a1.id, b.id)).toBe(true);
    const moved = s.get(a1.id) as MindmapNode;
    expect(moved.mindmap.parentId).toBe(b.id);
    expect(moved.mindmap.side).toBe('left');
    expect(moved.strokeColor).toBe(b.mindmap.color);
  });
  it('navigates with arrow keys', () => {
    const s = map();
    const a = addChild(s, 'root', style)!;
    const b = addChild(s, 'root', style)!;
    const c = addSibling(s, a.id, style)!;
    expect(neighbour(s, 'root', 'right')).toBe(a.id);
    expect(neighbour(s, 'root', 'left')).toBe(b.id);
    expect(neighbour(s, a.id, 'down')).toBe(c.id);
    expect(neighbour(s, c.id, 'left')).toBe('root');
    expect(neighbour(s, b.id, 'right')).toBe('root');
  });
});
