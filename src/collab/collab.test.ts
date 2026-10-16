import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { CollabBridge } from './bridge';
import { SceneStore } from '../core/store';
import type { ShapeElement } from '../core/types';

function rectangle(id: string, x = 0): ShapeElement {
  return {
    id,
    type: 'rectangle',
    x,
    y: 0,
    width: 100,
    height: 60,
    angle: 0,
    strokeColor: '#fff',
    backgroundColor: 'transparent',
    fillStyle: 'none',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    roundness: 'round',
    seed: 1,
    version: 1,
    versionNonce: 100,
    isDeleted: false,
    groupIds: [],
    locked: false,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function pair() {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const storeA = new SceneStore();
  const storeB = new SceneStore();
  const bridgeA = new CollabBridge(docA, storeA);
  const bridgeB = new CollabBridge(docB, storeB);
  let connected = true;
  const pendingA: Uint8Array[] = [];
  const pendingB: Uint8Array[] = [];
  docA.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'relay') return;
    if (connected) Y.applyUpdate(docB, update, 'relay');
    else pendingA.push(update);
  });
  docB.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'relay') return;
    if (connected) Y.applyUpdate(docA, update, 'relay');
    else pendingB.push(update);
  });
  return {
    storeA,
    storeB,
    bridgeA,
    bridgeB,
    disconnect: () => (connected = false),
    reconnect: () => {
      connected = true;
      for (const update of pendingA) Y.applyUpdate(docB, update, 'relay');
      for (const update of pendingB) Y.applyUpdate(docA, update, 'relay');
    },
  };
}

describe('CollabBridge', () => {
  it('propagates add, update, and soft delete', async () => {
    const p = pair();
    p.storeA.add(rectangle('one'));
    await settle();
    expect(p.storeB.get('one')?.x).toBe(0);

    p.storeA.update(['one'], (element) => {
      element.x = 42;
    });
    await settle();
    expect(p.storeB.get('one')?.x).toBe(42);

    p.storeA.remove(['one']);
    await settle();
    expect(p.storeB.get('one')?.isDeleted).toBe(true);
    expect(p.storeB.getElements()).toHaveLength(0);
  });

  it('converges concurrent edits by version then lower nonce', async () => {
    const p = pair();
    p.storeA.add(rectangle('same'));
    await settle();
    p.disconnect();
    p.storeA.update(['same'], (element) => {
      element.x = 10;
    });
    p.storeB.update(['same'], (element) => {
      element.x = 20;
    });
    await settle();
    const a = structuredClone(p.storeA.get('same')!);
    const b = structuredClone(p.storeB.get('same')!);
    const expected = a.versionNonce < b.versionNonce ? a : b;
    p.reconnect();
    await settle();
    await settle();
    expect(p.storeA.get('same')?.x).toBe(expected.x);
    expect(p.storeB.get('same')?.x).toBe(expected.x);
  });

  it('propagates undo and redo of an edit to peers', async () => {
    const p = pair();
    p.storeA.add(rectangle('one'));
    await settle();
    p.storeA.update(['one'], (element) => {
      element.x = 50;
    });
    await settle();
    expect(p.storeB.get('one')?.x).toBe(50);

    p.storeA.undo();
    await settle();
    expect(p.storeA.get('one')?.x).toBe(0);
    expect(p.storeB.get('one')?.x).toBe(0);

    p.storeA.redo();
    await settle();
    expect(p.storeA.get('one')?.x).toBe(50);
    expect(p.storeB.get('one')?.x).toBe(50);
  });

  it('undo leaves elements added by other peers alone', async () => {
    const p = pair();
    p.storeA.add(rectangle('mine'));
    await settle();
    p.storeB.add(rectangle('theirs', 200));
    await settle();

    p.storeA.undo();
    await settle();
    expect(p.storeA.get('mine')?.isDeleted).toBe(true);
    expect(p.storeB.get('mine')?.isDeleted).toBe(true);
    expect(p.storeA.get('theirs')?.isDeleted).toBe(false);
    expect(p.storeB.get('theirs')?.isDeleted).toBe(false);
  });

  it('propagates replaceScene as deletion of old IDs plus new elements', async () => {
    const p = pair();
    p.storeA.add(rectangle('old'));
    await settle();
    p.storeA.replaceScene([rectangle('new', 75)]);
    await settle();
    expect(p.storeB.get('old')?.isDeleted).toBe(true);
    expect(p.storeB.get('new')?.x).toBe(75);
    expect(p.storeB.getElements().map((element) => element.id)).toEqual(['new']);
  });
});
