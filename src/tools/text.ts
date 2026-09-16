import type { TextElement } from '../core/types';
import type { Tool, ToolContext } from './types';
import { base, world } from './helpers';
import { fontFamily } from '../render/fonts';
export function editTextAt(x: number, y: number, ctx: ToolContext, existing?: TextElement): void {
  const s = ctx.appState.value.style;
  const c = ctx.camera.state;
  const area = document.createElement('textarea');
  area.className = 'text-editor';
  area.wrap = 'off';
  area.value = existing?.text ?? '';
  area.style.left = `${x * c.zoom + c.x}px`;
  area.style.top = `${y * c.zoom + c.y}px`;
  const fontSize = existing?.fontSize ?? s.fontSize;
  const lineHeight = existing?.lineHeight ?? 1.25;
  area.style.fontSize = `${fontSize * c.zoom}px`;
  area.style.lineHeight = String(lineHeight);
  area.style.color = existing?.strokeColor ?? s.strokeColor;
  area.style.textAlign = existing?.textAlign ?? s.textAlign;
  area.style.fontFamily = fontFamily(existing?.fontFamily ?? s.fontFamily);
  const resize = () => {
    if (existing) return;
    const lines = area.value.split('\n');
    area.style.width = `${Math.max(40, lines.reduce((maximum, line) => Math.max(maximum, line.length), 0) * fontSize * 0.6) * c.zoom}px`;
    area.style.height = `${Math.max(fontSize * lineHeight, lines.length * fontSize * lineHeight) * c.zoom}px`;
  };
  if (existing) {
    area.style.width = `${Math.max(40, existing.width) * c.zoom}px`;
    area.style.height = `${Math.max(existing.fontSize * existing.lineHeight, existing.height) * c.zoom}px`;
  } else resize();
  area.addEventListener('input', resize);
  ctx.host.append(area);
  const commit = () => {
    area.removeEventListener('blur', commit);
    const text = area.value.trimEnd();
    area.remove();
    if (existing) {
      ctx.store.update([existing.id], (el) => {
        if (el.type === 'text') {
          el.text = text;
          el.height = Math.max(
            el.fontSize * el.lineHeight,
            text.split('\n').length * el.fontSize * el.lineHeight,
          );
        }
      });
    } else if (text) {
      const fontSize = s.fontSize;
      const el = {
        ...base('text', x, y, ctx),
        type: 'text',
        width: Math.max(
          40,
          text.split('\n').reduce((m, l) => Math.max(m, l.length), 0) * fontSize * 0.6,
        ),
        height: text.split('\n').length * fontSize * 1.25,
        text,
        fontSize,
        fontFamily: s.fontFamily,
        textAlign: s.textAlign,
        verticalAlign: 'top',
        lineHeight: 1.25,
      } as TextElement;
      ctx.store.add(el);
      ctx.appState.update({ selectedIds: new Set([el.id]) });
    }
    ctx.finishTool();
  };
  area.addEventListener('blur', commit);
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      commit();
    }
  });
  window.setTimeout(() => area.focus(), 0);
}
export const textTool = (): Tool => ({
  id: 'text',
  cursor: 'text',
  onPointerDown(e, ctx) {
    const p = world(e, ctx);
    editTextAt(p.x, p.y, ctx);
  },
});
