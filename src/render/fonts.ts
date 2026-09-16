import type { TextElement } from '../core/types';

export const FONT_FAMILIES: Record<TextElement['fontFamily'], string> = {
  hand: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
  sans: 'Inter, "Segoe UI", system-ui, sans-serif',
  mono: '"Cascadia Code", Consolas, "SF Mono", Menlo, monospace',
};

export function fontFamily(family: TextElement['fontFamily']): string {
  return FONT_FAMILIES[family];
}
