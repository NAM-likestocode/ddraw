# Collaboration hook

A later Yjs adapter should subscribe to `SceneStore.on('change', (_, origin) => ...)`, ignore `remote`, transmit `getSnapshotForSync()`, and apply peers with `applyRemote(elements)`. Elements are immutable replacements and merge by version then nonce. Presence/cursors belong on Renderer’s interactive overlay, not in scene history.
