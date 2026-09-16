import { AppState, SceneStore } from '../core/store';
import { DEFAULT_APP_STATE } from '../core/types';
import type { Element, ShapeElement, TextElement, ToolId } from '../core/types';
import { Camera } from '../core/camera';
import { Renderer } from '../render/renderer';
import type { Tool, ToolContext } from '../tools/types';
import { selectTool } from '../tools/select';
import { handTool } from '../tools/hand';
import { rectangleTool } from '../tools/rectangle';
import { ellipseTool } from '../tools/ellipse';
import { diamondTool } from '../tools/diamond';
import { lineTool } from '../tools/line';
import { arrowTool } from '../tools/arrow';
import { freedrawTool } from '../tools/freedraw';
import { textTool } from '../tools/text';
import { imageTool } from '../tools/image';
import { createToolbar } from '../ui/toolbar';
import { createMenu, type MenuAction } from '../ui/menu';
import { createProperties } from '../ui/properties';
import { createZoom } from '../ui/zoom';
import { createShortcuts } from '../ui/shortcuts';
import { createStats } from '../ui/stats';
import { deserialize, serialize } from '../io/file';
import { getPlatform } from '../io/platform';
import { insertImage } from '../io/images';
import { base } from '../tools/helpers';
import { createId, createNonce } from '../core/ids';
import { selectionBounds } from '../core/geometry';
const AUTOSAVE = 'ddraw.autosave.v1';
export class App {
  readonly store = new SceneStore();
  readonly appState = new AppState(DEFAULT_APP_STATE());
  readonly camera: Camera;
  readonly renderer: Renderer;
  private tools = new Map<ToolId, Tool>();
  private active: Tool;
  private context: ToolContext;
  private menu = createMenu();
  private dirty = false;
  private saveTimer = 0;
  private space = false;
  private panning = false;
  private panX = 0;
  private panY = 0;
  private fileName = 'drawing.ddraw';
  constructor(readonly root: HTMLElement) {
    root.className = 'app';
    this.camera = new Camera(this.appState.value.camera, () => {
      this.renderer?.markDirty();
      this.zoom?.refresh();
    });
    this.renderer = new Renderer(root, this.store, this.appState, this.camera);
    for (const tool of [
      selectTool(),
      handTool(),
      rectangleTool(),
      ellipseTool(),
      diamondTool(),
      arrowTool(),
      lineTool(),
      freedrawTool(),
      textTool(),
      imageTool(),
    ]) {
      this.tools.set(tool.id, tool);
    }
    this.active = this.tools.get('select')!;
    this.context = {
      store: this.store,
      appState: this.appState,
      camera: this.camera,
      renderer: this.renderer,
      host: root,
      finishTool: () => {
        if (!this.appState.value.toolLocked) this.setTool('select');
      },
    };
    this.toolbar = createToolbar('select', (id) => this.setTool(id));
    this.properties = createProperties(this.store, this.appState);
    this.zoom = createZoom(this.camera, this.store, this.appState);
    this.shortcuts = createShortcuts();
    this.stats = createStats();
    root.append(
      this.toolbar.element,
      this.menu.element,
      this.properties.element,
      this.zoom.element,
      this.stats.element,
      this.shortcuts.element,
    );
    this.renderer.setOverlay((ctx) => this.active.render?.(ctx, this.context));
    this.bindMenu();
    this.bindEvents();
    this.restore();
    this.root.style.backgroundColor = this.appState.value.viewBackgroundColor;
    this.store.on('change', (_ids, origin) => {
      this.renderer.markDirty();
      this.zoom.refresh();
      this.stats.set(this.store.getElements().length, this.appState.value.showStats);
      if (origin === 'local') {
        this.dirty = true;
        this.scheduleSave();
      }
    });
    this.appState.onChange(() => {
      this.root.style.backgroundColor = this.appState.value.viewBackgroundColor;
      this.renderer.markDirty();
      this.toolbar.setActive(this.appState.value.activeTool);
      this.properties.refresh();
      this.stats.set(this.store.getElements().length, this.appState.value.showStats);
    });
    this.renderer.markDirty();
  }
  private toolbar;
  private properties;
  private zoom;
  private shortcuts;
  private stats;
  registerMenuAction(name: MenuAction, callback: () => void): void {
    this.menu.registerAction(name, callback);
  }
  private bindMenu(): void {
    this.registerMenuAction('open', () => void this.open());
    this.registerMenuAction('save', () => void this.save(false));
    this.registerMenuAction('saveAs', () => void this.save(true));
    this.registerMenuAction('export', () =>
      alert('Image export will be available in the export phase.'),
    );
    this.registerMenuAction('clear', () => {
      if (confirm('Clear the canvas?')) {
        this.store.replaceScene([]);
        this.appState.update({ selectedIds: new Set() });
      }
    });
    this.registerMenuAction('grid', () =>
      this.appState.update({ gridEnabled: !this.appState.value.gridEnabled }),
    );
    this.registerMenuAction('share', () =>
      alert('Collaboration will be available in a later phase.'),
    );
  }
  private setTool(id: ToolId): void {
    this.active.cancel?.(this.context);
    this.active = this.tools.get(id)!;
    this.appState.update({ activeTool: id });
    this.renderer.interactiveCanvas.style.cursor = this.active.cursor;
  }
  private bindEvents(): void {
    const canvas = this.renderer.interactiveCanvas;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      if (e.button === 1 || this.space) {
        this.panning = true;
        this.panX = e.clientX;
        this.panY = e.clientY;
        return;
      }
      this.active.onPointerDown?.(e, this.context);
    });
    const move = (e: PointerEvent) => {
      if (this.panning) {
        this.camera.pan(e.clientX - this.panX, e.clientY - this.panY);
        this.panX = e.clientX;
        this.panY = e.clientY;
      } else {
        this.active.onPointerMove?.(e, this.context);
      }
    };
    if ('onpointerrawupdate' in window)
      canvas.addEventListener('pointerrawupdate', move as EventListener);
    else canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', (e) => {
      if (this.panning) this.panning = false;
      else this.active.onPointerUp?.(e, this.context);
    });
    canvas.addEventListener('dblclick', (e) => this.active.onDoubleClick?.(e, this.context));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this.renderer.screenPoint(e);
        if (e.ctrlKey) this.camera.zoomAt(Math.exp(-e.deltaY * 0.002), p.x, p.y);
        else this.camera.pan(e.shiftKey ? -e.deltaY : -e.deltaX, e.shiftKey ? 0 : -e.deltaY);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.space = false;
    });
    window.addEventListener('paste', (e) => void this.paste(e));
    this.root.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.root.classList.add('drop-active');
    });
    this.root.addEventListener('dragleave', () => this.root.classList.remove('drop-active'));
    this.root.addEventListener('drop', (e) => {
      e.preventDefault();
      this.root.classList.remove('drop-active');
      const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        const p = this.camera.screenToWorld(this.renderer.screenPoint(e));
        void insertImage(file, this.context, p);
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    this.toolbar.element
      .querySelector('.lock')!
      .addEventListener('click', () =>
        this.appState.update({ toolLocked: !this.appState.value.toolLocked }),
      );
  }
  private keyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.matches('textarea,input,select')) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (e.code === 'Space') {
      this.space = true;
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      this.active.cancel?.(this.context);
      this.setTool('select');
      return;
    }
    if (mod && key === 'z') {
      e.preventDefault();
      e.shiftKey ? this.store.redo() : this.store.undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      this.store.redo();
      return;
    }
    if (mod && key === 's') {
      e.preventDefault();
      void this.save(e.shiftKey);
      return;
    }
    if (mod && key === 'o') {
      e.preventDefault();
      void this.open();
      return;
    }
    if (mod && key === '0') {
      e.preventDefault();
      this.camera.reset();
      return;
    }
    if (mod && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      this.camera.zoomAt(1.2, innerWidth / 2, innerHeight / 2);
      return;
    }
    if (mod && e.key === '-') {
      e.preventDefault();
      this.camera.zoomAt(1 / 1.2, innerWidth / 2, innerHeight / 2);
      return;
    }
    if (e.shiftKey && e.key === '1') {
      this.zoomTo(this.store.getElements());
      return;
    }
    if (e.shiftKey && e.key === '2') {
      this.zoomTo(
        [...this.appState.value.selectedIds]
          .map((id) => this.store.get(id))
          .filter((x): x is Element => Boolean(x)),
      );
      return;
    }
    if (e.key === '?') {
      this.shortcuts.toggle();
      return;
    }
    if (key === 'q') {
      this.appState.update({ toolLocked: !this.appState.value.toolLocked });
      return;
    }
    const mapping: Record<string, ToolId | undefined> = {
      v: 'select',
      '1': 'select',
      h: 'hand',
      r: 'rectangle',
      '2': 'rectangle',
      d: 'diamond',
      '3': 'diamond',
      o: 'ellipse',
      '4': 'ellipse',
      a: 'arrow',
      '5': 'arrow',
      l: 'line',
      '6': 'line',
      p: 'freedraw',
      '7': 'freedraw',
      t: 'text',
      '8': 'text',
      i: 'image',
      '9': 'image',
    };
    const tool = mapping[key];
    if (tool && !mod) {
      this.setTool(tool);
      return;
    }
    this.active.onKeyDown?.(e, this.context);
  }
  private zoomTo(elements: Element[]): void {
    const b = selectionBounds(elements);
    if (!b) return;
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    const z = Math.min((w - 120) / (b.maxX - b.minX || 1), (h - 120) / (b.maxY - b.minY || 1), 30);
    this.camera.set(w / 2 - ((b.minX + b.maxX) / 2) * z, h / 2 - ((b.minY + b.maxY) / 2) * z, z);
  }
  private async paste(e: ClipboardEvent): Promise<void> {
    if ((e.target as HTMLElement).matches('textarea,input')) return;
    const image = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (image) {
      e.preventDefault();
      await insertImage(image, this.context);
      return;
    }
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    e.preventDefault();
    if (text.startsWith('ddraw-elements:')) {
      try {
        const incoming = JSON.parse(text.slice(15)) as Element[];
        const ids: string[] = [];
        for (const source of incoming) {
          const copy = structuredClone(source);
          copy.id = createId();
          copy.x += 20;
          copy.y += 20;
          copy.version = 1;
          copy.versionNonce = createNonce();
          this.store.add(copy);
          ids.push(copy.id);
        }
        this.appState.update({ selectedIds: new Set(ids) });
        return;
      } catch {
        /* paste as text */
      }
    }
    const p = this.camera.screenToWorld({
      x: this.root.clientWidth / 2,
      y: this.root.clientHeight / 2,
    });
    const s = this.appState.value.style;
    const el = {
      ...base('text', p.x, p.y, this.context),
      type: 'text',
      width: Math.max(100, text.length * s.fontSize * 0.55),
      height: s.fontSize * 1.25,
      text,
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
      textAlign: s.textAlign,
      verticalAlign: 'top',
      lineHeight: 1.25,
    } as TextElement;
    this.store.add(el);
  }
  private async open(): Promise<void> {
    try {
      const result = await getPlatform().openFile();
      if (!result) return;
      const scene = deserialize(result.data);
      this.store.replaceScene(scene.elements, scene.files);
      this.appState.update({
        viewBackgroundColor: scene.appState.viewBackgroundColor,
        gridEnabled: scene.appState.gridEnabled,
        selectedIds: new Set(),
      });
      this.fileName = result.name.replace(/\.excalidraw$/, '.ddraw');
      this.store.clearHistory();
      this.dirty = false;
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not open file');
    }
  }
  private async save(as: boolean): Promise<void> {
    try {
      const data = serialize(this.store.getElements(true), this.appState.value, this.store.files);
      const name = await getPlatform().saveFile(this.fileName, data, as);
      if (name) {
        this.fileName = name;
        this.dirty = false;
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save file');
    }
  }
  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      localStorage.setItem(
        AUTOSAVE,
        serialize(this.store.getElements(true), this.appState.value, this.store.files),
      );
    }, 500);
  }
  private restore(): void {
    const saved = localStorage.getItem(AUTOSAVE);
    if (!saved) return;
    try {
      const scene = deserialize(saved);
      this.store.replaceScene(scene.elements, scene.files, 'history');
      this.appState.update({
        viewBackgroundColor: scene.appState.viewBackgroundColor,
        gridEnabled: scene.appState.gridEnabled,
      });
      this.store.clearHistory();
    } catch {
      localStorage.removeItem(AUTOSAVE);
    }
  }
  stress(n = 5000): void {
    const elements: ShapeElement[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i % 100) * 130;
      const y = Math.floor(i / 100) * 100;
      elements.push({
        ...base('rectangle', x, y, this.context),
        type: 'rectangle',
        width: 100,
        height: 70,
      } as ShapeElement);
    }
    this.store.replaceScene(elements);
  }
}
