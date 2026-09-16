import type { CameraState, Element, FileRecord, LinearElement } from '../core/types';
import { RenderCache } from './cache';
function transform(ctx: CanvasRenderingContext2D, e: Element, c: CameraState, dpr: number): void {
  const z = c.zoom * dpr;
  const cs = Math.cos(e.angle);
  const sn = Math.sin(e.angle);
  const cx = e.x + e.width / 2;
  const cy = e.y + e.height / 2;
  ctx.setTransform(
    z * cs,
    z * sn,
    -z * sn,
    z * cs,
    c.x * dpr + cx * z - (cx * cs - cy * sn) * z,
    c.y * dpr + cy * z - (cx * sn + cy * cs) * z,
  );
}
function arrowhead(
  ctx: CanvasRenderingContext2D,
  type: LinearElement['endArrowhead'],
  tip: [number, number],
  prev: [number, number],
  width: number,
): void {
  if (!type) return;
  const a = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
  const size = 8 + width * 2;
  ctx.save();
  ctx.translate(tip[0], tip[1]);
  ctx.rotate(a);
  ctx.beginPath();
  if (type === 'dot') {
    ctx.arc(0, 0, size / 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'bar') {
    ctx.moveTo(0, -size / 2);
    ctx.lineTo(0, size / 2);
    ctx.stroke();
  } else {
    ctx.moveTo(-size, -size / 2);
    ctx.lineTo(0, 0);
    ctx.lineTo(-size, size / 2);
    ctx.stroke();
  }
  ctx.restore();
}
// TODO: route roughness > 0 and hachure fills through a seeded cached sketch path.
export function drawElement(
  ctx: CanvasRenderingContext2D,
  e: Element,
  camera: CameraState,
  dpr: number,
  cache: RenderCache,
  file: FileRecord | undefined,
  invalidate: () => void,
): void {
  transform(ctx, e, camera, dpr);
  ctx.globalAlpha = e.opacity / 100;
  ctx.lineWidth = e.strokeWidth;
  ctx.strokeStyle = e.strokeColor;
  ctx.fillStyle = e.backgroundColor === 'transparent' ? 'transparent' : e.backgroundColor;
  ctx.lineJoin = e.roundness === 'round' ? 'round' : 'miter';
  ctx.lineCap = 'round';
  ctx.setLineDash(e.strokeStyle === 'dashed' ? [10, 8] : e.strokeStyle === 'dotted' ? [2, 6] : []);
  if (e.type === 'rectangle') {
    ctx.beginPath();
    if (e.roundness === 'round')
      ctx.roundRect(
        e.x,
        e.y,
        e.width,
        e.height,
        Math.min(12, Math.abs(e.width) / 4, Math.abs(e.height) / 4),
      );
    else ctx.rect(e.x, e.y, e.width, e.height);
    if (e.fillStyle !== 'none') ctx.fill();
    ctx.stroke();
  } else if (e.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      e.x + e.width / 2,
      e.y + e.height / 2,
      Math.abs(e.width / 2),
      Math.abs(e.height / 2),
      0,
      0,
      Math.PI * 2,
    );
    if (e.fillStyle !== 'none') ctx.fill();
    ctx.stroke();
  } else if (e.type === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(e.x + e.width / 2, e.y);
    ctx.lineTo(e.x + e.width, e.y + e.height / 2);
    ctx.lineTo(e.x + e.width / 2, e.y + e.height);
    ctx.lineTo(e.x, e.y + e.height / 2);
    ctx.closePath();
    if (e.fillStyle !== 'none') ctx.fill();
    ctx.stroke();
  } else if (e.type === 'line' || e.type === 'arrow') {
    const path = cache.pathFor(e);
    ctx.stroke(path);
    const n = e.points.length;
    if (n > 1) {
      arrowhead(ctx, e.endArrowhead, e.points[n - 1]!, e.points[n - 2]!, e.strokeWidth);
      arrowhead(ctx, e.startArrowhead, e.points[0]!, e.points[1]!, e.strokeWidth);
    }
  } else if (e.type === 'freedraw') {
    ctx.fillStyle = e.strokeColor;
    ctx.fill(cache.pathFor(e));
  } else if (e.type === 'text') {
    const family =
      e.fontFamily === 'mono'
        ? 'ui-monospace, monospace'
        : e.fontFamily === 'hand'
          ? 'cursive'
          : 'Inter, system-ui, sans-serif';
    ctx.font = `${e.fontSize}px ${family}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = e.textAlign;
    ctx.fillStyle = e.strokeColor;
    const x =
      e.textAlign === 'left' ? e.x : e.textAlign === 'center' ? e.x + e.width / 2 : e.x + e.width;
    for (const [i, line] of e.text.split('\n').entries())
      ctx.fillText(line, x, e.y + i * e.fontSize * e.lineHeight);
  } else {
    const bitmap = cache.image(file, invalidate);
    if (bitmap) ctx.drawImage(bitmap, e.x, e.y, e.width, e.height);
  }
  ctx.globalAlpha = 1;
}
