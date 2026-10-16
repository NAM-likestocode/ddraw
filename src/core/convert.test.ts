import { describe, expect, it } from 'vitest';
import { convertItem, kindOf } from './convert';
import { SceneStore } from './store';
import {
  DEFAULT_STYLE,
  type Element,
  type ShapeElement,
  type StyleDefaults,
  type TextElement,
} from './types';
import { arrow, shape } from '../test/fixtures';

const style: StyleDefaults = { ...DEFAULT_STYLE, fontSize: 24, fontFamily: 'mono' };

function textItem(id: string, x: number, y: number, text: string): TextElement {
  return {
    ...shape(id, x, y, 60, 24),
    type: 'text',
    text,
    fontSize: 20,
    fontFamily: 'sans',
    textAlign: 'left',
    verticalAlign: 'top',
    lineHeight: 1.25,
  };
}

function mindmapNode(id: string): ShapeElement {
  return {
    ...shape(id, 0, 0, 140, 60),
    label: { text: 'Plan', fontSize: 20, fontFamily: 'sans' },
    mindmap: {
      rootId: id,
      parentId: null,
      side: 'right',
      order: 0,
      collapsed: false,
      color: '#88C0D0',
    },
  };
}

function storeWith(...elements: Element[]): SceneStore {
  const store = new SceneStore();
  for (const element of elements) store.add(element);
  return store;
}

function midpoint(el: Element): { x: number; y: number } {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

describe('kindOf', () => {
  it('counts rectangles, ellipses and diamonds as boxes', () => {
    expect(kindOf(shape('r', 0, 0))).toBe('box');
    expect(kindOf({ ...shape('e', 0, 0), type: 'ellipse' })).toBe('box');
    expect(kindOf({ ...shape('d', 0, 0), type: 'diamond' })).toBe('box');
  });

  it('counts text as text and lines or arrows as neither', () => {
    expect(kindOf(textItem('t', 0, 0, 'Hi'))).toBe('text');
    expect(kindOf(arrow('a', null, null))).toBeNull();
    expect(kindOf({ ...arrow('l', null, null), type: 'line' })).toBeNull();
  });

  it('ignores mind-map nodes, deleted elements and missing elements', () => {
    expect(kindOf(mindmapNode('n'))).toBeNull();
    expect(kindOf({ ...shape('x', 0, 0), isDeleted: true })).toBeNull();
    expect(kindOf(undefined)).toBeNull();
    expect(kindOf(null)).toBeNull();
  });
});

describe('convertItem', () => {
  it('turns a box into text with its label, keeping id and centre', () => {
    const store = storeWith({
      ...shape('box', 100, 200, 160, 80),
      label: { text: 'Idea', fontSize: 28, fontFamily: 'hand' },
    });
    const before = midpoint(store.get('box')!);

    convertItem(store, 'box', 'text', style);

    const el = store.get('box') as TextElement;
    expect(el.id).toBe('box');
    expect(el.type).toBe('text');
    expect(el.text).toBe('Idea');
    expect(el.fontSize).toBe(28);
    expect(el.fontFamily).toBe('hand');
    expect(el).not.toHaveProperty('label');
    expect(midpoint(el).x).toBeCloseTo(before.x);
    expect(midpoint(el).y).toBeCloseTo(before.y);
  });

  it('gives an unlabelled box empty text in the style font', () => {
    const store = storeWith(shape('box', 0, 0, 160, 80));

    convertItem(store, 'box', 'text', style);

    const el = store.get('box') as TextElement;
    expect(el.type).toBe('text');
    expect(el.text).toBe('');
    expect(el.fontSize).toBe(24);
    expect(el.fontFamily).toBe('mono');
  });

  it('turns text into a box of at least 120 by 60 that keeps its text as the label', () => {
    const store = storeWith(textItem('t', 50, 50, 'Hello'));
    const before = midpoint(store.get('t')!);

    convertItem(store, 't', 'box', style);

    const el = store.get('t') as ShapeElement;
    expect(el.id).toBe('t');
    expect(el.type).toBe('rectangle');
    expect(el.width).toBeGreaterThanOrEqual(120);
    expect(el.height).toBeGreaterThanOrEqual(60);
    expect(el.label).toEqual({ text: 'Hello', fontSize: 20, fontFamily: 'sans' });
    for (const key of [
      'text',
      'fontSize',
      'fontFamily',
      'textAlign',
      'verticalAlign',
      'lineHeight',
    ]) {
      expect(el).not.toHaveProperty(key);
    }
    expect(midpoint(el).x).toBeCloseTo(before.x);
    expect(midpoint(el).y).toBeCloseTo(before.y);
  });

  it('turns empty text into a box with no label', () => {
    const store = storeWith(textItem('t', 0, 0, ''));

    convertItem(store, 't', 'box', style);

    const el = store.get('t') as ShapeElement;
    expect(el.type).toBe('rectangle');
    expect(el).not.toHaveProperty('label');
    expect(el.width).toBeGreaterThanOrEqual(120);
    expect(el.height).toBeGreaterThanOrEqual(60);
  });

  it('keeps id and centre through box, text and back to box', () => {
    const store = storeWith({
      ...shape('box', 300, 120, 200, 90),
      label: { text: 'Round trip', fontSize: 20, fontFamily: 'sans' },
    });
    const before = midpoint(store.get('box')!);

    convertItem(store, 'box', 'text', style);
    convertItem(store, 'box', 'box', style);

    const el = store.get('box') as ShapeElement;
    expect(el.type).toBe('rectangle');
    expect(el.label?.text).toBe('Round trip');
    expect(midpoint(el).x).toBeCloseTo(before.x);
    expect(midpoint(el).y).toBeCloseTo(before.y);
  });

  it('leaves mind-map nodes, lines and items already of that kind alone', () => {
    const node = mindmapNode('n');
    const box = shape('box', 0, 0);
    const store = storeWith(node, box, arrow('a', null, null));

    convertItem(store, 'n', 'text', style);
    convertItem(store, 'a', 'text', style);
    convertItem(store, 'box', 'box', style);
    convertItem(store, 'missing', 'text', style);

    expect(store.get('n')).toBe(node);
    expect(store.get('a')?.type).toBe('arrow');
    expect(store.get('box')).toBe(box);
    expect(store.get('missing')).toBeUndefined();
  });
});
