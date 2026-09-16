import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { AppState, SceneStore } from '../core/store';
import type { Camera } from '../core/camera';
import type { Renderer } from '../render/renderer';
import { CollabBridge } from './bridge';
import { drawRemotePresence, type PresenceState } from './cursors';

export type CollabState = 'connecting' | 'connected' | 'disconnected';
export interface CollabPeer {
  clientId: number;
  name: string;
  color: string;
  local: boolean;
  hasCursor: boolean;
}
export interface StartOptions {
  serverUrl: string;
  roomId: string;
  username: string;
}

const COLORS = ['#CD7EBF', '#58A1A5', '#F8AB95', '#F17DAD', '#E65B66', '#5B8DEF', '#E0B84F'];

export class CollabSession extends EventTarget {
  state: CollabState = 'disconnected';
  roomId: string | null = null;
  serverUrl: string | null = null;
  private doc: Y.Doc | null = null;
  private provider: WebsocketProvider | null = null;
  private bridge: CollabBridge | null = null;
  private removeStateListener: (() => void) | null = null;
  private overlay: ((ctx: CanvasRenderingContext2D) => void) | null = null;
  private lastCursorAt = 0;
  private cursorTimer = 0;
  private pendingCursor: { x: number; y: number } | null = null;

  constructor(
    private readonly store: SceneStore,
    private readonly appState: AppState,
    private readonly camera: Camera,
    private readonly renderer: Renderer,
  ) {
    super();
  }

  get peers(): CollabPeer[] {
    const awareness = this.provider?.awareness;
    if (!awareness) return [];
    const peers: CollabPeer[] = [];
    for (const [clientId, raw] of awareness.getStates()) {
      const user = (raw as PresenceState).user;
      if (user)
        peers.push({
          clientId,
          name: user.name,
          color: user.color,
          local: clientId === awareness.clientID,
          hasCursor: Boolean((raw as PresenceState).cursor),
        });
    }
    return peers;
  }

  start(options: StartOptions): void {
    this.stop();
    this.state = 'connecting';
    this.roomId = options.roomId;
    this.serverUrl = options.serverUrl.replace(/\/$/, '');
    const doc = new Y.Doc();
    const bridge = new CollabBridge(doc, this.store, () => this.renderer.markDirty('static'));
    const provider = new WebsocketProvider(this.serverUrl, options.roomId, doc, {
      connect: true,
    });
    this.doc = doc;
    this.bridge = bridge;
    this.provider = provider;
    const color = COLORS[doc.clientID % COLORS.length]!;
    provider.awareness.setLocalState({
      user: { name: options.username, color },
      cursor: null,
      selectedIds: [...this.appState.value.selectedIds],
    } satisfies PresenceState);

    provider.on('status', ({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      this.state = status;
      this.emitChange();
    });
    provider.on('sync', (synced: boolean) => {
      if (!synced) return;
      if (bridge.elementsMap.size) bridge.pullFull();
      else bridge.pushFull();
      this.renderer.markDirty('both');
      this.emitChange();
    });
    provider.awareness.on('change', () => {
      this.renderer.markDirty('interactive');
      this.emitChange();
    });
    this.removeStateListener = this.appState.onChange(() => {
      const local = provider.awareness.getLocalState() as PresenceState | null;
      if (local)
        provider.awareness.setLocalStateField('selectedIds', [...this.appState.value.selectedIds]);
    });
    this.overlay = (ctx) => drawRemotePresence(ctx, provider.awareness, this.store, this.camera);
    this.renderer.addOverlay(this.overlay);
    this.renderer.interactiveCanvas.addEventListener('pointermove', this.onPointerMove);
    this.renderer.interactiveCanvas.addEventListener('pointerleave', this.onPointerLeave);
    this.emitChange();
  }

  stop(): void {
    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    this.cursorTimer = 0;
    this.pendingCursor = null;
    this.renderer.interactiveCanvas.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.interactiveCanvas.removeEventListener('pointerleave', this.onPointerLeave);
    if (this.overlay) this.renderer.removeOverlay(this.overlay);
    this.overlay = null;
    this.removeStateListener?.();
    this.removeStateListener = null;
    this.bridge?.destroy();
    this.provider?.awareness.setLocalState(null);
    this.provider?.destroy();
    this.doc?.destroy();
    this.bridge = null;
    this.provider = null;
    this.doc = null;
    this.roomId = null;
    this.serverUrl = null;
    this.state = 'disconnected';
    this.emitChange();
  }

  private onPointerMove = (event: PointerEvent): void => {
    const point = this.renderer.screenPoint(event);
    this.pendingCursor = this.camera.screenToWorld(point);
    const wait = Math.max(0, 33 - (performance.now() - this.lastCursorAt));
    if (this.cursorTimer) return;
    this.cursorTimer = window.setTimeout(() => {
      this.cursorTimer = 0;
      this.lastCursorAt = performance.now();
      this.provider?.awareness.setLocalStateField('cursor', this.pendingCursor);
    }, wait);
  };

  private onPointerLeave = (): void => {
    this.pendingCursor = null;
    this.provider?.awareness.setLocalStateField('cursor', null);
  };

  private emitChange(): void {
    this.dispatchEvent(new Event('change'));
  }
}
