import { labelOf, type Action } from '../app/actions';
import { icon } from './icons';

/** Ctrl+K: search every command by name and run it from the keyboard. */
export function createPalette(actions: () => Action[]): {
  element: HTMLElement;
  open(): void;
  close(): void;
  readonly isOpen: boolean;
} {
  const element = document.createElement('div');
  element.className = 'palette-backdrop';
  element.hidden = true;
  element.innerHTML = `<div class="palette" role="dialog" aria-label="Commands"><label class="palette-search"></label><div class="palette-list" role="listbox"></div></div>`;
  const search = element.querySelector<HTMLElement>('.palette-search')!;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search commands…';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Search commands');
  search.append(icon('search', 18), input);
  const list = element.querySelector<HTMLElement>('.palette-list')!;
  let shown: Action[] = [];
  let active = 0;

  const matches = (action: Action, words: string[]) => {
    const haystack = `${labelOf(action)} ${action.section} ${action.keywords ?? ''}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  };
  const highlight = () => {
    list.querySelectorAll('button').forEach((row, i) => {
      row.classList.toggle('active', i === active);
      row.setAttribute('aria-selected', String(i === active));
      if (i === active) row.scrollIntoView({ block: 'nearest' });
    });
  };
  const close = () => {
    element.hidden = true;
  };
  const run = (action: Action) => {
    close();
    action.run();
  };
  const render = () => {
    const query = input.value.trim().toLowerCase();
    const words = query.split(/\s+/).filter(Boolean);
    shown = actions().filter((a) => (a.enabled?.() ?? true) && matches(a, words));
    // Names that start with the query come first.
    if (query)
      shown.sort(
        (a, b) =>
          Number(!labelOf(a).toLowerCase().startsWith(query)) -
          Number(!labelOf(b).toLowerCase().startsWith(query)),
      );
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.replaceChildren(
      ...shown.map((action, i) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.setAttribute('role', 'option');
        if (action.icon) row.append(icon(action.icon, 16));
        const label = document.createElement('span');
        label.textContent = labelOf(action);
        const section = document.createElement('small');
        section.textContent = action.section;
        row.append(label, section);
        if (action.keys) {
          const keys = document.createElement('kbd');
          keys.textContent = action.keys;
          row.append(keys);
        }
        row.onpointermove = () => {
          if (active === i) return;
          active = i;
          highlight();
        };
        row.onclick = () => run(action);
        return row;
      }),
    );
    if (!shown.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No matching commands';
      list.append(empty);
    }
    highlight();
  };
  const open = () => {
    input.value = '';
    active = 0;
    element.hidden = false;
    render();
    input.focus();
  };

  input.addEventListener('input', () => {
    active = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const action = shown[active];
      if (action) run(action);
    }
  });
  element.addEventListener('pointerdown', (e) => {
    if (e.target === element) close();
  });
  return {
    element,
    open,
    close,
    get isOpen() {
      return !element.hidden;
    },
  };
}
