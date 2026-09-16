import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test } from '@playwright/test';

let serverProcess: ChildProcess;
let origin: string;

async function sparePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('No test port'));
      server.close(() => resolve(address.port));
    });
  });
}

test.beforeAll(async () => {
  const port = await sparePort();
  origin = `http://127.0.0.1:${port}`;
  serverProcess = spawn('node', ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: 'pipe',
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${origin}/healthz`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Collaboration server did not start');
});

test.afterAll(() => serverProcess?.kill());

test('two pages share drawing and cursor presence', async ({ browser }) => {
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto(origin);
  await pageA.locator('.share-pill').click();
  await pageA.locator('[data-share="name"]').fill('Alice');
  await pageA.locator('[data-share="start"]').click();
  await expect(pageA.locator('.share-status')).toHaveClass(/connected/, { timeout: 2_000 });
  const link = await pageA.locator('.share-link input').inputValue();
  expect(link).toContain('#room=');

  await pageB.goto(link);
  await expect(pageB.locator('.share-dialog')).toBeVisible();
  await pageB.locator('[data-share="name"]').fill('Bob');
  await pageB.locator('[data-share="join"]').click();
  await expect(pageB.locator('.share-status')).toHaveClass(/connected/, { timeout: 2_000 });
  await pageA.locator('.share-dialog .close').click();
  await pageB.locator('.share-dialog .close').click();

  await pageA.keyboard.press('r');
  const canvasA = pageA.locator('canvas.canvas-interactive');
  const boxA = await canvasA.boundingBox();
  if (!boxA) throw new Error('Missing canvas A');
  await pageA.mouse.move(boxA.x + 280, boxA.y + 180);
  await pageA.mouse.down();
  await pageA.mouse.move(boxA.x + 440, boxA.y + 300, { steps: 8 });
  await pageA.mouse.up();
  await expect
    .poll(
      () =>
        pageB.evaluate(
          () =>
            window.__ddraw.app.store.getElements().filter((element) => element.type === 'rectangle')
              .length,
        ),
      { timeout: 2_000 },
    )
    .toBe(1);

  const boxB = await pageB.locator('canvas.canvas-interactive').boundingBox();
  if (!boxB) throw new Error('Missing canvas B');
  await pageB.mouse.move(boxB.x + 700, boxB.y + 420);
  await expect
    .poll(
      () =>
        pageA.evaluate(() =>
          window.__ddraw.app.collab.peers.some((peer) => peer.name === 'Bob' && peer.hasCursor),
        ),
      { timeout: 2_000 },
    )
    .toBe(true);

  mkdirSync('e2e/artifacts', { recursive: true });
  await pageA.screenshot({ path: 'e2e/artifacts/collab.png' });
  await contextA.close();
  await contextB.close();
});
