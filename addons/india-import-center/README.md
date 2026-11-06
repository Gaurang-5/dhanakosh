# India Import Center

Import Indian broker and mutual-fund statements into Wealthfolio

This addon is the India-specific import layer for the India + global portfolio
fork. It deliberately reuses Wealthfolio's accounts, activities, assets,
currencies, quotes, and duplicate-detection APIs instead of maintaining a second
financial ledger.

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev:server

# Build for production
pnpm build

# Package addon
pnpm bundle
```

Wealthfolio 3.7 indexes private files below `assets/` and `dist/assets/`
automatically. Use `ctx.assets.getBlob(path)` or `ctx.assets.getUrl(path)` to
load them in the sandbox; no manifest asset list or permission is required. Blob
URLs are valid only for the current addon lifetime.

The generated Vite config targets Chrome/Edge 107, Firefox 104, and Safari 16,
matching Wealthfolio 3.7. The sandbox supports packaged images, fonts, media,
CSS, and WebAssembly. Worker/service-worker entry points, popups, direct network
requests, and remote CSS imports are intentionally unavailable.

## Features

- Opens the native import wizard, preserving member ownership, preview, validation and duplicate review.
- Zerodha equity tradebook, India CSV and global CSV presets are supplied by this fork's frontend.
- The addon no longer opens files or pretends that counting file characters is an import.
- Groww and CAMS/KFintech-specific adapters are still planned; arbitrary PDFs are not supported.

See `docs/import-examples/` in the fork for synthetic sample files and scope limits.
The addon requires no file permission and does not keep a separate financial ledger.
