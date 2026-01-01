<p align="center">
  <img src="assets/logo.png" width="380" alt="maho logo" />
</p>

<p align="center">Local-first chat runtime for OBS.</p>

### Current functionality
- Local server that serves an overlay page for OBS Browser Source.
- Connects to Twitch chat via IRC and streams messages to the overlay.
- Server-side rules pipeline (match -> actions like `addClass` / `setVar` / `suppress`).
- Config and rules persisted in `data/state.json`.

More polish (Vue control panel, themes, emotes, richer events) is coming later.

### Quick start
```bash
bun install
cd apps/server
bun run dev