import { icon } from './icons';

export function createShortcuts(): { element: HTMLElement; toggle(): void } {
  const el = document.createElement('div');
  el.className = 'shortcuts modal';
  el.hidden = true;
  el.innerHTML = `<div><button class="close" type="button" aria-label="Close"></button><h2>Keyboard shortcuts</h2><dl><dt>V / 1</dt><dd>Select</dd><dt>R D O</dt><dd>Rectangle, diamond, ellipse</dd><dt>A / L / P</dt><dd>Arrow, line, draw</dd><dt>E / 0</dt><dd>Eraser</dd><dt>T / I / H</dt><dd>Text, image, hand</dd><dt>M</dt><dd>Mind map</dd><dt>Tab / Enter</dt><dd>Add child / sibling topic</dd><dt>Double-click shape</dt><dd>Write inside it</dd><dt>Ctrl + D</dt><dd>Duplicate</dd><dt>Alt + drag</dt><dd>Move without snapping</dd><dt>Ctrl + drag arrow</dt><dd>Don't attach to shapes</dd><dt>Space + drag</dt><dd>Pan</dd><dt>Ctrl + wheel</dt><dd>Zoom</dd><dt>Ctrl + Z</dt><dd>Undo</dd><dt>Shift + 1 / 2</dt><dd>Fit canvas / selection</dd><dt>Ctrl + Shift + E</dt><dd>Export image</dd><dt>Ctrl + Shift + C</dt><dd>Copy selection as PNG</dd><dt>Delete</dt><dd>Remove selection</dd><dt>Q</dt><dd>Lock tool</dd><dt>?</dt><dd>This help</dd></dl></div>`;
  const toggle = () => (el.hidden = !el.hidden);
  const close = el.querySelector('button')!;
  close.append(icon('close'));
  close.onclick = toggle;
  return { element: el, toggle };
}
