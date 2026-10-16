import type { SceneStore } from './store';
import type { Element, ShapeElement, StyleDefaults, TextElement } from './types';
import { centerOf } from './bindings';
import { isNode } from './mindmap';
import { LABEL_PADDING, labelMinHeight, measureText, textSize } from './text';

/** A box is a rectangle, ellipse or diamond; text is a plain text element. */
export type ItemKind = 'box' | 'text';

export function kindOf(el: Element | undefined | null): ItemKind | null {
  if (!el || el.isDeleted || isNode(el)) return null;
  if (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond') return 'box';
  return el.type === 'text' ? 'text' : null;
}

/**
 * Turns a box into text or text into a box. The element keeps its id, centre
 * and colours, so arrows stay attached and it stays where it was.
 */
export function convertItem(
  store: SceneStore,
  id: string,
  to: ItemKind,
  style: StyleDefaults,
): void {
  const el = store.get(id);
  const from = kindOf(el);
  if (!el || !from || from === to) return;
  const c = centerOf(el);
  store.update([id], (draft) => {
    if (draft.type === 'text') {
      const { text, fontSize, fontFamily, textAlign, verticalAlign, lineHeight, ...rest } = draft;
      const measured = measureText(text || ' ', fontSize, fontFamily);
      const box: ShapeElement = {
        ...rest,
        type: 'rectangle',
        width: Math.max(120, measured.width + LABEL_PADDING * 2 + 16),
        height: 60,
      };
      if (text) box.label = { text, fontSize, fontFamily };
      box.height = Math.max(box.height, labelMinHeight(box));
      box.x = c.x - box.width / 2;
      box.y = c.y - box.height / 2;
      return box;
    }
    if (draft.type !== 'rectangle' && draft.type !== 'ellipse' && draft.type !== 'diamond') return;
    const { label, mindmap, ...rest } = draft;
    const text = label?.text ?? '';
    const fontSize = label?.fontSize ?? style.fontSize;
    const fontFamily = label?.fontFamily ?? style.fontFamily;
    const size = textSize(text, fontSize, fontFamily);
    const result: TextElement = {
      ...rest,
      type: 'text',
      x: c.x - size.width / 2,
      y: c.y - size.height / 2,
      width: size.width,
      height: size.height,
      angle: 0,
      text,
      fontSize,
      fontFamily,
      textAlign: 'left',
      verticalAlign: 'top',
      lineHeight: 1.25,
    };
    return result;
  });
}
