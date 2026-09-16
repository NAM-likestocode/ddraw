import type { Camera } from '../core/camera';
import type { SceneStore, AppState } from '../core/store';

export function createZoom(
  camera: Camera,
  store: SceneStore,
  state: AppState,
  onFit?: () => void,
  onSelection?: () => void,
): { element: HTMLElement; refresh(): void } {
  const element = document.createElement('div');
  element.className = 'zoom-bar';
  const button = (label: string, title: string, action: () => void): HTMLButtonElement => {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = label;
    item.title = title;
    item.onclick = action;
    return item;
  };
  const undo = button('↶', 'Undo — Ctrl+Z', () => store.undo());
  const redo = button('↷', 'Redo — Ctrl+Y', () => store.redo());
  const minus = button('−', 'Zoom out', () =>
    camera.zoomAt(1 / 1.2, innerWidth / 2, innerHeight / 2),
  );
  const value = button('100%', 'Reset zoom to 100%', () => camera.reset());
  const plus = button('+', 'Zoom in', () => camera.zoomAt(1.2, innerWidth / 2, innerHeight / 2));
  const fit = button('⊡', 'Zoom to fit — Shift+1', () => onFit?.());
  const selection = button('⌗', 'Zoom to selection — Shift+2', () => onSelection?.());
  value.className = 'zoom-value';
  element.append(undo, redo, minus, value, plus, fit, selection);
  const refresh = () => {
    value.textContent = Math.round(camera.state.zoom * 100) + '%';
    undo.disabled = !store.canUndo();
    redo.disabled = !store.canRedo();
    selection.disabled = state.value.selectedIds.size === 0;
  };
  refresh();
  return { element, refresh };
}
