import { describe, expect, it } from 'vitest';
import { alignMoves, distributeMoves } from './arrange';
import { shape } from '../test/fixtures';

describe('alignMoves', () => {
  it('lines shapes up on the left edge of the selection', () => {
    const moves = alignMoves([shape('a', 0, 0), shape('b', 50, 100)], 'left');
    expect(moves.get('a')).toBeUndefined();
    expect(moves.get('b')).toEqual({ dx: -50, dy: 0 });
  });
  it('moves a group as one unit', () => {
    const moves = alignMoves(
      [
        shape('a', 0, 0),
        { ...shape('b', 40, 100), groupIds: ['g'] },
        { ...shape('c', 100, 100), groupIds: ['g'] },
      ],
      'left',
    );
    expect(moves.get('b')).toEqual({ dx: -40, dy: 0 });
    expect(moves.get('c')).toEqual({ dx: -40, dy: 0 });
  });
  it('needs at least two units', () => {
    expect(alignMoves([shape('a', 0, 0)], 'top').size).toBe(0);
  });
});

describe('distributeMoves', () => {
  it('leaves equal gaps between shapes', () => {
    // 100 wide at 0, 110 and 300: the gaps become 50 each.
    const moves = distributeMoves([shape('a', 0, 0), shape('b', 110, 0), shape('c', 300, 0)], 'x');
    expect(moves.get('a')).toBeUndefined();
    expect(moves.get('c')).toBeUndefined();
    expect(moves.get('b')!.dx).toBeCloseTo(40);
  });
});
