# Collaboration

`CollabSession` connects the app to a Yjs room through `y-websocket`. `CollabBridge` is the DOM-free scene adapter: it stores complete immutable elements in the `elements` Y.Map, files in `files`, broadcasts local/history changes, and applies remote changes through `SceneStore.applyRemote`.

Presence is carried by Yjs awareness and rendered separately from tool overlays. It contains the user's display name and colour, world-space cursor position, and selected element IDs.

The hosted link format is `<app-origin>/#room=<20-character-room-id>`. Web clients use their page origin at `/collab` (or `VITE_COLLAB_URL`); desktop clients derive the endpoint from the pasted hosted link.

Room contents are not end-to-end encrypted. Anyone with the room URL can join, and the synchronization server can inspect data. Treat the room ID as a secret.
