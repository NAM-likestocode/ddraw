import { getStroke } from 'perfect-freehand';
import type {
  Element,
  FileRecord,
  FreeDrawElement,
  LinearElement,
  StrokeStyle,
} from '../core/types';
export class RenderCache {
  private paths = new WeakMap<Element, Path2D>();
  private images = new Map<string, ImageBitmap>();
  private loading = new Map<string, Promise<ImageBitmap | undefined>>();
  private metrics = new Map<string, TextMetrics>();
  private lineDashes = new WeakMap<CanvasRenderingContext2D, StrokeStyle>();
  setLineDash(ctx: CanvasRenderingContext2D, style: StrokeStyle): void {
    if (this.lineDashes.get(ctx) === style) return;
    if (style !== 'solid' || this.lineDashes.has(ctx))
      ctx.setLineDash(style === 'dashed' ? [10, 8] : style === 'dotted' ? [2, 6] : []);
    this.lineDashes.set(ctx, style);
  }
  resetContext(ctx: CanvasRenderingContext2D): void {
    this.lineDashes.delete(ctx);
  }
  pathFor(el: LinearElement | FreeDrawElement): Path2D {
    const old = this.paths.get(el);
    if (old) return old;
    const path = new Path2D();
    if (el.type === 'freedraw') {
      const outline = getStroke(
        el.points.map((p) => [p[0], p[1], p[2] ?? 0.5]),
        {
          size: el.strokeWidth * 2.2,
          simulatePressure: el.simulatePressure,
          smoothing: 0.5,
          streamline: 0.5,
        },
      );
      const first = outline[0];
      if (first) {
        path.moveTo(first[0], first[1]);
        for (let i = 1; i < outline.length; i++) {
          const p = outline[i]!;
          path.lineTo(p[0], p[1]);
        }
        path.closePath();
      }
    } else {
      const p = el.points[0];
      if (p) {
        path.moveTo(p[0], p[1]);
        for (let i = 1; i < el.points.length; i++) {
          const q = el.points[i]!;
          path.lineTo(q[0], q[1]);
        }
      }
    }
    this.paths.set(el, path);
    return path;
  }
  image(file: FileRecord | undefined, onReady: () => void): ImageBitmap | undefined {
    if (!file) return;
    const cached = this.images.get(file.id);
    if (cached) return cached;
    void this.loadImage(file).then((bitmap) => {
      if (bitmap) onReady();
    });
    return;
  }
  async preload(files: readonly FileRecord[]): Promise<void> {
    await Promise.all(files.map((file) => this.loadImage(file)));
  }
  private loadImage(file: FileRecord): Promise<ImageBitmap | undefined> {
    const cached = this.images.get(file.id);
    if (cached) return Promise.resolve(cached);
    const pending = this.loading.get(file.id);
    if (pending) return pending;
    const promise = fetch(file.dataURL)
      .then((response) => response.blob())
      .then(createImageBitmap)
      .then((bitmap) => {
        this.images.set(file.id, bitmap);
        return bitmap;
      })
      .catch(() => undefined)
      .finally(() => this.loading.delete(file.id));
    this.loading.set(file.id, promise);
    return promise;
  }
  measure(ctx: CanvasRenderingContext2D, font: string, text: string): TextMetrics {
    const key = font + '\0' + text;
    const found = this.metrics.get(key);
    if (found) {
      this.metrics.delete(key);
      this.metrics.set(key, found);
      return found;
    }
    ctx.font = font;
    const value = ctx.measureText(text);
    this.metrics.set(key, value);
    if (this.metrics.size > 500) {
      const first = this.metrics.keys().next().value;
      if (first !== undefined) this.metrics.delete(first);
    }
    return value;
  }
  clearImages(): void {
    for (const bitmap of this.images.values()) bitmap.close();
    this.images.clear();
  }
}
