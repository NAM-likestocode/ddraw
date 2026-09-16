import type { ToolContext } from '../tools/types';
import type { ImageElement } from '../core/types';
import { base } from '../tools/helpers';
import { createId } from '../core/ids';
export function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
export async function insertImage(
  file: File,
  ctx: ToolContext,
  center?: { x: number; y: number },
): Promise<ImageElement> {
  const dataURL = await readAsDataURL(file);
  const bitmap = await createImageBitmap(file);
  const fileId = createId();
  const screenCenter = {
    x: ctx.renderer.interactiveCanvas.clientWidth / 2,
    y: ctx.renderer.interactiveCanvas.clientHeight / 2,
  };
  const p = center ?? ctx.camera.screenToWorld(screenCenter);
  const maxW = (ctx.renderer.interactiveCanvas.clientWidth * 0.5) / ctx.camera.state.zoom;
  const maxH = (ctx.renderer.interactiveCanvas.clientHeight * 0.5) / ctx.camera.state.zoom;
  const scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  bitmap.close();
  ctx.store.files[fileId] = { id: fileId, mimeType: file.type, dataURL, created: Date.now() };
  const el = {
    ...base('image', p.x - width / 2, p.y - height / 2, ctx),
    type: 'image',
    width,
    height,
    fileId,
    status: 'loaded',
  } as ImageElement;
  ctx.store.add(el);
  ctx.appState.update({ selectedIds: new Set([el.id]) });
  return el;
}
export async function pickAndInsertImage(ctx: ToolContext): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  const file = await new Promise<File | null>((resolve) => {
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (file) await insertImage(file, ctx);
  ctx.finishTool();
}
