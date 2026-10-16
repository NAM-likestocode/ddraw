import type { ShapeElement } from '../core/types';
import { LINE_HEIGHT, fontString, labelLines } from '../core/text';

/** Draws the text written inside a shape, wrapped and centred. */
export function drawLabel(ctx: CanvasRenderingContext2D, shape: ShapeElement): void {
  const label = shape.label;
  if (!label?.text) return;
  const lines = labelLines(shape);
  const lineHeight = label.fontSize * LINE_HEIGHT;
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(shape.angle);
  ctx.globalAlpha = shape.opacity / 100;
  ctx.font = fontString(label.fontSize, label.fontFamily);
  ctx.fillStyle = shape.strokeColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = -((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, 0, top + i * lineHeight));
  ctx.restore();
}
