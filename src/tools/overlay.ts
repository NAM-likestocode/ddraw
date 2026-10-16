import type { Element, Point } from '../core/types';
import type { ToolContext } from './types';
export const ACCENT = '#CD7EBF';
/** Sets the context so drawing uses canvas (world) coordinates. */
export function worldTransform(c2d: CanvasRenderingContext2D, ctx: ToolContext): number {
  const { x, y, zoom } = ctx.camera.state;
  const d = devicePixelRatio;
  c2d.setTransform(zoom * d, 0, 0, zoom * d, x * d, y * d);
  return zoom;
}
/** Outlines a shape to show it will receive an arrow end or a dropped branch. */
export function highlight(c2d: CanvasRenderingContext2D, el: Element, zoom: number): void {
  const pad = 4 / zoom;
  const x = Math.min(el.x, el.x + el.width) - pad;
  const y = Math.min(el.y, el.y + el.height) - pad;
  const w = Math.abs(el.width) + pad * 2;
  const h = Math.abs(el.height) + pad * 2;
  c2d.save();
  c2d.translate(x + w / 2, y + h / 2);
  c2d.rotate(el.angle);
  c2d.beginPath();
  if (el.type === 'ellipse') c2d.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (el.type === 'diamond') {
    c2d.moveTo(0, -h / 2);
    c2d.lineTo(w / 2, 0);
    c2d.lineTo(0, h / 2);
    c2d.lineTo(-w / 2, 0);
    c2d.closePath();
  } else c2d.roundRect(-w / 2, -h / 2, w, h, 8 / zoom);
  c2d.strokeStyle = ACCENT;
  c2d.lineWidth = 3 / zoom;
  c2d.globalAlpha = 0.85;
  c2d.stroke();
  c2d.restore();
}
export function dot(c2d: CanvasRenderingContext2D, p: Point, zoom: number, filled = true): void {
  c2d.beginPath();
  c2d.arc(p.x, p.y, 5.5 / zoom, 0, Math.PI * 2);
  c2d.fillStyle = filled ? ACCENT : '#fff';
  c2d.strokeStyle = filled ? '#fff' : ACCENT;
  c2d.lineWidth = 1.5 / zoom;
  c2d.fill();
  c2d.stroke();
}
/** A round button with a plus or minus sign. */
export function signButton(
  c2d: CanvasRenderingContext2D,
  p: Point,
  zoom: number,
  sign: '+' | '-',
  color = ACCENT,
): void {
  const r = 8 / zoom;
  c2d.beginPath();
  c2d.arc(p.x, p.y, r, 0, Math.PI * 2);
  c2d.fillStyle = color;
  c2d.globalAlpha = 0.95;
  c2d.fill();
  c2d.globalAlpha = 1;
  c2d.strokeStyle = '#171B24';
  c2d.lineWidth = 2 / zoom;
  c2d.lineCap = 'round';
  c2d.beginPath();
  c2d.moveTo(p.x - r / 2, p.y);
  c2d.lineTo(p.x + r / 2, p.y);
  if (sign === '+') {
    c2d.moveTo(p.x, p.y - r / 2);
    c2d.lineTo(p.x, p.y + r / 2);
  }
  c2d.stroke();
}
