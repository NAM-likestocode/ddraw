import type { AppState, SceneStore } from '../core/store';
import type { Camera } from '../core/camera';
import type { Element, FillStyle } from '../core/types';
import { selectionBounds } from '../core/geometry';
import { isNode } from '../core/mindmap';
import { icon } from './icons';

interface Preset {
  name: string;
  stroke: string;
  background: string;
  fill: FillStyle;
}

const PRESETS: Preset[] = [
  { name: 'Ink', stroke: '#D8DEE9', background: 'transparent', fill: 'none' },
  { name: 'Pink', stroke: '#CD7EBF', background: '#CD7EBF', fill: 'hachure' },
  { name: 'Blue', stroke: '#3B82F6', background: '#3B82F6', fill: 'hachure' },
  { name: 'Teal', stroke: '#58A1A5', background: '#58A1A5', fill: 'hachure' },
  { name: 'Yellow', stroke: '#EAB308', background: '#EAB308', fill: 'hachure' },
  { name: 'Red', stroke: '#E65B66', background: '#E65B66', fill: 'hachure' },
];
const FILLS: [FillStyle, string][] = [
  ['none', 'No fill'],
  ['hachure', 'Hatched'],
  ['cross-hatch', 'Cross-hatched'],
  ['solid', 'Solid'],
];
const WIDTHS: [number, string][] = [
  [1, 'Thin'],
  [2, 'Medium'],
  [4, 'Thick'],
];
const SHAPES = new Set(['rectangle', 'ellipse', 'diamond']);
const STROKED = new Set(['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'freedraw']);

/**
 * A small bar that floats above the selection with the styles people change
 * most: colour presets, fill, Sketchy/Clean and stroke width.
 */
export function createStyleBar(
  store: SceneStore,
  state: AppState,
  camera: Camera,
  actions: { more(): void; duplicate(): void; remove(): void },
  /** True while another popup (the right-click menu) owns the selection. */
  covered: () => boolean = () => false,
): { element: HTMLElement; refresh(): void } {
  const element = document.createElement('div');
  element.className = 'style-bar';
  element.setAttribute('role', 'toolbar');
  element.setAttribute('aria-label', 'Selection style');
  element.hidden = true;
  let busy = false;

  const selected = (): Element[] =>
    [...state.value.selectedIds]
      .map((id) => store.get(id))
      .filter((e): e is Element => Boolean(e && !e.isDeleted && !e.locked));

  const apply = (change: (el: Element) => void, defaults: Partial<typeof state.value.style>) => {
    const ids = selected().map((e) => e.id);
    if (ids.length) store.update(ids, change);
    state.update((s) => {
      Object.assign(s.style, defaults);
    });
  };

  const button = (action: string, label: string, content: string, active = false, extra = '') =>
    `<button type="button" data-action="${action}" title="${label}" aria-label="${label}"${active ? ' class="active" aria-pressed="true"' : ''}${extra}>${content}</button>`;

  const render = (list: Element[]) => {
    const first = list[0]!;
    const types = new Set(list.map((e) => e.type));
    const shapes = [...types].some((t) => SHAPES.has(t));
    const stroked = [...types].some((t) => STROKED.has(t));
    const sketchable = [...types].some((t) => t !== 'freedraw' && STROKED.has(t));
    const parts: string[] = [];
    if (stroked || types.has('text'))
      parts.push(
        `<div class="style-group">${PRESETS.map((p) =>
          button(
            `preset:${p.name}`,
            p.name,
            '',
            first.strokeColor.toLowerCase() === p.stroke.toLowerCase() &&
              (!shapes || ('fillStyle' in first && first.fillStyle === p.fill)),
            ` style="--sw:${p.stroke}" data-fill="${p.fill}"`,
          ),
        ).join('')}</div>`,
      );
    if (shapes) {
      const [fill, label] = FILLS.find(([f]) => f === first.fillStyle) ?? FILLS[0]!;
      parts.push(
        `<div class="style-group">${button('fill', `Fill: ${label}`, `<span class="fill-swatch fill-${fill}"></span>`)}</div>`,
      );
    }
    if (sketchable) {
      const sketchy = first.roughness > 0;
      parts.push(
        `<div class="style-group seg-pill">${button('sketchy', 'Sketchy, hand-drawn lines', 'Sketchy', sketchy)}${button('clean', 'Clean, precise lines', 'Clean', !sketchy)}</div>`,
      );
    }
    if (stroked) {
      const [, label] = WIDTHS.find(([w]) => w === first.strokeWidth) ?? WIDTHS[1]!;
      parts.push(
        `<div class="style-group">${button('width', `Stroke: ${label}`, `<span class="width-line" style="--w:${Math.min(first.strokeWidth, 4)}px"></span>`)}</div>`,
      );
    }
    parts.push(
      `<div class="style-group">${button('duplicate', 'Duplicate (Ctrl+D)', icon('duplicate', 16).outerHTML)}${button('remove', 'Delete', icon('clear', 16).outerHTML)}${button('more', 'More options', icon('more', 16).outerHTML)}</div>`,
    );
    element.innerHTML = parts.join('<span class="style-divider"></span>');
  };

  const place = (list: Element[]) => {
    const b = selectionBounds(list);
    if (!b) return;
    const host = element.parentElement;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const maxX = (host?.clientWidth ?? innerWidth) - width - 8;
    const top = camera.worldToScreen({ x: b.minX, y: b.minY });
    const bottom = camera.worldToScreen({ x: b.maxX, y: b.maxY });
    const cx = (top.x + bottom.x) / 2;
    let y = top.y - height - 44;
    if (y < 72) y = bottom.y + 44;
    element.style.left = `${Math.max(8, Math.min(maxX, cx - width / 2))}px`;
    element.style.top = `${Math.max(72, y)}px`;
  };

  let shown = '';
  const refresh = () => {
    const list = selected();
    const v = state.value;
    const hide =
      busy ||
      covered() ||
      !list.length ||
      v.activeTool !== 'select' ||
      v.editingId !== null ||
      v.drawingId !== null;
    element.hidden = hide;
    if (hide) {
      shown = '';
      return;
    }
    // Only rebuild the buttons when the selection or its style changed.
    const key = list
      .map(
        (e) =>
          `${e.id}:${e.strokeColor}:${e.backgroundColor}:${e.fillStyle}:${e.roughness}:${e.strokeWidth}`,
      )
      .join('|');
    if (key !== shown) {
      render(list);
      shown = key;
    }
    place(list);
  };

  element.addEventListener('pointerdown', (e) => e.stopPropagation());
  element.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    const action = target?.dataset.action;
    if (!action) return;
    const first = selected()[0];
    if (!first) return;
    if (action.startsWith('preset:')) {
      const p = PRESETS.find((x) => `preset:${x.name}` === action)!;
      apply(
        (el) => {
          el.strokeColor = p.stroke;
          if (isNode(el)) el.mindmap = { ...el.mindmap, color: p.stroke };
          else if (SHAPES.has(el.type)) {
            el.backgroundColor = p.background;
            el.fillStyle = p.fill;
          }
        },
        { strokeColor: p.stroke, backgroundColor: p.background, fillStyle: p.fill },
      );
    } else if (action === 'fill') {
      const index = FILLS.findIndex(([f]) => f === first.fillStyle);
      const fill = FILLS[(index + 1) % FILLS.length]![0];
      apply(
        (el) => {
          if (!SHAPES.has(el.type)) return;
          el.fillStyle = fill;
          // A fill needs a colour; borrow the outline's when there is none.
          if (fill !== 'none' && el.backgroundColor === 'transparent')
            el.backgroundColor = el.strokeColor;
        },
        { fillStyle: fill },
      );
    } else if (action === 'sketchy' || action === 'clean') {
      const roughness = action === 'sketchy' ? 1 : 0;
      apply(
        (el) => {
          el.roughness = roughness;
        },
        { roughness },
      );
    } else if (action === 'width') {
      const index = WIDTHS.findIndex(([w]) => w === first.strokeWidth);
      const width = WIDTHS[(index + 1) % WIDTHS.length]![0];
      apply(
        (el) => {
          if (STROKED.has(el.type)) el.strokeWidth = width;
        },
        { strokeWidth: width },
      );
    } else if (action === 'duplicate') actions.duplicate();
    else if (action === 'remove') actions.remove();
    else if (action === 'more') actions.more();
  });
  // Stay out of the way while the selection is being moved or resized.
  window.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).tagName === 'CANVAS') {
      busy = true;
      element.hidden = true;
    }
  });
  window.addEventListener('pointerup', () => {
    if (!busy) return;
    busy = false;
    refresh();
  });
  return { element, refresh };
}
