import { expect, test, type Page } from '@playwright/test';

// Each test gets a fresh browser context, so the localStorage autosave starts empty.

interface Point {
  x: number;
  y: number;
}

interface MindmapLink {
  rootId: string;
  parentId: string | null;
  side: 'left' | 'right';
  order: number;
  collapsed: boolean;
  color: string;
}

interface SceneElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted: boolean;
  label?: { text: string };
  text?: string;
  mindmap?: MindmapLink;
  points?: [number, number][];
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
}

type DDrawWindow = Window & {
  __ddraw: {
    app: {
      appState: {
        value: { activeTool: string; selectedIds: Set<string>; editingId: string | null };
      };
      camera: { worldToScreen(p: Point): Point };
      store: {
        getElements(includeDeleted?: boolean): SceneElement[];
        get(id: string): SceneElement | undefined;
      };
    };
  };
};

/** Elements as the user sees them: deleted elements and collapsed branches are left out. */
function onCanvas(page: Page): Promise<SceneElement[]> {
  return page.evaluate(() => (window as unknown as DDrawWindow).__ddraw.app.store.getElements());
}

/** Every element in the store, including deleted ones and collapsed branches. */
function inStore(page: Page): Promise<SceneElement[]> {
  return page.evaluate(() =>
    (window as unknown as DDrawWindow).__ddraw.app.store.getElements(true),
  );
}

async function uiState(
  page: Page,
): Promise<{ activeTool: string; selectedIds: string[]; editingId: string | null }> {
  return page.evaluate(() => {
    const { value } = (window as unknown as DDrawWindow).__ddraw.app.appState;
    return {
      activeTool: value.activeTool,
      selectedIds: [...value.selectedIds],
      editingId: value.editingId,
    };
  });
}

/** Page coordinates of a world-space point, using the app's own camera. */
async function toPage(page: Page, world: Point): Promise<Point> {
  const screen = await page.evaluate(
    (point) => (window as unknown as DDrawWindow).__ddraw.app.camera.worldToScreen(point),
    world,
  );
  const box = await page.locator('canvas.canvas-interactive').boundingBox();
  if (!box) throw new Error('Interactive canvas has no bounding box');
  return { x: box.x + screen.x, y: box.y + screen.y };
}

async function clickWorld(page: Page, world: Point): Promise<void> {
  const at = await toPage(page, world);
  await page.mouse.click(at.x, at.y);
}

async function doubleClickWorld(page: Page, world: Point): Promise<void> {
  const at = await toPage(page, world);
  await page.mouse.dblclick(at.x, at.y);
}

