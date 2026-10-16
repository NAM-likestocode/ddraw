import type { AppState } from '../core/store';
import type { SceneStore } from '../core/store';
import type { Element } from '../core/types';
import type { Camera } from '../core/camera';
import { boundsIntersect, elementBounds, selectionBounds } from '../core/geometry';
import { RenderCache } from './cache';
import { drawElement } from './shapes';
import { drawLabel } from './label';
import { drawMindmaps } from './mindmap';
export type DirtyLayer = 'static' | 'interactive' | 'both';
export class Renderer {
  readonly staticCanvas = document.createElement('canvas');
  readonly interactiveCanvas = document.createElement('canvas');
  private staticCtx = this.staticCanvas.getContext('2d', { alpha: true })!;
  private interactiveCtx = this.interactiveCanvas.getContext('2d', { alpha: true })!;
  private cache = new RenderCache();
  private frame = 0;
  private staticDirty = true;
  private interactiveDirty = true;
  private resizeObserver: ResizeObserver;
  private overlay: ((ctx: CanvasRenderingContext2D) => void) | null = null;
  private overlays = new Set<(ctx: CanvasRenderingContext2D) => void>();
  private dpr = 1;
  private width = 0;
  private height = 0;
  constructor(
    readonly root: HTMLElement,
    private store: SceneStore,
    private appState: AppState,
    private camera: Camera,
  ) {
    for (const [canvas, name] of [
      [this.staticCanvas, 'static'],
      [this.interactiveCanvas, 'interactive'],
    ] as const) {
      canvas.className = `canvas canvas-${name}`;
      root.append(canvas);
    }
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    this.resize();
  }
  setOverlay(fn: ((ctx: CanvasRenderingContext2D) => void) | null): void {
    this.overlay = fn;
    this.markDirty('interactive');
  }
  addOverlay(fn: (ctx: CanvasRenderingContext2D) => void): void {
    this.overlays.add(fn);
    this.markDirty('interactive');
  }
  removeOverlay(fn: (ctx: CanvasRenderingContext2D) => void): void {
    this.overlays.delete(fn);
    this.markDirty('interactive');
  }
  markDirty(layer: DirtyLayer = 'both'): void {
    if (layer === 'static' || layer === 'both') this.staticDirty = true;
    if (layer === 'interactive' || layer === 'both') this.interactiveDirty = true;
    if (!this.frame) this.frame = requestAnimationFrame(() => this.render());
  }
  private resize(): void {
    const rect = this.root.getBoundingClientRect();
    if (this.width && this.height && (rect.width !== this.width || rect.height !== this.height))
      this.camera.pan((rect.width - this.width) / 2, (rect.height - this.height) / 2);
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.max(1, devicePixelRatio || 1);
    for (const canvas of [this.staticCanvas, this.interactiveCanvas]) {
      const w = Math.max(1, Math.round(rect.width * this.dpr));
      const h = Math.max(1, Math.round(rect.height * this.dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        this.cache.resetContext(
          canvas === this.staticCanvas ? this.staticCtx : this.interactiveCtx,
        );
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
      }
    }
    this.markDirty();
  }
  private render(): void {
    this.frame = 0;
    if (this.staticDirty) this.drawStatic();
    if (this.interactiveDirty) this.drawInteractive();
    this.staticDirty = this.interactiveDirty = false;
  }
  private viewport() {
    const c = this.camera.state;
    const z = c.zoom;
    const w = this.staticCanvas.width / this.dpr;
    const h = this.staticCanvas.height / this.dpr;
    return { minX: -c.x / z, minY: -c.y / z, maxX: (w - c.x) / z, maxY: (h - c.y) / z };
  }
  private clear(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  private drawGrid(ctx: CanvasRenderingContext2D): void {
    if (!this.appState.value.gridEnabled) return;
    const { zoom, x, y } = this.camera.state;
    const d = this.dpr;
    const spacing = 20 * zoom * d;
    if (spacing < 8) return;
    ctx.fillStyle = '#81899755';
    const ox = (((x * d) % spacing) + spacing) % spacing;
    const oy = (((y * d) % spacing) + spacing) % spacing;
    for (let px = ox; px < ctx.canvas.width; px += spacing)
      for (let py = oy; py < ctx.canvas.height; py += spacing)
        ctx.fillRect(Math.round(px), Math.round(py), 1.5 * d, 1.5 * d);
  }
  private drawStatic(): void {
    const ctx = this.staticCtx;
    this.clear(ctx);
    this.drawGrid(ctx);
    const viewport = this.viewport();
    const selected = this.appState.value.selectedIds;
    const drawingId = this.appState.value.drawingId;
    const visible = this.store.getElements();
    this.worldTransform(ctx);
    drawMindmaps(ctx, visible, this.store);
    this.cache.resetContext(ctx);
    for (const e of visible) {
      if (selected.has(e.id) || e.id === drawingId || !boundsIntersect(elementBounds(e), viewport))
        continue;
      drawElement(
        ctx,
        e,
        this.camera.state,
        this.dpr,
        this.cache,
        this.store.files[e.type === 'image' ? e.fileId : ''],
        () => this.markDirty('static'),
      );
      this.drawText(ctx, e);
    }
  }
  private worldTransform(ctx: CanvasRenderingContext2D): void {
    const c = this.camera.state;
    const d = this.dpr;
    ctx.setTransform(c.zoom * d, 0, 0, c.zoom * d, c.x * d, c.y * d);
  }
  /** Draws the text inside a shape, unless it is open in the editor. */
  private drawText(ctx: CanvasRenderingContext2D, e: Element): void {
    if (e.type !== 'rectangle' && e.type !== 'ellipse' && e.type !== 'diamond') return;
    if (!e.label?.text || e.id === this.appState.value.editingId) return;
    this.worldTransform(ctx);
    drawLabel(ctx, e);
    this.cache.resetContext(ctx);
  }
  private drawInteractive(): void {
    const ctx = this.interactiveCtx;
    this.clear(ctx);
    const viewport = this.viewport();
    const drawingId = this.appState.value.drawingId;
    const draw = (e: Element) => {
      drawElement(
        ctx,
        e,
        this.camera.state,
        this.dpr,
        this.cache,
        this.store.files[e.type === 'image' ? e.fileId : ''],
        () => this.markDirty('interactive'),
      );
      this.drawText(ctx, e);
    };
    const selectedEls = [];
    for (const id of this.appState.value.selectedIds) {
      if (id === drawingId) continue;
      const e = this.store.get(id);
      if (e && !e.isDeleted && boundsIntersect(elementBounds(e), viewport)) {
        selectedEls.push(e);
        draw(e);
      }
    }
    if (drawingId) {
      const e = this.store.get(drawingId);
      if (e && !e.isDeleted && boundsIntersect(elementBounds(e), viewport)) draw(e);
    }
    const b = selectionBounds(selectedEls);
    if (b) {
      const c = this.camera.state;
      const d = this.dpr;
      ctx.setTransform(c.zoom * d, 0, 0, c.zoom * d, c.x * d, c.y * d);
      ctx.strokeStyle = '#CD7EBF';
      ctx.lineWidth = 1 / c.zoom;
      ctx.setLineDash([5 / c.zoom, 3 / c.zoom]);
      ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
      ctx.setLineDash([]);
      this.cache.resetContext(ctx);
      ctx.fillStyle = '#fff';
      const mx = (b.minX + b.maxX) / 2;
      const my = (b.minY + b.maxY) / 2;
      const handles: [number, number][] = [
        [b.minX, b.minY],
        [mx, b.minY],
        [b.maxX, b.minY],
        [b.maxX, my],
        [b.maxX, b.maxY],
        [mx, b.maxY],
        [b.minX, b.maxY],
        [b.minX, my],
      ];
      for (const handle of handles) {
        ctx.beginPath();
        ctx.arc(handle[0], handle[1], 5 / c.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo((b.minX + b.maxX) / 2, b.minY);
      ctx.lineTo((b.minX + b.maxX) / 2, b.minY - 24 / c.zoom);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc((b.minX + b.maxX) / 2, b.minY - 24 / c.zoom, 5 / c.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (this.overlay) this.overlay(ctx);
    for (const overlay of this.overlays) overlay(ctx);
  }
  screenPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.interactiveCanvas.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }
  destroy(): void {
    this.resizeObserver.disconnect();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.cache.clearImages();
    this.staticCanvas.remove();
    this.interactiveCanvas.remove();
  }
}
