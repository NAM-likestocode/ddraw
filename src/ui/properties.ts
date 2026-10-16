import type { AppState, SceneStore } from '../core/store';
import type { Element, ElementType, StyleDefaults } from '../core/types';
import { icon } from './icons';
import { deleteSelection, duplicateSelection } from '../core/selection';

const colors = [
  '#D8DEE9',
  '#B6BDCA',
  '#818997',
  '#171B24',
  '#FFFFFF',
  '#000000',
  '#CD7EBF',
  '#F17DAD',
  '#F8AB95',
  '#E65B66',
  '#FF3D9F',
  '#EAB308',
  '#22C55E',
  '#58A1A5',
  '#3B82F6',
  '#8B5CF6',
];

type PropertyKey = keyof StyleDefaults;

const segment = (
  label: string,
  key: PropertyKey,
  options: Array<[string, string, string]>,
  current: unknown,
): string =>
  `<section><label>${label}</label><div class="seg" role="group" aria-label="${label}">${options
    .map(
      ([value, icon, title]) =>
        `<button type="button" data-key="${key}" data-value="${value}" title="${title}" aria-label="${title}" class="${String(current ?? '') === value ? 'active' : ''}">${icon}</button>`,
    )
    .join('')}</div></section>`;

export function createProperties(
  store: SceneStore,
  state: AppState,
): { element: HTMLElement; refresh(): void; toggleDetails(): void } {
  const element = document.createElement('aside');
  element.className = 'properties';
  // With a selection, the full panel only opens on request; the style bar covers the basics.
  let details = false;

  const selected = (): Element[] =>
    [...state.value.selectedIds]
      .map((id) => store.get(id))
      .filter((item): item is Element => Boolean(item && !item.isDeleted));
  const currentValue = (key: PropertyKey): unknown => {
    const first = selected()[0];
    return first && key in first ? first[key as keyof Element] : state.value.style[key];
  };
  const apply = (key: string, value: string | number | null) => {
    const ids = state.value.selectedIds;
    if (ids.size)
      store.update(ids, (item) => {
        Object.assign(item, { [key]: value });
      });
    // Sketchy/Clean is also remembered as the default for new elements.
    if (!ids.size || key === 'roughness')
      state.update((appState) => {
        Object.assign(appState.style, { [key]: value });
      });
    refresh();
  };
  const swatches = (label: string, key: 'strokeColor' | 'backgroundColor'): string => {
    const value = String(currentValue(key));
    return `<section class="color-section"><label>${label}</label><div class="swatches">${colors
      .map(
        (color) =>
          `<button type="button" style="--sw:${color}" data-color="${color}" data-key="${key}" title="${color}" aria-label="${color}" class="${color.toLowerCase() === value.toLowerCase() ? 'active' : ''}"></button>`,
      )
      .join(
        '',
      )}</div><input class="hex-input" aria-label="${label} hex colour" data-key="${key}" value="${value}" spellcheck="false" /></section>`;
  };

  const refresh = () => {
    const chosen = selected();
    const activeType: ElementType =
      state.value.activeTool === 'freedraw' ? 'freedraw' : (state.value.activeTool as ElementType);
    const types = new Set<ElementType>(
      chosen.length ? chosen.map((item) => item.type) : [activeType],
    );
    if (!chosen.length) details = false;
    element.hidden =
      (state.value.activeTool === 'select' && (chosen.length === 0 || !details)) ||
      state.value.activeTool === 'hand' ||
      state.value.activeTool === 'mindmap';
    if (element.hidden) return;
    const has = (...wanted: ElementType[]) => [...types].some((type) => wanted.includes(type));
    const all = (predicate: (type: ElementType) => boolean) => [...types].every(predicate);
    const fill = has('rectangle', 'ellipse', 'diamond', 'freedraw');
    const stroked = all((type) => type !== 'text' && type !== 'image');
    const edge = has('rectangle', 'diamond');
    const arrow = has('arrow');
    const text = has('text');
    const sketchable = has('rectangle', 'ellipse', 'diamond', 'line', 'arrow');
    const value = (key: PropertyKey) => currentValue(key);

    element.innerHTML = `${chosen.length ? `<button type="button" class="panel-close" data-action="close" title="Close" aria-label="Close style panel">${icon('close', 14).outerHTML}</button>` : ''}${swatches('Stroke', 'strokeColor')}
      ${
        fill
          ? `${swatches('Background', 'backgroundColor')}${segment(
              'Fill',
              'fillStyle',
              [
                ['none', '∅', 'No fill'],
                ['hachure', '╱', 'Hachure'],
                ['cross-hatch', '╳', 'Cross-hatch'],
                ['solid', '■', 'Solid'],
              ],
              value('fillStyle'),
            )}`
          : ''
      }
      ${
        stroked
          ? `${segment(
              'Stroke width',
              'strokeWidth',
              [
                ['1', '—', 'Thin'],
                ['2', '━', 'Medium'],
                ['4', '▬', 'Thick'],
              ],
              value('strokeWidth'),
            )}${segment(
              'Stroke style',
              'strokeStyle',
              [
                ['solid', '━', 'Solid'],
                ['dashed', '┅', 'Dashed'],
                ['dotted', '···', 'Dotted'],
              ],
              value('strokeStyle'),
            )}`
          : ''
      }
      ${
        sketchable
          ? segment(
              'Style',
              'roughness',
              [
                ['1', 'Sketchy', 'Hand-drawn lines and hatching'],
                ['0', 'Clean', 'Straight, precise lines'],
              ],
              Number(value('roughness')) > 0 ? '1' : '0',
            )
          : ''
      }
      ${
        edge
          ? segment(
              'Edges',
              'roundness',
              [
                ['sharp', '□', 'Sharp'],
                ['round', '▢', 'Round'],
              ],
              value('roundness'),
            )
          : ''
      }
      ${
        arrow
          ? `<section><label>Arrowheads</label><span class="sub-label">Start</span>${segment(
              '',
              'startArrowhead',
              [
                ['', '∅', 'None'],
                ['arrow', '←', 'Arrow'],
                ['bar', '|', 'Bar'],
                ['dot', '●', 'Dot'],
              ],
              value('startArrowhead'),
            )}<span class="sub-label">End</span>${segment(
              '',
              'endArrowhead',
              [
                ['', '∅', 'None'],
                ['arrow', '→', 'Arrow'],
                ['bar', '|', 'Bar'],
                ['dot', '●', 'Dot'],
              ],
              value('endArrowhead'),
            )}</section>`
          : ''
      }
      ${
        text
          ? `${segment(
              'Font family',
              'fontFamily',
              [
                ['hand', 'Aa', 'Hand-drawn'],
                ['sans', 'Aa', 'Sans serif'],
                ['mono', 'Aa', 'Monospace'],
              ],
              value('fontFamily'),
            )}${segment(
              'Font size',
              'fontSize',
              [
                ['16', 'S', 'Small'],
                ['20', 'M', 'Medium'],
                ['28', 'L', 'Large'],
                ['36', 'XL', 'Extra large'],
              ],
              value('fontSize'),
            )}${segment(
              'Align',
              'textAlign',
              [
                ['left', '≡', 'Left'],
                ['center', '≡', 'Centre'],
                ['right', '≡', 'Right'],
              ],
              value('textAlign'),
            )}`
          : ''
      }
      <section><label>Opacity <output>${Number(value('opacity'))}%</output></label><input type="range" min="10" max="100" data-key="opacity" value="${Number(value('opacity'))}"></section>
      ${
        chosen.length
          ? `<section><label>Layers</label><div class="seg layers"><button type="button" data-action="back" title="Send to back">⇤</button><button type="button" data-action="backward" title="Send backward">←</button><button type="button" data-action="forward" title="Bring forward">→</button><button type="button" data-action="front" title="Bring to front">⇥</button></div></section><div class="actions"><button type="button" data-action="duplicate">Duplicate</button><button type="button" data-action="delete" class="danger">Delete</button></div>`
          : ''
      }`;
  };

  element.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target) return;
    if (target.dataset.color) apply(target.dataset.key!, target.dataset.color);
    else if (target.dataset.value !== undefined) {
      const key = target.dataset.key!;
      const raw = target.dataset.value;
      const value =
        key === 'strokeWidth' || key === 'fontSize' || key === 'roughness'
          ? Number(raw)
          : raw || null;
      apply(key, value);
    }
    const action = target.dataset.action;
    if (action === 'delete') deleteSelection(store, state);
    else if (action === 'duplicate') duplicateSelection(store, state);
    else if (action === 'close') {
      details = false;
      refresh();
    } else if (action)
      store.reorder(state.value.selectedIds, action as 'front' | 'back' | 'forward' | 'backward');
  });
  element.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.type !== 'range' || !target.dataset.key) return;
    apply(target.dataset.key, Number(target.value));
  });
  element.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    if (!target.classList.contains('hex-input') || !target.dataset.key) return;
    if (/^#[0-9a-f]{6}$/i.test(target.value)) apply(target.dataset.key, target.value);
    else refresh();
  });

  refresh();
  const toggleDetails = () => {
    details = !details;
    refresh();
  };
  return { element, refresh, toggleDetails };
}
