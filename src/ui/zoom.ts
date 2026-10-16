import type { Camera } from '../core/camera';
import type { SceneStore, AppState } from '../core/store';
import { icon, type IconName } from './icons';

const divider = (): HTMLSpanElement => {
  const item = document.createElement('span');
  item.className = 'toolbar-divider';
  item.setAttribute('aria-hidden', 'true');
  return item;
};

export function createZoom(
  camera: Camera,
  store: SceneStore,
  state: AppState,
  onFit?: () => void,
  onSelection?: () => void,
): { element: HTMLElement; refresh(): void } {
  const element = document.createElement('div');
  element.className = 'zoom-bar';
  const button = (
    name: IconName,
    label: string,
    title: string,
    action: () => void,
  ): HTMLButtonElement => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'icon-btn';
    item.title = title;
    item.setAttribute('aria-label', label);
    item.append(icon(name));
    item.onclick = action;
    return item;
  };
  const undo = button('undo', 'Undo', 'Undo — Ctrl+Z', () => store.undo());
  const redo = button('redo', 'Redo', 'Redo — Ctrl+Y', () => store.redo());
  const minus = button('zoomOut', 'Zoom out', 'Zoom out — Ctrl+-', () =>
    camera.zoomAt(1 / 1.2, innerWidth / 2, innerHeight / 2),
  );
  const value = document.createElement('button');
  value.type = 'button';
  value.className = 'zoom-value';
  value.title = 'Reset zoom to 100% — Ctrl+0';
  value.setAttribute('aria-label', 'Reset zoom to 100%');
  value.onclick = () => camera.reset();
  const plus = button('zoomIn', 'Zoom in', 'Zoom in — Ctrl+=', () =>
    camera.zoomAt(1.2, innerWidth / 2, innerHeight / 2),
  );
  const fit = button('fit', 'Zoom to fit', 'Zoom to fit — Shift+1', () => onFit?.());
  const selection = button('selection', 'Zoom to selection', 'Zoom to selection — Shift+2', () =>
    onSelection?.(),
  );
  element.append(undo, redo, divider(), minus, value, plus, divider(), fit, selection);
  const refresh = () => {
    value.textContent = Math.round(camera.state.zoom * 100) + '%';
    undo.disabled = !store.canUndo();
    redo.disabled = !store.canRedo();
    selection.disabled = state.value.selectedIds.size === 0;
  };
  refresh();
  return { element, refresh };
}
