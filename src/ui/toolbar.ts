import type { ToolId } from '../core/types';
const tools: [ToolId, string, string][] = [
  ['select', 'V', '↖'],
  ['hand', 'H', '✋'],
  ['rectangle', 'R', '□'],
  ['diamond', 'D', '◇'],
  ['ellipse', 'O', '○'],
  ['arrow', 'A', '→'],
  ['line', 'L', '╱'],
  ['freedraw', 'P', '✎'],
  ['text', 'T', 'T'],
  ['image', 'I', '▧'],
];
export function createToolbar(
  active: ToolId,
  onTool: (id: ToolId) => void,
): { element: HTMLElement; setActive(id: ToolId): void } {
  const el = document.createElement('nav');
  el.className = 'toolbar';
  el.setAttribute('aria-label', 'Drawing tools');
  for (const [id, key, icon] of tools) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tool = id;
    b.className = 'icon-btn';
    b.title = `${id[0]!.toUpperCase() + id.slice(1)} (${key})`;
    b.innerHTML = `<span aria-hidden="true">${icon}</span><kbd>${key}</kbd>`;
    b.onclick = () => onTool(id);
    el.append(b);
  }
  const lock = document.createElement('button');
  lock.className = 'icon-btn lock';
  lock.title = 'Keep selected tool (Q)';
  lock.textContent = '⌾';
  el.append(lock);
  const setActive = (id: ToolId) => {
    for (const b of el.querySelectorAll<HTMLButtonElement>('[data-tool]'))
      b.classList.toggle('active', b.dataset.tool === id);
  };
  setActive(active);
  return { element: el, setActive };
}
