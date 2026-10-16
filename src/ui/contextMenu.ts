import type { Point } from '../core/types';
import { labelOf, type Action } from '../app/actions';
import { icon } from './icons';

/** The right-click menu: the actions that apply to what was clicked. */
export function createContextMenu(onToggle: () => void = () => {}): {
  element: HTMLElement;
  open(x: number, y: number, actions: Action[], at: Point): void;
  close(): void;
  readonly isOpen: boolean;
} {
  const element = document.createElement('div');
  element.className = 'context-menu';
  element.setAttribute('role', 'menu');
  element.hidden = true;

  const close = () => {
    if (element.hidden) return;
    element.hidden = true;
    element.replaceChildren();
    onToggle();
  };
  const item = (action: Action, at: Point, compact: boolean) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    const label = labelOf(action);
    if (action.icon) button.append(icon(action.icon, 16));
    if (compact) {
      button.title = label;
      button.setAttribute('aria-label', label);
    } else {
      const text = document.createElement('span');
      text.textContent = label;
      button.append(text);
      if (action.keys) {
        const keys = document.createElement('kbd');
        keys.textContent = action.keys;
        button.append(keys);
      }
    }
    button.onclick = () => {
      close();
      action.run(at);
    };
    return button;
  };

  const open = (x: number, y: number, actions: Action[], at: Point) => {
    close();
    let section = '';
    let row: HTMLElement | null = null;
    for (const action of actions) {
      if (action.section !== section) {
        if (section) element.append(document.createElement('hr'));
        section = action.section;
        row = null;
      }
      // Alignment buttons share one row of icons.
      if (action.section === 'Align') {
        if (!row) {
          row = document.createElement('div');
          row.className = 'context-row';
          element.append(row);
        }
        row.append(item(action, at, true));
      } else element.append(item(action, at, false));
    }
    if (!element.childElementCount) return;
    element.hidden = false;
    onToggle();
    const host = element.parentElement;
    const maxX = (host?.clientWidth ?? innerWidth) - element.offsetWidth - 8;
    const maxY = (host?.clientHeight ?? innerHeight) - element.offsetHeight - 8;
    element.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
    element.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
    element.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  };

  element.addEventListener('contextmenu', (e) => e.preventDefault());
  element.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    e.stopPropagation();
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!element.hidden && !element.contains(e.target as Node)) close();
  });
  window.addEventListener('blur', close);
  window.addEventListener('wheel', close, { passive: true });
  return {
    element,
    open,
    close,
    get isOpen() {
      return !element.hidden;
    },
  };
}
