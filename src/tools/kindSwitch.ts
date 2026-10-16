import type { ShapeElement } from '../core/types';
import type { ToolContext } from './types';
import { convertItem, kindOf, type ItemKind } from '../core/convert';
import { elementBounds } from '../core/geometry';
import { editLabel, type EditExit, type Editor } from './labelEditor';
import { editTextAt } from './text';
import { icon } from '../ui/icons';

/** Opens the text editor for a box or a text element. */
export function editItem(
  ctx: ToolContext,
  id: string,
  options: { switchable?: boolean; onDone?(exit: EditExit): void; onEmpty?(): void } = {},
): Editor | null {
  const el = ctx.store.get(id);
  if (el?.type === 'text') return editTextAt(el.x, el.y, ctx, el, options);
  if (kindOf(el) === 'box') return editLabel(el as ShapeElement, ctx, options);
  return null;
}

const KINDS: [ItemKind, string, 'rectangle' | 'text'][] = [
  ['box', 'Box', 'rectangle'],
  ['text', 'Text', 'text'],
];

/**
 * Edits an item just added with "+". A small switch above it (or Tab) turns it
 * between a box and plain text; text left empty is removed with its arrow.
 */
export function editConnected(ctx: ToolContext, id: string, arrowId: string): void {
  const el = ctx.store.get(id);
  const kind = kindOf(el);
  if (!el || !kind) return;
  const chip = document.createElement('div');
  chip.className = 'kind-switch';
  chip.setAttribute('role', 'group');
  chip.setAttribute('aria-label', 'Box or text');
  for (const [value, label, iconName] of KINDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.kind = value;
    button.title = `${label} (Tab to switch)`;
    button.setAttribute('aria-pressed', String(value === kind));
    if (value === kind) button.classList.add('active');
    button.append(icon(iconName, 14), label);
    chip.append(button);
  }
  const hint = document.createElement('kbd');
  hint.textContent = 'Tab';
  chip.append(hint);

  let editor: Editor | null = null;
  // Keep the editor focused while the switch is clicked.
  chip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  chip.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (button && button.dataset.kind !== kind) editor?.finish('switch');
  });
  ctx.host.append(chip);
  const b = elementBounds(el);
  const top = ctx.camera.worldToScreen({ x: (b.minX + b.maxX) / 2, y: b.minY });
  chip.style.left = `${Math.max(8, top.x - chip.offsetWidth / 2)}px`;
  chip.style.top = `${Math.max(8, top.y - chip.offsetHeight - 10)}px`;

  editor = editItem(ctx, id, {
    switchable: true,
    onEmpty: () => ctx.store.remove([id, arrowId]),
    onDone: (exit) => {
      chip.remove();
      if (exit !== 'switch') return;
      convertItem(ctx.store, id, kind === 'box' ? 'text' : 'box', ctx.appState.value.style);
      ctx.appState.update({ selectedIds: new Set([id]) });
      editConnected(ctx, id, arrowId);
    },
  });
  if (!editor) chip.remove();
}
