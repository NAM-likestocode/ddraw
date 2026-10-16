import type { ToolId } from '../core/types';
import { icon, type IconName } from './icons';

interface ToolDefinition {
  id: ToolId;
  key: string;
  label: string;
  icon: IconName;
}

// Each inner array is one group; a divider separates the groups.
const groups: ToolDefinition[][] = [
  [
    { id: 'hand', key: 'H', label: 'Hand', icon: 'hand' },
    { id: 'select', key: 'V', label: 'Select', icon: 'select' },
  ],
  [
    { id: 'rectangle', key: 'R', label: 'Rectangle', icon: 'rectangle' },
    { id: 'diamond', key: 'D', label: 'Diamond', icon: 'diamond' },
    { id: 'ellipse', key: 'O', label: 'Ellipse', icon: 'ellipse' },
  ],
  [
    { id: 'arrow', key: 'A', label: 'Arrow', icon: 'arrow' },
    { id: 'line', key: 'L', label: 'Line', icon: 'line' },
  ],
  [
    { id: 'freedraw', key: 'P', label: 'Pen', icon: 'freedraw' },
    { id: 'eraser', key: 'E', label: 'Eraser', icon: 'eraser' },
    { id: 'text', key: 'T', label: 'Text', icon: 'text' },
    { id: 'image', key: 'I', label: 'Image', icon: 'image' },
  ],
];

const divider = (): HTMLSpanElement => {
  const item = document.createElement('span');
  item.className = 'toolbar-divider';
  item.setAttribute('aria-hidden', 'true');
  return item;
};

export function createToolbar(
  active: ToolId,
  onTool: (id: ToolId) => void,
): {
  element: HTMLElement;
  setActive(id: ToolId): void;
  setLocked(locked: boolean): void;
} {
  const el = document.createElement('nav');
  el.className = 'toolbar';
  el.setAttribute('aria-label', 'Drawing tools');

  groups.forEach((group, index) => {
    if (index > 0) el.append(divider());
    for (const tool of group) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tool = tool.id;
      button.className = 'icon-btn';
      button.title = `${tool.label} — ${tool.key}`;
      button.setAttribute('aria-label', `${tool.label} (${tool.key})`);
      const hint = document.createElement('kbd');
      hint.textContent = tool.key;
      button.append(icon(tool.icon), hint);
      button.onclick = () => onTool(tool.id);
      el.append(button);
    }
  });

  el.append(divider());
  const lock = document.createElement('button');
  lock.type = 'button';
  lock.className = 'icon-btn lock';
  lock.title = 'Keep selected tool — Q';
  lock.setAttribute('aria-label', 'Keep selected tool');
  const lockHint = document.createElement('kbd');
  lockHint.textContent = 'Q';
  let lockIcon = icon('unlock');
  lock.append(lockIcon, lockHint);
  el.append(lock);

  const setActive = (id: ToolId) => {
    for (const button of el.querySelectorAll<HTMLButtonElement>('[data-tool]'))
      button.classList.toggle('active', button.dataset.tool === id);
  };
  let locked = false;
  const setLocked = (next: boolean) => {
    lock.classList.toggle('active', next);
    lock.setAttribute('aria-pressed', String(next));
    if (next === locked) return;
    locked = next;
    const glyph = icon(next ? 'lock' : 'unlock');
    lockIcon.replaceWith(glyph);
    lockIcon = glyph;
  };
  setActive(active);
  setLocked(false);
  return { element: el, setActive, setLocked };
}
