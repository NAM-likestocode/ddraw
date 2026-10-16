import type { TextElement } from '../core/types';
import type { Tool, ToolContext } from './types';
import { base, world } from './helpers';
import { fontFamily } from '../render/fonts';
import { textSize } from '../core/text';
import type { EditExit, Editor } from './labelEditor';
export interface TextEditOptions {
  /** Tab leaves the editor with the 'switch' exit instead of moving focus. */
  switchable?: boolean;
  /** Called after the text is saved, with how the editor was left. */
  onDone?(exit: EditExit): void;
  /** Called instead of deleting an existing text element that was left empty. */
  onEmpty?(): void;
}
export function editTextAt(
  x: number,
  y: number,
  ctx: ToolContext,
  existing?: TextElement,
  options: TextEditOptions = {},
): Editor {
  ctx.host.querySelector<HTMLTextAreaElement>('.text-editor')?.blur();
  const s = ctx.appState.value.style;
  const c = ctx.camera.state;
  const area = document.createElement('textarea');
  area.className = 'text-editor';
  area.wrap = 'off';
  area.value = existing?.text ?? '';
  area.style.left = `${x * c.zoom + c.x}px`;
  area.style.top = `${y * c.zoom + c.y}px`;
  const fontSize = existing?.fontSize ?? s.fontSize;
  const family = existing?.fontFamily ?? s.fontFamily;
  const lineHeight = existing?.lineHeight ?? 1.25;
  area.style.fontSize = `${fontSize * c.zoom}px`;
  area.style.lineHeight = String(lineHeight);
  area.style.color = existing?.strokeColor ?? s.strokeColor;
  area.style.textAlign = existing?.textAlign ?? s.textAlign;
  area.style.fontFamily = fontFamily(family);
  const resize = () => {
    const size = textSize(area.value, fontSize, family);
    area.style.width = `${(size.width + fontSize) * c.zoom}px`;
    area.style.height = `${size.height * c.zoom}px`;
  };
  resize();
  area.addEventListener('input', resize);
  if (existing) {
    ctx.appState.update({ editingId: existing.id });
    ctx.renderer.markDirty();
  }
  ctx.host.append(area);
  let exit: EditExit = 'done';
  let closed = false;
  const commit = () => {
    if (closed) return;
    closed = true;
    area.removeEventListener('blur', commit);
    const text = area.value.trimEnd();
    area.remove();
    if (existing) {
      ctx.appState.update({ editingId: null });
      const current = ctx.store.get(existing.id);
      if (!current || current.isDeleted || current.type !== 'text') {
        // Changed or removed by someone else while the editor was open.
      } else if (!text && exit !== 'switch') {
        if (options.onEmpty) options.onEmpty();
        else ctx.store.remove([existing.id]);
      } else if (text !== current.text) {
        const size = textSize(text, current.fontSize, current.fontFamily);
        ctx.store.update([existing.id], (el) => {
          if (el.type !== 'text') return;
          el.text = text;
          el.width = size.width;
          el.height = size.height;
        });
      }
      ctx.renderer.markDirty();
    } else if (text) {
      const size = textSize(text, s.fontSize, s.fontFamily);
      const el = {
        ...base('text', x, y, ctx),
        type: 'text',
        width: size.width,
        height: size.height,
        text,
        fontSize: s.fontSize,
        fontFamily: s.fontFamily,
        textAlign: s.textAlign,
        verticalAlign: 'top',
        lineHeight: 1.25,
      } as TextElement;
      ctx.store.add(el);
      ctx.appState.update({ selectedIds: new Set([el.id]) });
    }
    ctx.finishTool();
    options.onDone?.(exit);
  };
  const finish = (how: EditExit) => {
    exit = how;
    if (document.activeElement === area) area.blur();
    else commit();
  };
  area.addEventListener('blur', commit);
  area.addEventListener('keydown', (e) => {
    if (options.switchable && e.key === 'Tab') {
      e.preventDefault();
      finish('switch');
    } else if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      finish('done');
    }
  });
  window.setTimeout(() => area.focus(), 0);
  return { finish };
}
export const textTool = (): Tool => ({
  id: 'text',
  cursor: 'text',
  onPointerDown(e, ctx) {
    const p = world(e, ctx);
    editTextAt(p.x, p.y, ctx);
  },
});
