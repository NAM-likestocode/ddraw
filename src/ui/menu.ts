import { icon, type IconName } from './icons';

export type MenuAction =
  'open' | 'save' | 'saveAs' | 'export' | 'clear' | 'grid' | 'share' | 'shortcuts';

type MenuItem = [MenuAction, string, string, IconName];
const items: MenuItem[] = [
  ['open', 'Open…', 'Ctrl+O', 'open'],
  ['save', 'Save', 'Ctrl+S', 'save'],
  ['saveAs', 'Save as…', 'Ctrl+Shift+S', 'saveAs'],
  ['export', 'Export image…', 'Ctrl+Shift+E', 'export'],
  ['clear', 'Clear canvas', '', 'clear'],
  ['grid', 'Toggle grid', '', 'grid'],
  ['share', 'Share', '', 'share'],
  ['shortcuts', 'Keyboard shortcuts', '?', 'shortcuts'],
];

export interface MenuController {
  element: HTMLElement;
  registerAction(name: MenuAction, callback: () => void): void;
  run(name: MenuAction): void;
}

export function createMenu(): MenuController {
  const wrap = document.createElement('div');
  wrap.className = 'menu-wrap';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'menu-trigger';
  trigger.title = 'Main menu';
  trigger.setAttribute('aria-label', 'Main menu');
  trigger.append(icon('menu'));
  const panel = document.createElement('div');
  panel.className = 'menu-panel';
  panel.hidden = true;
  const actions = new Map<MenuAction, () => void>();
  for (const [name, label, shortcut, glyph] of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = name;
    const text = document.createElement('span');
    text.textContent = label;
    button.append(icon(glyph), text);
    if (shortcut) {
      const hint = document.createElement('kbd');
      hint.textContent = shortcut;
      button.append(hint);
    }
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
  footer.textContent = `Ddraw · v${__APP_VERSION__}`;
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
    run(name) {
      actions.get(name)?.();
    },
  };
}