async function dragWorld(page: Page, from: Point, to: Point): Promise<void> {
  const start = await toPage(page, from);
  const end = await toPage(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

/** Types into the label editor once it has focus (the app focuses it on a timer). */
async function typeIntoEditor(page: Page, text: string): Promise<void> {
  await expect(page.locator('textarea.label-editor')).toBeFocused();
  await page.keyboard.type(text);
}

function mindmapNodes(elements: SceneElement[]): SceneElement[] {
  return elements.filter((element) => element.mindmap);
}

function withLabel(elements: SceneElement[], text: string): SceneElement | undefined {
  return elements.find((element) => element.label?.text === text);
}

function centerOf(element: SceneElement): Point {
  return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
}

/** Where the "−" collapse button sits; mirrors collapseButton() in src/core/mindmap.ts. */
function collapseButtonOf(node: SceneElement): Point {
  const left = Math.min(node.x, node.x + node.width);
  const outerRight = node.mindmap?.side === 'right' || node.mindmap?.parentId === null;
  return {
    x: outerRight ? left + Math.abs(node.width) + 10 : left - 10,
    y: node.y + node.height / 2,
  };
}

/** Distance from a point to an element's box (0 when inside it). */
function distanceToBox(point: Point, element: SceneElement): number {
  const minX = Math.min(element.x, element.x + element.width);
  const maxX = Math.max(element.x, element.x + element.width);
  const minY = Math.min(element.y, element.y + element.height);
  const maxY = Math.max(element.y, element.y + element.height);
  const dx = Math.max(minX - point.x, 0, point.x - maxX);
  const dy = Math.max(minY - point.y, 0, point.y - maxY);
  return Math.hypot(dx, dy);
}

/** World-space start and end points of a line or arrow. */
function endsOf(arrow: SceneElement): { start: Point; end: Point } {
  const points = arrow.points ?? [];
  const first = points[0] ?? [0, 0];
  const last = points[points.length - 1] ?? [0, 0];
  return {
    start: { x: arrow.x + first[0], y: arrow.y + first[1] },
    end: { x: arrow.x + last[0], y: arrow.y + last[1] },
  };
}

function trackErrors(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

const TEXT_EDITOR = 'textarea.text-editor:not(.label-editor)';
const LABEL_EDITOR = 'textarea.label-editor';

function itemById(elements: SceneElement[], id: string): SceneElement | undefined {
  return elements.find((element) => element.id === id);
}

/** Types into an editor once it has focus (the app focuses it on a timer). */
async function typeInto(page: Page, selector: string, text: string): Promise<void> {
  await expect(page.locator(selector)).toBeFocused();
  await page.keyboard.type(text);
}

/** Where the right-hand quick-connect "+" sits; mirrors connectPoints() in src/tools/select.ts. */
function rightPlusOf(element: SceneElement): Point {
  return { x: element.x + element.width + 34, y: element.y + element.height / 2 };
}

/** Adds a text element with the text tool; it is left selected. */
async function addText(page: Page, at: Point, text: string): Promise<void> {
  await page.keyboard.press('t');
  await clickWorld(page, at);
  await typeInto(page, TEXT_EDITOR, text);
  await page.keyboard.press('Escape');
  await expect(page.locator(TEXT_EDITOR)).toHaveCount(0);
}

/**
 * Alpha (0-255) of the interactive canvas at each world point. Selection handles are
 * opaque white, so a non-zero value means something is drawn there.
 */
function overlayAlpha(page: Page, points: Point[]): Promise<number[]> {
  return page.evaluate(async (worlds) => {
    // Renders run on animation frames after each change, so wait for the pending one.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const app = (window as unknown as DDrawWindow).__ddraw.app;
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.canvas-interactive')!;
    const context = canvas.getContext('2d')!;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    return worlds.map((world) => {
      const screen = app.camera.worldToScreen(world);
      const x = Math.round(screen.x * scale);
      const y = Math.round(screen.y * scale);
      return context.getImageData(x, y, 1, 1).data[3]!;
    });
  }, points);
}

test('mind map: Tab adds two children and Delete removes one', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await test.step('M then a click creates a root that opens for renaming', async () => {
    await page.keyboard.press('m');
    await clickWorld(page, { x: 400, y: 300 });
    await expect(page.locator('textarea.label-editor')).toHaveValue('Main topic');
    await typeIntoEditor(page, 'Plan');
    await expect(page.locator('textarea.label-editor')).toHaveValue('Plan');
  });

  await test.step('Tab adds a child, then a second child to the root', async () => {
    await page.keyboard.press('Tab');
    await expect(page.locator('textarea.label-editor')).toHaveValue('Topic');
    await typeIntoEditor(page, 'Tasks');
    await page.keyboard.press('Enter');
    await expect(page.locator('textarea.label-editor')).toHaveCount(0);
    // Enter keeps Tasks selected; ArrowLeft moves the selection back to its parent, Plan.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Tab');
    await expect(page.locator('textarea.label-editor')).toHaveValue('Topic');
    await typeIntoEditor(page, 'Notes');
    await page.keyboard.press('Enter');
    await expect(page.locator('textarea.label-editor')).toHaveCount(0);
  });

  await test.step('three nodes with the right parents and labels', async () => {
    const nodes = mindmapNodes(await onCanvas(page));
    expect(nodes).toHaveLength(3);
    const plan = nodes.find((node) => node.mindmap?.parentId === null);
    const tasks = withLabel(nodes, 'Tasks');
    const notes = withLabel(nodes, 'Notes');
    expect(plan?.label?.text).toBe('Plan');
    expect(tasks?.mindmap?.parentId).toBe(plan?.id);
    expect(notes?.mindmap?.parentId).toBe(plan?.id);
  });

  await test.step('Delete removes the selected child', async () => {
    const notes = withLabel(mindmapNodes(await onCanvas(page)), 'Notes');
    expect((await uiState(page)).selectedIds).toEqual([notes?.id]);
    await page.keyboard.press('Delete');
    const labels = mindmapNodes(await onCanvas(page)).map((node) => node.label?.text);
    expect(labels.sort()).toEqual(['Plan', 'Tasks']);
    expect(withLabel(await inStore(page), 'Notes')?.isDeleted).toBe(true);
  });

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('mind map: collapse hides descendants and expanding restores them', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  let writeBefore: SceneElement | undefined;

  await test.step('build Plan > Tasks > Write', async () => {
    await page.keyboard.press('m');
    await clickWorld(page, { x: 400, y: 300 });
    await typeIntoEditor(page, 'Plan');
    await page.keyboard.press('Tab');
    await typeIntoEditor(page, 'Tasks');
    await page.keyboard.press('Tab');
    await typeIntoEditor(page, 'Write');
    await page.keyboard.press('Enter');
    await expect(page.locator('textarea.label-editor')).toHaveCount(0);
    writeBefore = withLabel(mindmapNodes(await onCanvas(page)), 'Write');
    expect(writeBefore).toBeDefined();
  });

  await test.step('the "−" button on a selected branch collapses it', async () => {
    const tasks = withLabel(mindmapNodes(await onCanvas(page)), 'Tasks');
    expect(tasks).toBeDefined();
    await clickWorld(page, centerOf(tasks!));
    expect((await uiState(page)).selectedIds).toEqual([tasks?.id]);
    await clickWorld(page, collapseButtonOf(tasks!));

    const visible = mindmapNodes(await onCanvas(page)).map((node) => node.label?.text);
    expect(visible.sort()).toEqual(['Plan', 'Tasks']);
    const stored = await inStore(page);
    expect(withLabel(stored, 'Write')?.isDeleted).toBe(false);
    expect(withLabel(stored, 'Tasks')?.mindmap?.collapsed).toBe(true);
  });

  await test.step('clicking the same spot again expands the branch', async () => {
    const tasks = withLabel(await inStore(page), 'Tasks');
    await clickWorld(page, collapseButtonOf(tasks!));

    const nodes = mindmapNodes(await onCanvas(page));
    expect(nodes.map((node) => node.label?.text).sort()).toEqual(['Plan', 'Tasks', 'Write']);
    expect(withLabel(await inStore(page), 'Tasks')?.mindmap?.collapsed).toBe(false);
    const write = withLabel(nodes, 'Write');
    expect(write?.x).toBeCloseTo(writeBefore!.x, 3);
    expect(write?.y).toBeCloseTo(writeBefore!.y, 3);
  });

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('rectangle label: double-clicking the outline saves the typed text', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await test.step('draw a rectangle', async () => {
    await page.keyboard.press('r');
    await dragWorld(page, { x: 300, y: 200 }, { x: 480, y: 300 });
    const rectangles = (await onCanvas(page)).filter((element) => element.type === 'rectangle');
    expect(rectangles).toHaveLength(1);
  });

  await test.step('double-clicking the outline opens the label editor', async () => {
    // An unfilled rectangle only responds on its outline, so aim at the top edge (y = 200).
    await doubleClickWorld(page, { x: 340, y: 200 });
    await typeIntoEditor(page, 'Hello box');
    await expect(page.locator('textarea.label-editor')).toHaveValue('Hello box');
    await page.keyboard.press('Escape');
    await expect(page.locator('textarea.label-editor')).toHaveCount(0);
  });

  await test.step('the text is stored as the rectangle label', async () => {
    const rectangle = (await onCanvas(page)).find((element) => element.type === 'rectangle');
    expect(rectangle?.label?.text).toBe('Hello box');
    expect((await uiState(page)).editingId).toBeNull();
  });

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('arrow: binds to two rectangles and its end follows a moved rectangle', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  let aId = '';
  let bId = '';

  await test.step('draw rectangle A on the left and rectangle B on the right', async () => {
    await page.keyboard.press('r');
    // A floating label covers the canvas near x=200, so rectangle A starts further right.
    await dragWorld(page, { x: 380, y: 200 }, { x: 540, y: 300 });
    await page.keyboard.press('r');
    await dragWorld(page, { x: 600, y: 200 }, { x: 760, y: 300 });
    const rectangles = (await onCanvas(page))
      .filter((element) => element.type === 'rectangle')
      .sort((p, q) => p.x - q.x);
    expect(rectangles).toHaveLength(2);
    aId = rectangles[0]!.id;
    bId = rectangles[1]!.id;
  });

  await test.step('an arrow dragged from inside A to inside B binds both ends', async () => {
    await page.keyboard.press('a');
    await dragWorld(page, { x: 460, y: 250 }, { x: 680, y: 250 });
    const arrows = (await onCanvas(page)).filter((element) => element.type === 'arrow');
    expect(arrows).toHaveLength(1);
    expect(arrows[0]?.startBinding?.elementId).toBe(aId);
    expect(arrows[0]?.endBinding?.elementId).toBe(bId);
  });

  await test.step('dragging A moves the arrow end attached to it', async () => {
    const arrowBefore = (await onCanvas(page)).find((element) => element.type === 'arrow');
    const startBefore = endsOf(arrowBefore!).start;
    const aBefore = (await inStore(page)).find((element) => element.id === aId);

    // A is unfilled, so grab it on its bottom edge and drag it 150 units down.
    // The top edge sits under a floating button while the arrow is selected.
    await dragWorld(page, { x: 460, y: 300 }, { x: 460, y: 450 });

    const elements = await onCanvas(page);
    const a = elements.find((element) => element.id === aId)!;
    const b = elements.find((element) => element.id === bId)!;
    const arrow = elements.find((element) => element.type === 'arrow')!;
    const { start, end } = endsOf(arrow);
    expect(a.y - aBefore!.y).toBeGreaterThan(100);
    expect(start.y - startBefore.y).toBeGreaterThan(50);
    expect(distanceToBox(start, a)).toBeLessThan(7);
    expect(distanceToBox(end, b)).toBeLessThan(7);
    expect(arrow.startBinding?.elementId).toBe(aId);
    expect(arrow.endBinding?.elementId).toBe(bId);
  });

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('quick connect: "+" adds a bound copy to the right and opens its label', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  let sourceId = '';

  await test.step('draw a rectangle, which stays selected', async () => {
    await page.keyboard.press('r');
    await dragWorld(page, { x: 300, y: 250 }, { x: 460, y: 350 });
    const source = (await onCanvas(page)).find((element) => element.type === 'rectangle');
    expect((await uiState(page)).selectedIds).toEqual([source?.id]);
    sourceId = source!.id;
  });

  await test.step('"+" creates a copy to the right, joined by a bound arrow', async () => {
    const source = (await onCanvas(page)).find((element) => element.id === sourceId)!;
    // The "+" sits 34 units right of the right edge, at mid-height.
    await clickWorld(page, { x: source.x + source.width + 34, y: source.y + source.height / 2 });

    const elements = await onCanvas(page);
    const rectangles = elements.filter((element) => element.type === 'rectangle');
    expect(rectangles).toHaveLength(2);
    const copy = rectangles.find((element) => element.id !== sourceId)!;
    expect(copy.x).toBeGreaterThan(source.x + source.width);

    const arrows = elements.filter((element) => element.type === 'arrow');
    expect(arrows).toHaveLength(1);
    expect(arrows[0]?.startBinding?.elementId).toBe(sourceId);
    expect(arrows[0]?.endBinding?.elementId).toBe(copy.id);
    const { start, end } = endsOf(arrows[0]!);
    expect(distanceToBox(start, source)).toBeLessThan(7);
    expect(distanceToBox(end, copy)).toBeLessThan(7);

    const ui = await uiState(page);
    expect(ui.selectedIds).toEqual([copy.id]);
    expect(ui.editingId).toBe(copy.id);
  });

  await test.step('the label editor is open on the copy and saves its text', async () => {
    await typeIntoEditor(page, 'Next step');
    await page.keyboard.press('Escape');
    await expect(page.locator('textarea.label-editor')).toHaveCount(0);
    const copy = (await onCanvas(page)).find(
      (element) => element.type === 'rectangle' && element.id !== sourceId,
    );
    expect(copy?.label?.text).toBe('Next step');
  });

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('a lone arrow or line shows no box or handles, only its two end dots', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await test.step('control: a selected box shows a corner handle', async () => {
    await page.keyboard.press('r');
    await dragWorld(page, { x: 700, y: 300 }, { x: 800, y: 380 });
    const [corner] = await overlayAlpha(page, [{ x: 800, y: 300 }]);
    expect(corner).toBeGreaterThan(0);
  });

  await test.step('a lone arrow has no box, corner or rotate handles', async () => {
    await page.keyboard.press('a');
    await dragWorld(page, { x: 400, y: 300 }, { x: 600, y: 500 });
    const arrow = (await onCanvas(page)).find((element) => element.type === 'arrow')!;
    expect((await uiState(page)).selectedIds).toEqual([arrow.id]);
    // Corners, edge middles and the rotate stem of its box; none lies on the diagonal.
    const offDiagonal = [
      { x: 600, y: 300 },
      { x: 400, y: 500 },
      { x: 500, y: 300 },
      { x: 600, y: 400 },
      { x: 500, y: 500 },
      { x: 400, y: 400 },
      { x: 500, y: 276 },
    ];
    expect(await overlayAlpha(page, offDiagonal)).toEqual(offDiagonal.map(() => 0));
    const { start, end } = endsOf(arrow);
    const [startAlpha, endAlpha] = await overlayAlpha(page, [start, end]);
    expect(startAlpha).toBeGreaterThan(0);
    expect(endAlpha).toBeGreaterThan(0);
  });

  await test.step('a lone line behaves the same way', async () => {
    await page.keyboard.press('l');
    await dragWorld(page, { x: 400, y: 600 }, { x: 600, y: 700 });
    const line = (await onCanvas(page)).find((element) => element.type === 'line')!;
    expect((await uiState(page)).selectedIds).toEqual([line.id]);
    const offDiagonal = [
      { x: 600, y: 600 },
      { x: 400, y: 700 },
      { x: 500, y: 600 },
      { x: 600, y: 650 },
      { x: 500, y: 700 },
      { x: 400, y: 650 },
      { x: 500, y: 576 },
    ];
    expect(await overlayAlpha(page, offDiagonal)).toEqual(offDiagonal.map(() => 0));
    const { start, end } = endsOf(line);
    const [startAlpha, endAlpha] = await overlayAlpha(page, [start, end]);
    expect(startAlpha).toBeGreaterThan(0);
    expect(endAlpha).toBeGreaterThan(0);
  });

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('quick connect on text: "+" adds an empty text joined by an arrow', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  let sourceId = '';

  await test.step('type a text element, which stays selected', async () => {
    await addText(page, { x: 400, y: 300 }, 'Idea');
    const source = (await onCanvas(page)).find((element) => element.type === 'text')!;
    expect(source.text).toBe('Idea');
    expect((await uiState(page)).selectedIds).toEqual([source.id]);
    sourceId = source.id;
  });

  await test.step('"+" adds an empty text to the right and opens it', async () => {
    const source = itemById(await onCanvas(page), sourceId)!;
    await clickWorld(page, rightPlusOf(source));

    const elements = await onCanvas(page);
    const texts = elements.filter((element) => element.type === 'text');
    expect(texts).toHaveLength(2);
    const copy = texts.find((element) => element.id !== sourceId)!;
    expect(copy.text).toBe('');
    expect(copy.x).toBeGreaterThan(source.x + source.width);

    const arrows = elements.filter((element) => element.type === 'arrow');
    expect(arrows).toHaveLength(1);
    expect(arrows[0]?.startBinding?.elementId).toBe(sourceId);
    expect(arrows[0]?.endBinding?.elementId).toBe(copy.id);

    const ui = await uiState(page);
    expect(ui.selectedIds).toEqual([copy.id]);
    expect(ui.editingId).toBe(copy.id);
    await expect(page.locator(TEXT_EDITOR)).toBeFocused();
    await expect(page.locator('.kind-switch')).toBeVisible();
  });

  await test.step('typing fills the new text, saved on Escape', async () => {
    await typeInto(page, TEXT_EDITOR, 'Next');
    await page.keyboard.press('Escape');
    await expect(page.locator(TEXT_EDITOR)).toHaveCount(0);
    const copy = (await onCanvas(page)).find(
      (element) => element.type === 'text' && element.id !== sourceId,
    );
    expect(copy?.text).toBe('Next');
    expect((await uiState(page)).editingId).toBeNull();
  });

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('kind switch: "Text" in the chip turns a new box into plain text', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  let sourceId = '';
  let copyId = '';

  await test.step('draw a box, then add a box to its right with "+"', async () => {
    await page.keyboard.press('r');
    await dragWorld(page, { x: 300, y: 250 }, { x: 460, y: 350 });
    const source = (await onCanvas(page)).find((element) => element.type === 'rectangle')!;
    sourceId = source.id;
    await clickWorld(page, rightPlusOf(source));

    const copy = (await onCanvas(page)).find(
      (element) => element.type === 'rectangle' && element.id !== sourceId,
    );
    copyId = copy!.id;
    expect((await uiState(page)).editingId).toBe(copyId);
    await expect(page.locator(LABEL_EDITOR)).toBeFocused();
    await expect(page.locator('.kind-switch')).toBeVisible();
  });

  await test.step('"Text" in the chip turns the box into text and reopens the editor', async () => {
    await page.locator('.kind-switch button[data-kind="text"]').click();
    expect(itemById(await onCanvas(page), copyId)?.type).toBe('text');
    expect((await uiState(page)).editingId).toBe(copyId);
    await expect(page.locator(TEXT_EDITOR)).toBeFocused();
    await expect(page.locator('.kind-switch button[data-kind="text"]')).toHaveClass(/active/);
  });

  await test.step('typed text is saved and the arrow still joins both', async () => {
    await typeInto(page, TEXT_EDITOR, 'Plain');
    await page.keyboard.press('Escape');
    await expect(page.locator(TEXT_EDITOR)).toHaveCount(0);
    const elements = await onCanvas(page);
    expect(itemById(elements, copyId)?.text).toBe('Plain');
    const arrows = elements.filter((element) => element.type === 'arrow');
    expect(arrows).toHaveLength(1);
    expect(arrows[0]?.startBinding?.elementId).toBe(sourceId);
    expect(arrows[0]?.endBinding?.elementId).toBe(copyId);
  });

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Tab in a new text turns it into a box and opens the box label', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  let copyId = '';

  await test.step('add a text, then a new text to its right with "+"', async () => {
    await addText(page, { x: 400, y: 300 }, 'Idea');
    const source = (await onCanvas(page)).find((element) => element.type === 'text')!;
    await clickWorld(page, rightPlusOf(source));
    const copy = (await onCanvas(page)).find(
      (element) => element.type === 'text' && element.id !== source.id,
    );
    copyId = copy!.id;
    await expect(page.locator(TEXT_EDITOR)).toBeFocused();
  });

  await test.step('Tab turns the empty text into a box and opens its label', async () => {
    await page.keyboard.press('Tab');
    await expect(page.locator(LABEL_EDITOR)).toBeFocused();
    await expect(page.locator(TEXT_EDITOR)).toHaveCount(0);
    expect(itemById(await onCanvas(page), copyId)?.type).toBe('rectangle');
    expect((await uiState(page)).editingId).toBe(copyId);
  });

  await test.step('the typed label is saved and the arrow still joins the box', async () => {
    await typeInto(page, LABEL_EDITOR, 'Box label');
    await page.keyboard.press('Escape');
    await expect(page.locator(LABEL_EDITOR)).toHaveCount(0);
    const elements = await onCanvas(page);
    expect(itemById(elements, copyId)?.label?.text).toBe('Box label');
    const arrows = elements.filter((element) => element.type === 'arrow');
    expect(arrows[0]?.endBinding?.elementId).toBe(copyId);
  });

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('an empty new text is removed with its arrow when Escape is pressed', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  let sourceId = '';
  let copyId = '';
  let arrowId = '';

  await test.step('add a text, then "+" to its right opens an empty text', async () => {
    await addText(page, { x: 400, y: 300 }, 'Idea');
    const source = (await onCanvas(page)).find((element) => element.type === 'text')!;
    sourceId = source.id;
    await clickWorld(page, rightPlusOf(source));
    const elements = await onCanvas(page);
    copyId = elements.find((element) => element.type === 'text' && element.id !== sourceId)!.id;
    arrowId = elements.find((element) => element.type === 'arrow')!.id;
    await expect(page.locator(TEXT_EDITOR)).toBeFocused();
  });

  await test.step('Escape with nothing typed removes the text and its arrow', async () => {
    await page.keyboard.press('Escape');
    await expect(page.locator(TEXT_EDITOR)).toHaveCount(0);
    const elements = await onCanvas(page);
    expect(elements.map((element) => element.id)).toEqual([sourceId]);
    const stored = await inStore(page);
    expect(itemById(stored, copyId)?.isDeleted).toBe(true);
    expect(itemById(stored, arrowId)?.isDeleted).toBe(true);
    expect((await uiState(page)).editingId).toBeNull();
  });

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('style bar kind buttons convert a box to text and back in place', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const center = { x: 380, y: 300 };
  let boxId = '';

  await test.step('draw a box, which stays selected with the style bar shown', async () => {
    await page.keyboard.press('r');
    await dragWorld(page, { x: 300, y: 250 }, { x: 460, y: 350 });
    boxId = (await onCanvas(page)).find((element) => element.type === 'rectangle')!.id;
    await expect(page.locator('.style-bar')).toBeVisible();
  });

  await test.step('"Plain text" turns the box into text in place', async () => {
    await page.locator('.style-bar [data-action="kind:text"]').click();
    const item = itemById(await onCanvas(page), boxId)!;
    expect(item.type).toBe('text');
    expect(centerOf(item).x).toBeCloseTo(center.x);
    expect(centerOf(item).y).toBeCloseTo(center.y);
    expect((await uiState(page)).selectedIds).toEqual([boxId]);
  });

  await test.step('"Box" turns the text back into a box in place', async () => {
    await page.locator('.style-bar [data-action="kind:box"]').click();
    const item = itemById(await onCanvas(page), boxId)!;
    expect(item.type).toBe('rectangle');
    expect(centerOf(item).x).toBeCloseTo(center.x);
    expect(centerOf(item).y).toBeCloseTo(center.y);
    expect((await uiState(page)).selectedIds).toEqual([boxId]);
  });

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
