import { nanoid } from 'nanoid';
import type { CollabSession } from '../collab/collab';

const NAME_KEY = 'ddraw.collab.name';
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

function defaultServerUrl(): string {
  const override = env?.VITE_COLLAB_URL;
  if (override) return override.replace(/\/$/, '');
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/collab`;
}

function parseRoomLink(value: string): { roomId: string; serverUrl: string } {
  const url = new URL(value);
  const roomId = new URLSearchParams(url.hash.slice(1)).get('room');
  if (!roomId || !/^[A-Za-z0-9_-]{10,100}$/.test(roomId)) throw new Error('Invalid room link');
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return { roomId, serverUrl: `${protocol}//${url.host}/collab` };
}

function shareLink(session: CollabSession): string {
  if (!session.roomId || !session.serverUrl) return '';
  const endpoint = new URL(session.serverUrl);
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  endpoint.pathname = '/';
  endpoint.search = '';
  endpoint.hash = `room=${session.roomId}`;
  return endpoint.toString();
}

export interface ShareDialogController {
  element: HTMLElement;
  pill: HTMLButtonElement;
  open(): void;
  close(): void;
  autoJoinFromLocation(): void;
}

export function createShareDialog(session: CollabSession): ShareDialogController {
  const element = document.createElement('div');
  element.className = 'share-dialog modal';
  element.hidden = true;
  element.innerHTML = `<div class="share-card" role="dialog" aria-modal="true" aria-labelledby="share-title">
    <button class="close" type="button" aria-label="Close">×</button>
    <h2 id="share-title">Live collaboration</h2>
    <div class="share-idle">
      <label>Your name<input data-share="name" autocomplete="name" maxlength="40" placeholder="Your name"></label>
      <button class="primary" type="button" data-share="start">Start session</button>
      <div class="share-divider"><span>or join a session</span></div>
      <label>Session link<input data-share="link" type="url" placeholder="https://…/#room=…"></label>
      <button type="button" data-share="join">Join with link</button>
    </div>
    <div class="share-live" hidden>
      <div class="share-status"><i></i><span></span></div>
      <label>Shareable link<div class="share-link"><input readonly><button type="button" data-share="copy">Copy link</button></div></label>
      <h3>Participants</h3><div class="share-peers"></div>
      <button class="danger" type="button" data-share="stop">Stop session</button>
    </div>
    <p class="share-message" role="status"></p>
  </div>`;
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'share-pill';
  pill.textContent = 'Share';
  const idle = element.querySelector<HTMLElement>('.share-idle')!;
  const live = element.querySelector<HTMLElement>('.share-live')!;
  const name = element.querySelector<HTMLInputElement>('[data-share="name"]')!;
  const link = element.querySelector<HTMLInputElement>('[data-share="link"]')!;
  const liveLink = element.querySelector<HTMLInputElement>('.share-link input')!;
  const status = element.querySelector<HTMLElement>('.share-status')!;
  const peers = element.querySelector<HTMLElement>('.share-peers')!;
  const message = element.querySelector<HTMLElement>('.share-message')!;
  name.value = localStorage.getItem(NAME_KEY) ?? '';
  let pendingAutoLink = '';

  const savedName = (): string => {
    const value = name.value.trim();
    if (!value) throw new Error('Enter your name');
    localStorage.setItem(NAME_KEY, value);
    return value;
  };
  const connect = (serverUrl: string, roomId: string) => {
    session.start({ serverUrl, roomId, username: savedName() });
    pendingAutoLink = '';
    render();
  };
  const render = () => {
    const active = session.roomId !== null;
    idle.hidden = active;
    live.hidden = !active;
    const count = session.peers.length;
    pill.textContent = active ? `Live · ${Math.max(1, count)}` : 'Share';
    pill.classList.toggle('active', active);
    if (!active) return;
    liveLink.value = shareLink(session);
    status.className = `share-status ${session.state}`;
    status.querySelector('span')!.textContent =
      session.state === 'connected'
        ? 'Connected'
        : session.state === 'connecting'
          ? 'Connecting…'
          : 'Disconnected';
    peers.replaceChildren(
      ...session.peers.map((peer) => {
        const chip = document.createElement('span');
        chip.className = 'share-peer';
        chip.style.setProperty('--peer', peer.color);
        chip.textContent = `${peer.name}${peer.local ? ' (you)' : ''}`;
        return chip;
      }),
    );
  };

  element.querySelector<HTMLButtonElement>('.close')!.onclick = () => (element.hidden = true);
  element.addEventListener('pointerdown', (event) => {
    if (event.target === element) element.hidden = true;
  });
  element.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-share]');
    if (!button) return;
    message.textContent = '';
    try {
      if (button.dataset.share === 'start') connect(defaultServerUrl(), nanoid(20));
      else if (button.dataset.share === 'join') {
        const parsed = parseRoomLink(link.value.trim() || pendingAutoLink);
        connect(parsed.serverUrl, parsed.roomId);
      } else if (button.dataset.share === 'copy') {
        void navigator.clipboard
          .writeText(liveLink.value)
          .then(() => (message.textContent = 'Link copied'))
          .catch(() => (message.textContent = 'Could not copy the link'));
      } else if (button.dataset.share === 'stop') session.stop();
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : 'Could not join session';
    }
    render();
  });
  pill.onclick = () => {
    element.hidden = false;
    render();
    if (!name.value) name.focus();
  };
  session.addEventListener('change', render);

  return {
    element,
    pill,
    open() {
      element.hidden = false;
      render();
      if (!name.value) name.focus();
    },
    close() {
      element.hidden = true;
    },
    autoJoinFromLocation() {
      const room = new URLSearchParams(location.hash.slice(1)).get('room');
      if (!room) return;
      pendingAutoLink = location.href;
      link.value = pendingAutoLink;
      if (name.value) {
        try {
          connect(defaultServerUrl(), room);
        } catch (error) {
          message.textContent = error instanceof Error ? error.message : 'Could not join session';
          element.hidden = false;
        }
      } else {
        element.hidden = false;
        message.textContent = 'Enter your name, then join the session.';
        name.focus();
      }
    },
  };
}
