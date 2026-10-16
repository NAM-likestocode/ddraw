import type { AppState, SceneStore } from '../core/store';
import type { Element } from '../core/types';
import { exportToCanvas, exportToSvg, type ExportOptions } from '../io/export';
import { getPlatform } from '../io/platform';
import { icon } from './icons';

export interface ExportDialogController {
  element: HTMLElement;
  open(): void;
  close(): void;
  copySelection(): Promise<void>;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not create the PNG image'))),
      'image/png',
    ),
  );
}

export function createExportDialog(store: SceneStore, state: AppState): ExportDialogController {
  const element = document.createElement('div');
  element.className = 'export-dialog modal';
  element.hidden = true;
  element.innerHTML = `<div class="export-card" role="dialog" aria-modal="true" aria-labelledby="export-title">
    <button class="close" type="button" aria-label="Close"></button>
    <h2 id="export-title">Export image</h2>
    <div class="export-preview" aria-label="Export preview"></div>
    <div class="export-options">
      <label class="toggle"><input type="checkbox" data-option="background" checked><span>Background</span></label>
      <label class="toggle"><input type="checkbox" data-option="selection"><span>Only selected</span></label>
      <div class="export-scale"><span>Scale</span><div class="seg" role="group" aria-label="Export scale">
        <button type="button" data-scale="1" class="active">1×</button>
        <button type="button" data-scale="2">2×</button>
        <button type="button" data-scale="3">3×</button>
      </div></div>
    </div>
    <div class="export-actions">
      <button type="button" data-export="png">PNG</button>
      <button type="button" data-export="svg">SVG</button>
      <button type="button" data-export="copy">Copy to clipboard</button>
    </div>
    <p class="export-status" role="status"></p>
  </div>`;
  const preview = element.querySelector<HTMLElement>('.export-preview')!;
  const status = element.querySelector<HTMLElement>('.export-status')!;
  const background = element.querySelector<HTMLInputElement>('[data-option="background"]')!;
  const selection = element.querySelector<HTMLInputElement>('[data-option="selection"]')!;
  let scale: 1 | 2 | 3 = 1;
  let previewTimer = 0;

  const selectedElements = (): Element[] =>
    [...state.value.selectedIds]
      .map((id) => store.get(id))
      .filter((item): item is Element => Boolean(item && !item.isDeleted));
  const elements = (): Element[] =>
    selection.checked && !selection.disabled ? selectedElements() : store.getElements();
  const options = (): ExportOptions => ({
    background: background.checked ? state.value.viewBackgroundColor : null,
    padding: 20,
    scale,
    selectionOnly: selection.checked,
  });
  const showError = (error: unknown) => {
    status.textContent = error instanceof Error ? error.message : 'Export failed';
    status.classList.add('error');
  };
  const updatePreview = async () => {
    try {
      const canvas = await exportToCanvas(elements(), store.files, options());
      canvas.setAttribute('aria-hidden', 'true');
      preview.replaceChildren(canvas);
      status.textContent = '';
      status.classList.remove('error');
    } catch (error) {
      showError(error);
    }
  };
  const queuePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => void updatePreview(), 80);
  };
  const png = async () => {
    const canvas = await exportToCanvas(elements(), store.files, options());
    const blob = await canvasBlob(canvas);
    const platform = getPlatform();
    if (platform.saveBinary) await platform.saveBinary('drawing.png', blob, 'image/png');
    else throw new Error('Saving images is not supported on this platform');
  };
  const svg = async () => {
    const data = exportToSvg(elements(), store.files, options());
    const blob = new Blob([data], { type: 'image/svg+xml' });
    const platform = getPlatform();
    if (platform.saveBinary) await platform.saveBinary('drawing.svg', blob, 'image/svg+xml');
    else await platform.saveFile('drawing.svg', data, true);
  };
  const copy = async (items = elements(), copyOptions = options()) => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
      throw new Error('PNG clipboard copy is not supported by this browser');
    const canvas = await exportToCanvas(items, store.files, copyOptions);
    const blob = await canvasBlob(canvas);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    status.textContent = 'Copied PNG to clipboard';
    status.classList.remove('error');
  };

  const close = element.querySelector<HTMLButtonElement>('.close')!;
  close.append(icon('close'));
  close.onclick = () => (element.hidden = true);
  element.addEventListener('pointerdown', (event) => {
    if (event.target === element) element.hidden = true;
  });
  element.addEventListener('change', queuePreview);
  element.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target) return;
    if (target.dataset.scale) {
      scale = Number(target.dataset.scale) as 1 | 2 | 3;
      for (const button of element.querySelectorAll<HTMLButtonElement>('[data-scale]'))
        button.classList.toggle('active', button === target);
      queuePreview();
      return;
    }
    const action = target.dataset.export;
    if (!action) return;
    status.textContent = action === 'copy' ? 'Copying…' : 'Preparing download…';
    const task = action === 'png' ? png() : action === 'svg' ? svg() : copy();
    void task
      .then(() => {
        if (action !== 'copy') status.textContent = 'Exported';
      })
      .catch(showError);
  });

  return {
    element,
    open() {
      selection.disabled = selectedElements().length === 0;
      if (selection.disabled) selection.checked = false;
      element.hidden = false;
      status.textContent = '';
      queuePreview();
    },
    close() {
      element.hidden = true;
    },
    async copySelection() {
      try {
        const selected = selectedElements();
        if (!selected.length) throw new Error('Select something to copy as PNG');
        await copy(selected, { background: null, padding: 20, scale: 2, selectionOnly: true });
      } catch (error) {
        element.hidden = false;
        selection.disabled = selectedElements().length === 0;
        showError(error);
        throw error;
      }
    },
  };
}
