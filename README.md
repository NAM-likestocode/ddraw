# Ddraw

Ddraw is a fast, canvas-based drawing app inspired by Excalidraw. It runs in a browser or as a small Tauri desktop app for Windows.

## Features

- Canvas-based rectangles, diamonds, ellipses, arrows, lines, freehand strokes, text, and images
- Selection, resize, rotate, grouping, undo/redo, zoom, pan, grid, and style controls
- `.ddraw` file open/save plus PNG, SVG, and clipboard image export
- Autosave with image data stored in IndexedDB
- Optional real-time collaboration with shared cursors and selections
- Browser and native Windows desktop builds

## Keyboard shortcuts

| Shortcut              | Action                        |
| --------------------- | ----------------------------- |
| `V` / `1`             | Select                        |
| `R` / `D` / `O`       | Rectangle / diamond / ellipse |
| `A` / `L` / `P`       | Arrow / line / freehand draw  |
| `T` / `I` / `H`       | Text / image / hand           |
| `Space` + drag        | Pan                           |
| `Ctrl` + wheel        | Zoom                          |
| `Ctrl+Z`              | Undo                          |
| `Shift+1` / `Shift+2` | Fit canvas / selection        |
| `Ctrl+Shift+E`        | Export image                  |
| `Ctrl+Shift+C`        | Copy selection as PNG         |
| `Delete`              | Remove selection              |
| `Q`                   | Lock tool                     |
| `?`                   | Show shortcut help            |

Use `Cmd` instead of `Ctrl` for application shortcuts on macOS.

## Development

```sh
npm install
npm run dev          # web app
npm run tauri dev    # desktop app
```

## Collaboration hosting

See [`server/README.md`](server/README.md) for local, Docker, reverse-proxy, and persistence instructions. Collaboration is **not end-to-end encrypted**: the server can read room contents. The unguessable room ID in a share link acts as the room secret, so only share links with intended participants.

## Build the Windows installers

Install Node.js, npm, and the Rust toolchain. The desktop app uses Microsoft WebView2, which is included with current Windows 10/11 installations (the installer can bootstrap it when necessary).

```sh
npm run tauri build
```

The executable is written to `src-tauri/target/release/`; NSIS and MSI installers are written below `src-tauri/target/release/bundle/`.
