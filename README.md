# Ddraw

A fast whiteboard for sketching diagrams, wireframes, and ideas. Ddraw runs in any modern browser or as a lightweight native desktop app for Windows and Linux, and supports optional real-time collaboration.

Inspired by [Excalidraw](https://excalidraw.com), built from scratch on a plain HTML canvas with TypeScript — no UI framework.

## Features

**Drawing**

- Rectangles, diamonds, ellipses, arrows, lines, freehand pen strokes, text, and images
- Hand-drawn ("Sketchy") look, or switch any shape to Clean, precise lines
- No fill, hatched, cross-hatched, or solid fills, with a handwritten font for text
- Stroke color, width, and style (solid, dashed, dotted), opacity, rounded or sharp corners
- Arrowheads (arrow, bar, dot) on either end of lines and arrows
- Eraser tool, and a pen that stays active for continuous sketching

**Mind maps**

- Press `M` and click to start a map, then `Tab` adds a child topic and `Enter` adds a sibling
- Topics lay themselves out automatically, with a colour per branch
- Collapse or expand a branch with the button next to its topic
- Drag a topic onto another to move it, along with everything under it
- Move between topics with the arrow keys, and press `F2` to rename

**Connecting and editing**

- Double-click any shape to write text inside it
- Arrows attach to shapes and follow them when they move
- Hover a selected shape or text and click a `+` to add a connected item in one step; while typing, press `Tab` or use the switch above it to make it a box or plain text
- Turn any box into plain text (or back) later from the style bar or the right-click menu
- A selected arrow shows just its two end dots; drag one to reattach it
- Shapes snap to each other's edges and centres while you drag (hold `Alt` to turn it off)
- Duplicate (`Ctrl+D`) and copy/paste keep arrows, groups, and mind-map branches connected
- Right-click for the actions that fit what you clicked, including align and distribute
- Press `Ctrl+K` to search every command by name and run it from the keyboard
- Select, move, resize, rotate, group, and lock elements
- Undo/redo, infinite canvas with pan and zoom, optional grid

**Styling**

- A small style bar floats above the selection: colour presets, fill, Sketchy/Clean, and stroke width
- Open the full properties panel from the bar when you need every option

**Files and export**

- Open and save `.ddraw` files (double-click to open them in the desktop app)
- Export to PNG or SVG, or copy a selection to the clipboard as an image
- Automatic local autosave, with images stored in IndexedDB

**Collaboration**

- Share a link to draw together in real time
- Live cursors and selections for everyone in the room
- Small self-hostable server (Node.js or Docker)

## Download

Get the latest desktop app from the [Releases page](https://github.com/NAM-likestocode/ddraw/releases/latest):

| System               | File                                          |
| -------------------- | --------------------------------------------- |
| Windows              | `Ddraw_<version>_x64-setup.exe` (or `.msi`)   |
| Debian, Ubuntu, Mint | `.deb`                                        |
| Fedora, openSUSE     | `.rpm`                                        |
| Any other Linux      | `.AppImage` (make it executable, then run it) |

The installers aren't code-signed yet, so Windows may show an "unknown publisher" warning the first time — choose **More info → Run anyway**.

## Getting started

Requires [Node.js](https://nodejs.org) 20 or newer.

```sh
git clone https://github.com/NAM-likestocode/ddraw.git
cd ddraw
npm install
npm run dev
```

Then open the URL Vite prints (by default `http://localhost:1420`).

## Desktop app

The desktop app is built with [Tauri](https://tauri.app). In addition to Node.js you'll need the [Rust toolchain](https://rustup.rs).

- **Windows:** uses Microsoft WebView2, which ships with current Windows 10/11 (the installer can install it if missing).
- **Linux:** install the system libraries listed in the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux) (WebKitGTK 4.1 and friends).

```sh
npm run tauri dev     # run the desktop app in development
npm run tauri build   # build installers for the current system
```

Installers are written to `src-tauri/target/release/bundle/`: NSIS and MSI on Windows; deb, rpm, and AppImage on Linux.

### Publishing a release

Releases are built automatically by GitHub Actions. Bump `version` in `package.json` and `src-tauri/tauri.conf.json`, commit, then push a matching tag:

```sh
git tag v2.0.0
git push origin v2.0.0
```

The workflow builds Windows and Linux installers and publishes them as a GitHub release.

## Real-time collaboration

The collaboration server serves the built web app and the sync endpoint from a single process:

```sh
npm run collab:dev    # builds the app and starts the server on http://localhost:3000
```

Or with Docker:

```sh
docker build -f server/Dockerfile -t ddraw .
docker run --rm -p 3000:3000 ddraw
```

See [`server/README.md`](server/README.md) for configuration, reverse-proxy, and persistence options.

> **Privacy note:** rooms are not end-to-end encrypted, so the server can read room contents. The random room ID in a share link works as the room's password — only share links with people you trust.

## Keyboard shortcuts

| Shortcut                | Action                        |
| ----------------------- | ----------------------------- |
| `V` / `1`               | Select                        |
| `R` / `D` / `O`         | Rectangle / diamond / ellipse |
| `A` / `L` / `P`         | Arrow / line / pen            |
| `E` / `0`               | Eraser                        |
| `T` / `I` / `H`         | Text / image / hand           |
| `M`                     | Mind map                      |
| `Tab` / `Enter`         | Add child / sibling topic     |
| `F2` or double-click    | Write text in a shape         |
| `Tab` on a new `+` item | Switch box / plain text       |
| `Ctrl+K`                | Search all commands           |
| Right-click             | Quick actions menu            |
| `Ctrl+D`                | Duplicate                     |
| `Ctrl+Shift+]` / `[`    | Bring to front / send to back |
| `Alt` + drag            | Move without snapping         |
| `Ctrl` + draw arrow     | Arrow that doesn't attach     |
| `Space` + drag          | Pan                           |
| `Ctrl` + wheel          | Zoom                          |
| `Ctrl+Z`                | Undo                          |
| `Shift+1` / `Shift+2`   | Fit canvas / selection        |
| `Ctrl+Shift+E`          | Export image                  |
| `Ctrl+Shift+C`          | Copy selection as PNG         |
| `Delete`                | Remove selection              |
| `Q`                     | Keep current tool active      |
| `?`                     | Show shortcut help            |

On macOS, use `Cmd` instead of `Ctrl`.

## Scripts

| Command             | What it does                                |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Start the web app with hot reload           |
| `npm run build`     | Type-check and build the web app to `dist/` |
| `npm run preview`   | Serve the production build locally          |
| `npm run server`    | Start the collaboration server              |
| `npm test`          | Run unit tests (Vitest)                     |
| `npm run test:e2e`  | Run browser tests (Playwright)              |
| `npm run format`    | Format the source with Prettier             |
| `npm run tauri ...` | Run Tauri desktop commands                  |

## Project structure

```
src/
  app/       App setup and wiring
  core/      Scene store, geometry, camera, element types, mind-map layout
  render/    Canvas renderer, hand-drawn shapes, mind-map branches
  tools/     One file per drawing tool
  ui/        Toolbar, style bar, menu, properties panel, dialogs, theme
  io/        File open/save, export, images, platform adapters
  collab/    Real-time sync and live cursors (Yjs)
server/      Collaboration server and Dockerfile
src-tauri/   Desktop app shell (Rust)
e2e/         Playwright browser tests
```

## Built with

- [TypeScript](https://www.typescriptlang.org) and [Vite](https://vite.dev)
- [Tauri 2](https://tauri.app) for the desktop app
- [Yjs](https://yjs.dev) for real-time collaboration
- [perfect-freehand](https://github.com/steveruizok/perfect-freehand) for pen strokes
- [Rough.js](https://roughjs.com) for the hand-drawn look
- [Lucide](https://lucide.dev) icons
- [Vitest](https://vitest.dev) and [Playwright](https://playwright.dev) for testing
