import type { Awareness } from 'y-protocols/awareness';
import { elementBounds } from '../core/geometry';
import type { SceneStore } from '../core/store';
import type { Camera } from '../core/camera';

export interface PresenceState {
  user?: { name: string; color: string };
  cursor?: { x: number; y: number } | null;
  selectedIds?: string[];
}

export function drawRemotePresence(
  ctx: CanvasRenderingContext2D,
  awareness: Awareness,
  store: SceneStore,
  camera: Camera,
): void {
  const dpr = Math.max(1, devicePixelRatio || 1);
  const { x, y, zoom } = camera.state;
  ctx.save();
  ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, x * dpr, y * dpr);
  for (const [clientId, raw] of awareness.getStates()) {
    if (clientId === awareness.clientID) continue;
    const state = raw as PresenceState;
    if (!state.user) continue;
    const color = state.user.color;
    for (const id of state.selectedIds ?? []) {
      const element = store.get(id);
      if (!element || element.isDeleted) continue;
      const bounds = elementBounds(element);
      ctx.strokeStyle = `${color}88`;
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      ctx.strokeRect(
        bounds.minX,
        bounds.minY,
        bounds.maxX - bounds.minX,
        bounds.maxY - bounds.minY,
      );
    }
    ctx.setLineDash([]);
    if (!state.cursor) continue;
    const cursor = state.cursor;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cursor.x, cursor.y);
    ctx.lineTo(cursor.x + 5 / zoom, cursor.y + 16 / zoom);
    ctx.lineTo(cursor.x + 9 / zoom, cursor.y + 10 / zoom);
    ctx.lineTo(cursor.x + 16 / zoom, cursor.y + 8 / zoom);
    ctx.closePath();
    ctx.fill();
    ctx.font = `${12 / zoom}px Inter, system-ui, sans-serif`;
    const width = ctx.measureText(state.user.name).width + 10 / zoom;
    ctx.fillRect(cursor.x + 11 / zoom, cursor.y + 12 / zoom, width, 20 / zoom);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.user.name, cursor.x + 16 / zoom, cursor.y + 22 / zoom);
  }
  ctx.restore();
}
