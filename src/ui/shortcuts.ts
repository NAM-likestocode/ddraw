export function createShortcuts(): { element: HTMLElement; toggle(): void } {
  const el = document.createElement('div');
  el.className = 'shortcuts modal';
  el.hidden = true;
  el.innerHTML = `<div><button class="close">×</button><h2>Keyboard shortcuts</h2><dl><dt>V / 1</dt><dd>Select</dd><dt>R D O</dt><dd>Rectangle, diamond, ellipse</dd><dt>A / L / P</dt><dd>Arrow, line, draw</dd><dt>T / I / H</dt><dd>Text, image, hand</dd><dt>Space + drag</dt><dd>Pan</dd><dt>Ctrl + wheel</dt><dd>Zoom</dd><dt>Ctrl + Z</dt><dd>Undo</dd><dt>Delete</dt><dd>Remove selection</dd><dt>Q</dt><dd>Lock tool</dd><dt>?</dt><dd>This help</dd></dl></div>`;
  const toggle = () => (el.hidden = !el.hidden);
  el.querySelector('button')!.onclick = toggle;
  return { element: el, toggle };
}
