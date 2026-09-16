import type { FreeDrawElement } from '../core/types';
import type { Tool } from './types';
import { base, world } from './helpers';
export const freedrawTool = (): Tool => {
  let id: string | null = null;
  const samples: [number, number, number][] = [];
  return {
    id: 'freedraw',
    cursor: 'crosshair',
    onPointerDown(e, ctx) {
      const p = world(e, ctx);
      samples.length = 0;
      samples.push([p.x, p.y, e.pressure || 0.5]);
      const el = {
        ...base('freedraw', p.x, p.y, ctx),
        type: 'freedraw',
        points: [[0, 0, e.pressure || 0.5]],
        simulatePressure: e.pointerType !== 'pen',
      } as FreeDrawElement;
      id = el.id;
      ctx.store.beginHistoryGroup();
      ctx.store.add(el);
      ctx.appState.update({ selectedIds: new Set([id]) });
    },
    onPointerMove(e, ctx) {
      if (!id) return;
      const events = e.getCoalescedEvents?.() ?? [e];
      for (const ev of events) {
        const p = world(ev, ctx);
        samples.push([p.x, p.y, ev.pressure || 0.5]);
      }
      ctx.store.update([id], (el) => {
        if (el.type !== 'freedraw') return;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of samples) {
          minX = Math.min(minX, p[0]);
          minY = Math.min(minY, p[1]);
          maxX = Math.max(maxX, p[0]);
          maxY = Math.max(maxY, p[1]);
        }
        el.x = minX;
        el.y = minY;
        el.width = maxX - minX;
        el.height = maxY - minY;
        el.points = samples.map((p) => [p[0] - minX, p[1] - minY, p[2]]);
      });
    },
    onPointerUp(_e, ctx) {
      if (id) ctx.store.endHistoryGroup();
      id = null;
      ctx.finishTool();
    },
    cancel(ctx) {
      if (id) ctx.store.endHistoryGroup();
      id = null;
    },
  };
};
