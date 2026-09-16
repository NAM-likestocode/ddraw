export type MenuAction =
  'open' | 'save' | 'saveAs' | 'export' | 'clear' | 'grid' | 'share' | 'shortcuts';

type MenuItem = [MenuAction, string, string, string];
const items: MenuItem[] = [
  ['open', 'Open…', 'Ctrl+O', '<path d="M3 6h5l2 2h7l-2 8H4z"/>'],
  ['save', 'Save', 'Ctrl+S', '<path d="M4 3h10l3 3v11H3V3zM6 3v5h7V3M6 13h8"/>'],
  [
    'saveAs',
    'Save as…',
    'Ctrl+Shift+S',
    '<path d="M4 3h10l3 3v11H3V3zM6 3v5h7V3M12 13h5m-2-2v4"/>',
  ],
  ['export', 'Export image…', 'Ctrl+Shift+E', '<path d="M10 2v11m-4-4l4 4 4-4M3 16h14"/>'],
  ['clear', 'Clear canvas', '', '<path d="M4 6h12M8 6V4h4v2m-6 0l1 11h6l1-11"/>'],
  ['grid', 'Toggle grid', '', '<path d="M3 3h14v14H3zM3 10h14M10 3v14"/>'],
  [
    'share',
    'Share',
    '',
    '<circle cx="6" cy="10" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="15" r="2"/><path d="M8 9l5-3M8 11l5 3"/>',
  ],
  [
    'shortcuts',
    'Keyboard shortcuts',
    '?',
    '<path d="M7.5 7a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4M10 15v.1"/>',
  ],
];

export interface MenuController {
  element: HTMLElement;
  registerAction(name: MenuAction, callback: () => void): void;
}

export function createMenu(): MenuController {
  const wrap = document.createElement('div');
  wrap.className = 'menu-wrap';
  const trigger = document.createElement('button');
  trigger.className = 'menu-trigger';
  trigger.title = 'Main menu';
  trigger.setAttribute('aria-label', 'Main menu');
  trigger.innerHTML = '<span></span><span></span><span></span>';
  const panel = document.createElement('div');
  panel.className = 'menu-panel';
  panel.hidden = true;
  const actions = new Map<MenuAction, () => void>();
  for (const [name, label, shortcut, path] of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = name;
    button.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg><span>${label}</span>${shortcut ? `<kbd>${shortcut}</kbd>` : ''}`;
    if (name === 'share') button.hidden = true;
    button.onclick = () => {
      const action = actions.get(name);
      if (!action) return;
      panel.hidden = true;
      action();
    };
    panel.append(button);
  }
  const footer = document.createElement('footer');
  footer.textContent = 'Ddraw · v0.1.0';
  panel.append(footer);
  trigger.onclick = () => (panel.hidden = !panel.hidden);
  wrap.append(trigger, panel);
  document.addEventListener('pointerdown', (event) => {
    if (!wrap.contains(event.target as Node)) panel.hidden = true;
  });
  return {
    element: wrap,
    registerAction(name, callback) {
      actions.set(name, callback);
      const button = panel.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
      if (button) button.hidden = false;
    },
  };
}
