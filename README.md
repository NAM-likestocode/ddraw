# Ddraw

Ddraw is a fast, canvas-based drawing app inspired by Excalidraw. It runs in a browser or as a small Tauri desktop app for Windows.

## Development

```sh
npm install
npm run dev          # web app
npm run tauri dev    # desktop app
```

## Build the Windows installers

Install the prerequisites first: Node.js, npm, and the Rust toolchain. The desktop app uses Microsoft WebView2, which is included with current Windows 10/11 installations (the installer can bootstrap it when necessary).

```sh
npm run tauri build
```

The executable is written to `src-tauri/target/release/`; NSIS and MSI installers are written below `src-tauri/target/release/bundle/`.
