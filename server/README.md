# Ddraw hosted collaboration server

The server serves the built single-page app and the Yjs WebSocket endpoint from one process.

## Local

```sh
npm run build
cd server
npm install
npm start
```

Open `http://localhost:3000`. Share links point back to this host and connect at `/collab`.

## Docker

From the repository root:

```sh
docker build -f server/Dockerfile -t ddraw .
docker run --rm -p 3000:3000 ddraw
```

## Configuration

- `PORT` — HTTP port, default `3000`.
- `PERSIST_DIR` — optional directory for debounced Yjs room snapshots. Without it, empty rooms are removed after 10 minutes.
- `MAX_ROOM_BYTES` — maximum encoded room size, default 50 MiB.

A reverse proxy must forward normal HTTP traffic and WebSocket upgrades for `/collab` to this process. Use TLS in production so clients connect over `wss:`.

Rooms are not end-to-end encrypted: this server can read their contents. The unguessable room ID in the link acts as the room secret, so links should be shared only with intended participants.
