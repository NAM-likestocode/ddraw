import type { ShapeElement } from '../core/types';
import type { ToolContext } from './types';
import { fontFamily } from '../render/fonts';
import { LABEL_PADDING, LINE_HEIGHT, labelMinHeight } from '../core/text';
import { fitNode, isNode } from '../core/mindmap';
/** How an editor was left: finished, Tab for a mind-map child, or Tab to switch box/text. */
export type EditExit = 'done' | 'child' | 'switch';
export type LabelExit = EditExit;
/** An open text editor. */
export interface Editor {
  /** Saves the text and closes the editor. */
  finish(exit: EditExit): void;
}
export interface LabelEditOptions {
  /** Tab leaves the editor with the 'switch' exit (outside mind maps). */
  switchable?: boolean;
  /** Select the existing text so typing replaces it. */
  selectAll?: boolean;
  /** Called after the label is saved, with how the editor was left. */
  onDone?(exit: LabelExit): void;
}
/** Opens an editor over a shape for the text inside it. */
export function editLabel(
  shape: ShapeElement,
  ctx: ToolContext,
  options: LabelEditOptions = {},
): Editor {
  ctx.host.querySelector<HTMLTextAreaElement>('.text-editor')?.blur();
  const node = isNode(shape);
  const s = ctx.appState.value.style;
  const fontSize = shape.label?.fontSize ?? s.fontSize;
  const family = shape.label?.fontFamily ?? s.fontFamily;
  const area = document.createElement('textarea');
  area.className = 'text-editor label-editor';
  area.value = shape.label?.text ?? '';
  area.spellcheck = false;
  const ratio = shape.type === 'rectangle' ? 1 : shape.type === 'ellipse' ? Math.SQRT1_2 : 0.5;
  Object.assign(area.style, {
    fontSize: `${fontSize * ctx.camera.state.zoom}px`,
    lineHeight: String(LINE_HEIGHT),
    fontFamily: fontFamily(family),
    color: shape.strokeColor,
    textAlign: 'center',
    resize: 'none',
    minWidth: '0',
    whiteSpace: node ? 'pre' : 'pre-wrap',
    overflow: 'hidden',
  });
  const place = () => {
    const el = (ctx.store.get(shape.id) as ShapeElement | undefined) ?? shape;
    const c = ctx.camera.state;
    const z = c.zoom;
    const inner = Math.max(fontSize, Math.abs(el.width) * ratio - LABEL_PADDING * 2);
    const lines = Math.max(1, area.value.split('\n').length);
    area.style.height = '0';
    const contentHeight = Math.max(lines * fontSize * LINE_HEIGHT * z, area.scrollHeight);
    // Mind-map nodes grow to fit their text, so let the editor grow sideways too.
    const width = node ? Math.max(inner * z, area.scrollWidth + 4) : inner * z;
    const cx = (el.x + el.width / 2) * z + c.x;
    const cy = (el.y + el.height / 2) * z + c.y;
    area.style.width = `${width}px`;
    area.style.height = `${contentHeight}px`;
    area.style.left = `${cx - width / 2}px`;
    area.style.top = `${cy - contentHeight / 2}px`;
  };
  ctx.appState.update({ editingId: shape.id });
  ctx.renderer.markDirty();
  ctx.host.append(area);
  place();
  area.addEventListener('input', place);
  let exit: LabelExit = 'done';
  let closed = false;
  const commit = () => {
    if (closed) return;
    closed = true;
    area.removeEventListener('blur', commit);
    const text = node ? area.value.trim() : area.value.trimEnd();
    area.remove();
    ctx.appState.update({ editingId: null });
    const current = ctx.store.get(shape.id);
    if (current && !current.isDeleted && current.type === shape.type) {
      const previous = (current as ShapeElement).label?.text ?? '';
      ctx.store.beginHistoryGroup();
      if (text !== previous)
        ctx.store.update([shape.id], (el) => {
          if (el.type !== 'rectangle' && el.type !== 'ellipse' && el.type !== 'diamond') return;
          if (!text && !node) delete el.label;
          else el.label = { text, fontSize, fontFamily: family };
          if (!node) {
            const needed = labelMinHeight(el);
            if (needed > Math.abs(el.height)) el.height = needed * Math.sign(el.height || 1);
          }
        });
      if (node) fitNode(ctx.store, shape.id);
      ctx.store.endHistoryGroup();
    }
    ctx.renderer.markDirty();
    options.onDone?.(exit);
  };
  const finish = (how: EditExit) => {
    exit = how;
    if (document.activeElement === area) area.blur();
    else commit();
  };
  area.addEventListener('blur', commit);
  area.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!node && options.switchable && e.key === 'Tab') {
      e.preventDefault();
      finish('switch');
    } else if (node && e.key === 'Tab') {
      e.preventDefault();
      exit = 'child';
      area.blur();
    } else if (node && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      area.blur();
    } else if (e.key === 'Escape' || (e.key === 'Enter' && mod)) {
      e.preventDefault();
      area.blur();
    }
  });
  window.setTimeout(() => {
    area.focus();
    if (options.selectAll) area.select();
    else area.setSelectionRange(area.value.length, area.value.length);
  }, 0);
  return { finish };
}
