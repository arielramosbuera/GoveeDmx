# Architecture (Developers)

## Overview

GoveeDMX is a single Node.js process: an Art-Net listener feeds a mapping engine, which drives Govee bulbs over the LAN through a per-bulb rate limiter. A web UI (React) talks to the backend over REST + WebSocket and is served as static files by the same process.

```
Console ──ArtDmx(6454)──▶ ArtNetInput ──▶ Engine ──▶ BulbOutput(rate limit) ──UDP 4003──▶ Bulbs
                                │            ▲                                    ▲
                                │         Patch/Config                    GoveeLanClient ◀─multicast 4001/4002
                                ▼
                          WebSocket Hub ◀── HealthMonitor
                                ▲
                             Web UI ──REST──▶ HTTP API
```

## Modules (`server/src`)

- **`inputs/`** — `InputSource` abstraction and the `ArtNetInput` implementation (ArtDmx parsing, ArtPollReply, per-universe FPS). Pure parse helpers (`parseArtDmx`, `readArtNetOpcode`) are unit-tested. Future USB-DMX/OSC inputs implement the same interface.
- **`govee/`** — `GoveeLanClient` (UDP multicast discovery + unicast control) and `GoveeRegistry` (device state, discovery/poll timers, online detection).
- **`engine/`** — the heart:
  - `mapping.ts` — pure DMX→Govee target computation (dimmer scaling, Kelvin mapping, precedence).
  - `macros.ts` — software macro colors and the strobe gate.
  - `output.ts` — `BulbOutput`: change detection + per-bulb rate limiting (only sends `turn`/`brightness`/`colorwc` when needed and not faster than the cap).
  - `engine.ts` — fixed-rate tick (40 Hz) reading patched channels and pushing targets.
- **`patch/`** — address allocation, conflict detection, validation.
- **`config/`** — `ConfigStore` with zod validation, atomic writes, and migration hooks.
- **`health/`** — `HealthMonitor` samples app/Art-Net/bulb health and raises alerts.
- **`api/`** — `http.ts` (REST + static serving via `node:http`) and `ws.ts` (WebSocket hub).
- **`app.ts`** — orchestrator wiring everything together and exposing operations to the API.
- **`server.ts`** — entry point.

## Design choices

- **Pure `node:dgram`** for all UDP (Art-Net + Govee) — identical behavior on Windows/macOS/Linux/ARM, no native addons, no Docker (multicast/broadcast are unreliable in Docker Desktop networking).
- **Minimal runtime deps** (`ws`, `zod` + a small custom logger and `node:http`) so the backend bundles into a single `dist/server.cjs` via esbuild — trivial to ship in Electron or via the installer.
- **Engine/UI separation**: the backend + web UI are the product; Electron and the installer are thin delivery shells around the identical core.
- **Rate limiting is first-class**: Govee LAN silently drops commands under load, so the engine coalesces and caps per bulb.

## Build & test

```bash
npm run build       # web (Vite) -> web/dist, server (esbuild) -> server/dist/server.cjs
npm test            # vitest: parser, mapping, macros, rate limiter, patch, config, integration, API/WS
```

## Data flow for one DMX frame

1. ArtDmx arrives → `ArtNetInput` parses → emits `dmx` (universe, 512 bytes).
2. `App` stores it in the engine buffer and broadcasts a throttled snapshot to the UI.
3. On the next engine tick, each fixture's 7 channels are read, `computeTarget` produces the desired Govee state.
4. `BulbOutput` diffs against the last sent state and, if changed and due, sends the minimal Govee commands.
5. `GoveeRegistry` polls status; `HealthMonitor` aggregates and broadcasts health.
