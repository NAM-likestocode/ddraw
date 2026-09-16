import type { Tool } from './types';
export const handTool = (): Tool => {
  let x = 0;
  let y = 0;
  let down = false;
  return {
    id: 'hand',
    cursor: 'grab',
    onPointerDown(e) {
      down = true;
      x = e.clientX;
      y = e.clientY;
    },
    onPointerMove(e, ctx) {
      if (!down) return;
      ctx.camera.pan(e.clientX - x, e.clientY - y);
      x = e.clientX;
      y = e.clientY;
    },
    onPointerUp() {
      down = false;
    },
    cancel() {
      down = false;
    },
  };
};
