import { createServer } from 'node:http';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const messageSync = 0;
const messageAwareness = 1;
const messageQueryAwareness = 3;
const syncStep1 = 0;
const syncStep2 = 1;
const syncUpdate = 2;
const port = Number(process.env.PORT || 3000);
const maxRoomBytes = Number(process.env.MAX_ROOM_BYTES || 50 * 1024 * 1024);
const persistDir = process.env.PERSIST_DIR ? resolve(process.env.PERSIST_DIR) : null;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
if (persistDir) mkdirSync(persistDir, { recursive: true });

const rooms = new Map();
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(ws, encoder) {
  if (ws.readyState === WebSocket.OPEN) ws.send(encoding.toUint8Array(encoder));
}
function syncMessage(subtype, payload) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  encoding.writeVarUint(encoder, subtype);
  encoding.writeVarUint8Array(encoder, payload);
  return encoder;
}
function roomFile(name) {
  return persistDir ? join(persistDir, `${name}.bin`) : null;
}
function createRoom(name) {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);
  const room = { name, doc, awareness, connections: new Set(), cleanup: null, saveTimer: null };
  const file = roomFile(name);
  if (file && existsSync(file)) Y.applyUpdate(doc, readFileSync(file), 'persistence');
  doc.on('update', (update, origin) => {
    const message = syncMessage(syncUpdate, update);
    for (const connection of room.connections) if (connection !== origin) send(connection, message);
    if (file) {
      clearTimeout(room.saveTimer);
      room.saveTimer = setTimeout(() => writeFileSync(file, Y.encodeStateAsUpdate(doc)), 500);
    }
  });
  awareness.on('update', ({ added, updated, removed }, origin) => {
    if (origin?.awarenessIds) {
      for (const id of added.concat(updated)) origin.awarenessIds.add(id);
      for (const id of removed) origin.awarenessIds.delete(id);
    }
    const changed = added.concat(updated, removed);
    if (!changed.length) return;
    const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(encoder, update);
    for (const connection of room.connections) if (connection !== origin) send(connection, encoder);
  });
  rooms.set(name, room);
  return room;
}
function getRoom(name) {
  const existing = rooms.get(name);
  if (existing) return existing;
  return createRoom(name);
}
function scheduleCleanup(room) {
  if (room.connections.size || persistDir) return;
  clearTimeout(room.cleanup);
  room.cleanup = setTimeout(
    () => {
      if (room.connections.size) return;
      room.awareness.destroy();
      room.doc.destroy();
      rooms.delete(room.name);
    },
    10 * 60 * 1000,
  );
  room.cleanup.unref?.();
}
function handleMessage(room, ws, data) {
  try {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const type = decoding.readVarUint(decoder);
    if (type === messageSync) {
      const subtype = decoding.readVarUint(decoder);
      if (subtype === syncStep1) {
        const stateVector = decoding.readVarUint8Array(decoder);
        send(ws, syncMessage(syncStep2, Y.encodeStateAsUpdate(room.doc, stateVector)));
      } else if (subtype === syncStep2 || subtype === syncUpdate) {
        const update = decoding.readVarUint8Array(decoder);
        const candidate = new Y.Doc();
        Y.applyUpdate(candidate, Y.encodeStateAsUpdate(room.doc));
        Y.applyUpdate(candidate, update);
        const bytes = Y.encodeStateAsUpdate(candidate).byteLength;
        candidate.destroy();
        if (bytes > maxRoomBytes) {
          ws.close(1009, 'Room size limit exceeded');
          return;
        }
        Y.applyUpdate(room.doc, update, ws);
      }
    } else if (type === messageAwareness) {
      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        decoding.readVarUint8Array(decoder),
        ws,
      );
    } else if (type === messageQueryAwareness) {
      const ids = [...room.awareness.getStates().keys()];
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, ids),
      );
      send(ws, encoder);
    }
  } catch (error) {
    console.error(`Bad message in room ${room.name}:`, error);
    ws.close(1003, 'Invalid collaboration message');
  }
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const requested = normalize(join(root, pathname));
  let file =
    (requested === root || requested.startsWith(root + sep)) &&
    existsSync(requested) &&
    statSync(requested).isFile()
      ? requested
      : join(root, 'index.html');
  if (!existsSync(file)) {
    response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Frontend not built. Run npm run build first.');
    return;
  }
  const isIndex = file.endsWith('index.html');
  response.writeHead(200, {
    'content-type': mime[extname(file)] || 'application/octet-stream',
    'content-length': statSync(file).size,
    'cache-control': isIndex
      ? 'no-cache'
      : file.includes(`${join(root, 'assets')}`)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
  });
  createReadStream(file).pipe(response);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: maxRoomBytes + 1024 * 1024 });
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname !== '/collab' && !url.pathname.startsWith('/collab/')) return socket.destroy();
  const pathRoom = url.pathname.slice('/collab'.length).replace(/^\//, '');
  const name = url.searchParams.get('room') || decodeURIComponent(pathRoom);
  if (!name || !/^[A-Za-z0-9_-]{10,100}$/.test(name)) return socket.destroy();
  wss.handleUpgrade(request, socket, head, (ws) => {
    const room = getRoom(name);
    clearTimeout(room.cleanup);
    room.connections.add(ws);
    ws.awarenessIds = new Set();
    ws.binaryType = 'arraybuffer';
    ws.on('message', (data) => handleMessage(room, ws, data));
    ws.on('close', () => {
      room.connections.delete(ws);
      awarenessProtocol.removeAwarenessStates(room.awareness, [...ws.awarenessIds], ws);
      scheduleCleanup(room);
    });
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    encoding.writeVarUint(encoder, syncStep1);
    encoding.writeVarUint8Array(encoder, Y.encodeStateVector(room.doc));
    send(ws, encoder);
    const ids = [...room.awareness.getStates().keys()];
    if (ids.length) {
      const awareness = encoding.createEncoder();
      encoding.writeVarUint(awareness, messageAwareness);
      encoding.writeVarUint8Array(
        awareness,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, ids),
      );
      send(ws, awareness);
    }
  });
});

server.listen(port, '0.0.0.0', () =>
  console.log(`Ddraw server listening on http://0.0.0.0:${port}`),
);
