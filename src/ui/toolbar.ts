import type { ToolId } from '../core/types';

type ToolDefinition = [ToolId, string, string];
const tools: ToolDefinition[] = [
  ['select', 'V', '<path d="M5 3l10 9-5 .8-2.7 4.7z"/>'],
  [
    'hand',
    'H',
    '<path d="M7.5 10V5.5a1.5 1.5 0 013 0V9m0-4.5a1.5 1.5 0 013 0V9m0-3.5a1.5 1.5 0 013 0V10m0-2.5a1.5 1.5 0 013 0v4c0 4-2.6 6.5-6.5 6.5H11c-2.2 0-3.5-1-4.7-2.6L3.5 12a1.5 1.5 0 012.3-1.9L7.5 12z"/>',
  ],
  ['rectangle', 'R', '<rect x="3" y="4" width="14" height="12" rx="1"/>'],
  ['diamond', 'D', '<path d="M10 2.5L18 10l-8 7.5L2 10z"/>'],
  ['ellipse', 'O', '<ellipse cx="10" cy="10" rx="8" ry="6.5"/>'],
  ['arrow', 'A', '<path d="M2.5 10h14m-5-5l5 5-5 5"/>'],
  ['line', 'L', '<path d="M3 16L17 4"/>'],
  ['freedraw', 'P', '<path d="M3 15c3-7 4 3 7-4s3 5 7-5"/>'],
  [
    'eraser',
    'E',
    '<path d="M4 14l6.8-8.5a2 2 0 013.1-.1l2.7 2.7a2 2 0 01-.1 3.1L9.7 18H5.5a2 2 0 01-1.5-4zM8 16l-3-3"/>',
  ],
  ['text', 'T', '<path d="M4 4h12M10 4v13M7 17h6"/>'],
  [
    'image',
    'I',
    '<rect x="2.5" y="3" width="15" height="14" rx="1.5"/><circle cx="7" cy="7.5" r="1.5"/><path d="M4.5 15l4-4 2.5 2 2-2 2.5 4"/>',
  ],
];

const icon = (content: string): string =>
  `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;

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

  const lock = document.createElement('button');
  lock.type = 'button';
  lock.className = 'icon-btn lock';
  lock.title = 'Keep selected tool — Q';
  lock.setAttribute('aria-label', 'Keep selected tool');
  lock.innerHTML = `${icon('<path d="M6 9V6a4 4 0 018 0v3M4 9h12v9H4z"/>')}<kbd>Q</kbd>`;
  el.append(lock);

  for (const [id, key, iconPath] of tools) {
    if (id === 'rectangle' || id === 'image') {
      const divider = document.createElement('span');
      divider.className = 'toolbar-divider';
      divider.setAttribute('aria-hidden', 'true');
      el.append(divider);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.tool = id;
    button.className = 'icon-btn';
    const label = id[0]!.toUpperCase() + id.slice(1);
    button.title = `${label} — ${key}`;
    button.setAttribute('aria-label', `${label} (${key})`);
    button.innerHTML = `${icon(iconPath)}<kbd>${key}</kbd>`;
    button.onclick = () => onTool(id);
    el.append(button);
  }
  const setActive = (id: ToolId) => {
    for (const button of el.querySelectorAll<HTMLButtonElement>('[data-tool]'))
      button.classList.toggle('active', button.dataset.tool === id);
  };
  const setLocked = (locked: boolean) => {
    lock.classList.toggle('active', locked);
    lock.setAttribute('aria-pressed', String(locked));
  };
  setActive(active);
  setLocked(false);
  return { element: el, setActive, setLocked };
}
