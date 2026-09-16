import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

type DDrawWindow = Window & {
  __ddraw: {
    app: {
      camera: { pan(dx: number, dy: number): void };
      store: { getElements(): Array<{ type: string; text?: string }> };
    };
    stress(count?: number): void;
  };
};

async function elements(page: Page): Promise<Array<{ type: string; text?: string }>> {
  return page.evaluate(() => {
    const ddraw = (window as unknown as DDrawWindow).__ddraw;
    return ddraw.app.store.getElements().map((element) => ({
      type: element.type,
      ...(element.type === 'text' && 'text' in element ? { text: element.text } : {}),
    }));
  });
}

async function canvasPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas.canvas-interactive').boundingBox();
  if (!box) throw new Error('Interactive canvas has no bounding box');
  return { x: box.x + x, y: box.y + y };
}

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const start = await canvasPoint(page, ...from);
  const end = await canvasPoint(page, ...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

test('drawing app smoke test', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await test.step('page loads without browser errors', async () => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  await test.step('canvas and toolbar are present', async () => {
    await expect(page.locator('.toolbar')).toBeVisible();
    for (const selector of ['canvas.canvas-static', 'canvas.canvas-interactive']) {
      const canvas = page.locator(selector);
      await expect(canvas).toBeVisible();
      const size = await canvas.evaluate((element) => ({
        width: element.width,
        height: element.height,
      }));
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    }
  });

  await test.step('rectangle, freedraw, and text tools create elements', async () => {
    await page.keyboard.press('r');
    await drag(page, [260, 180], [430, 300]);
    expect((await elements(page)).filter((element) => element.type === 'rectangle')).toHaveLength(
      1,
    );

    await page.keyboard.press('p');
    await drag(page, [500, 320], [690, 420]);
    expect((await elements(page)).filter((element) => element.type === 'freedraw')).toHaveLength(1);

    await page.keyboard.press('t');
    const textPoint = await canvasPoint(page, 760, 180);
    await page.mouse.click(textPoint.x, textPoint.y);
    await expect(page.locator('.text-editor')).toBeVisible();
    await page.keyboard.type('hello');
    await page.keyboard.press('Escape');
    await expect(page.locator('.text-editor')).toHaveCount(0);
    expect((await elements(page)).find((element) => element.text === 'hello')).toBeDefined();
  });

  await test.step('undo and redo restore the text element', async () => {
    expect(await elements(page)).toHaveLength(3);

    await page.keyboard.press('Control+Z');
    expect((await elements(page)).find((element) => element.text === 'hello')).toBeUndefined();

    await page.keyboard.press('Control+Shift+Z');
    expect((await elements(page)).find((element) => element.text === 'hello')).toBeDefined();

    await page.keyboard.press('Control+Z');
    await page.keyboard.press('Control+Y');
    expect((await elements(page)).find((element) => element.text === 'hello')).toBeDefined();
  });

  await test.step('stress rendering and measure panning frames', async () => {
    mkdirSync(dirname('e2e/artifacts/smoke.png'), { recursive: true });
    await page.screenshot({ path: 'e2e/artifacts/smoke.png' });

    await page.evaluate(() => {
      const ddraw = (window as unknown as DDrawWindow).__ddraw;
      ddraw.stress(3000);
    });
    expect(await elements(page)).toHaveLength(3000);

    for (let i = 0; i < 10; i++) await page.mouse.wheel(i % 2 ? 30 : -30, 20);
    await page.keyboard.down('Control');
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, i % 2 ? 20 : -20);
    await page.keyboard.up('Control');

    const averageFrameTime = await page.evaluate(async () => {
      const ddraw = (window as unknown as DDrawWindow).__ddraw;
      const frameTimes: number[] = [];
      let previous = performance.now();
      await new Promise<void>((resolve) => {
        let frames = 0;
        const measure = (now: number) => {
          frameTimes.push(now - previous);
          previous = now;
          ddraw.app.camera.pan(1, 0);
          frames++;
          if (frames === 60) resolve();
          else requestAnimationFrame(measure);
        };
        requestAnimationFrame(measure);
      });
      return frameTimes.reduce((sum, duration) => sum + duration, 0) / frameTimes.length;
    });
    console.log(`Average frame time under stress: ${averageFrameTime.toFixed(2)} ms`);
    expect(averageFrameTime).toBeLessThan(50);
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
