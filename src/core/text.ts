import type { FontFamily, ShapeElement } from './types';
import { fontFamily } from '../render/fonts';
export const LINE_HEIGHT = 1.25;
/** Space between a shape's outline and its label. */
export const LABEL_PADDING = 10;
let measureCtx: CanvasRenderingContext2D | null | undefined;
export function fontString(fontSize: number, family: FontFamily): string {
  return `${fontSize}px ${fontFamily(family)}`;
}
/** Width of one line of text. Falls back to an estimate where there is no canvas (tests). */
export function measureLine(text: string, fontSize: number, family: FontFamily): number {
  if (measureCtx === undefined)
    measureCtx =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * fontSize * 0.6;
  measureCtx.font = fontString(fontSize, family);
  return measureCtx.measureText(text).width;
}
/** Breaks text into lines no wider than `maxWidth`, keeping the author's own line breaks. */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  family: FontFamily,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      const next = line + word;
      if (line && /\S/.test(word) && measureLine(next, fontSize, family) > maxWidth) {
        lines.push(line.trimEnd());
        line = word;
      } else line = next;
      // Break words that are longer than a whole line.
      while (line.length > 1 && measureLine(line, fontSize, family) > maxWidth) {
        let cut = line.length - 1;
        while (cut > 1 && measureLine(line.slice(0, cut), fontSize, family) > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
/** Size of text laid out without wrapping. */
export function measureText(
  text: string,
  fontSize: number,
  family: FontFamily,
): { width: number; height: number } {
  const lines = text.split('\n');
  return {
    width: Math.max(...lines.map((line) => measureLine(line, fontSize, family))),
    height: lines.length * fontSize * LINE_HEIGHT,
  };
}
/** How much of a shape's width can hold text (less for round and pointed shapes). */
function usableRatio(type: ShapeElement['type']): number {
  return type === 'rectangle' ? 1 : type === 'ellipse' ? Math.SQRT1_2 : 0.5;
}
/** The lines of a shape's label, wrapped to fit inside the shape. */
export function labelLines(shape: ShapeElement): string[] {
  const label = shape.label;
  if (!label?.text) return [];
  const width = Math.max(
    label.fontSize,
    Math.abs(shape.width) * usableRatio(shape.type) - LABEL_PADDING * 2,
  );
  return wrapText(label.text, width, label.fontSize, label.fontFamily);
}
/** The smallest height that fits the shape's label at its current width. */
export function labelMinHeight(shape: ShapeElement): number {
  const label = shape.label;
  if (!label?.text) return 0;
  const textHeight = labelLines(shape).length * label.fontSize * LINE_HEIGHT;
  return textHeight / usableRatio(shape.type) + LABEL_PADDING * 2;
}
