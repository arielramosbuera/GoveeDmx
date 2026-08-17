# GoveeDMX — Art-Net → Govee LAN Bridge

Control Govee smart lights from any lighting console using **Art-Net (DMX over IP)**, 100% locally over your LAN. Built for live theater: robust, monitored, and well-tested.

GoveeDMX listens for Art-Net, maps DMX channels to Govee bulbs through a fixture personality, and drives the bulbs via the Govee **LAN API** (no cloud, no internet required). It ships a web UI for configuration, patching, manual testing, a live Art-Net monitor, and a health dashboard.

```
Lighting Console ──ArtDmx (UDP 6454)──▶ GoveeDMX ──UDP 4003──▶ Govee Bulbs
                                          │
                                          └── Web UI (http://<host>:8080)
```

## Features

- **Art-Net input** with per-universe FPS, source tracking, and optional ArtPollReply (consoles see the bridge as a node).
- **7-channel fixture personality**: Dimmer, Red, Green, Blue, CCT, Macro, Strobe. See the [DMX chart](docs/dmx-chart.md).
- **Software macros & strobe**: color swatches, rainbow, crossfade, candle, random, and a network-safe strobe.
- **Bulb discovery & patching**: scan the LAN, attach bulbs, auto- or manually assign DMX addresses with conflict detection.
- **Per-bulb rate limiting & change detection** so DMX refresh rates never flood the bulbs (Govee LAN drops under load).
- **Manual test / override** to take direct control of a fixture for commissioning.
- **Live Art-Net monitor**: realtime 512-channel grid per universe.
- **Health monitoring** of the app, Art-Net link, and each bulb, with auto-recovery.
- **Cross-platform**: native on Windows, macOS, Linux, and Raspberry Pi (pure `node:dgram`, no Docker, no native addons).

## Quick start (from source)

Requirements: **Node.js 20+**.

```bash
npm install
npm run build        # builds the web UI and the server bundle
npm start            # starts the bridge; open http://localhost:8080
```

Then in the web UI:

1. **Art-Net** tab → set the bind interface, port (6454), and accepted universe(s).
2. **Bulbs** tab → *Scan network* (enable "LAN Control" per device in the Govee Home app first), then *Attach* the bulbs you want.
3. **Patch** tab → patch each bulb to a universe + start address (7 channels each).
4. **Manual Test** tab → verify a fixture responds.
5. Bring up DMX from your console; watch the **Art-Net Monitor** and **Dashboard**.

### Development

```bash
npm run dev:server   # backend with hot reload (tsx) on :8080
npm run dev:web      # Vite dev server on :5173, proxies /api and /ws to :8080
npm test             # server unit/integration/API tests (vitest)
npm run typecheck    # typecheck server + web
```

## Installation (packaged apps)

Pre-built apps for end users:

- **Windows**: [docs/install-windows.md](docs/install-windows.md) — double-click installer (Electron NSIS `.exe`).
- **macOS**: [docs/install-macos.md](docs/install-macos.md) — `.dmg` drag-to-Applications.
- **Linux / Raspberry Pi**: [docs/install-linux-pi.md](docs/install-linux-pi.md) — `install.sh` sets up a `systemd` service.

## Building the installers (developers)

First build the shared core (web UI + server bundle) from the repo root, then build the platform package. The desktop app lives in `desktop/` as a **standalone package** (its own `node_modules`) so packaging never disturbs the monorepo.

Common first step on every platform:

```bash
npm install
npm run build        # builds web/dist + server/dist/server.cjs
```

### Windows (.exe installer)

> **Run PowerShell as Administrator.** electron-builder unpacks a code-signing toolchain that contains symlinks, and Windows only allows creating symlinks with elevated privileges. Without an admin terminal you will get `Cannot create symbolic link : A required privilege is not held by the client` and the build fails. (Alternatively, enable **Settings → Privacy & security → For developers → Developer Mode**, then a normal terminal works.)

In an **Administrator** PowerShell:

```powershell
cd C:\GoveeDMX
npm install
npm run build
cd desktop
npm install            # installs the Electron toolchain (one-time, large download)
npm run dist:win
```

Output: `desktop\dist-app\GoveeDMX Setup <version>.exe` (self-contained; the target PC needs nothing else).

Also run the produced installer **as Administrator** (right-click → Run as administrator) so it can add the Windows Firewall rules (`desktop\build\installer.nsh`) that let Govee discovery (UDP 4001–4003) and Art-Net (UDP 6454) reach the app. Otherwise add them manually — see [docs/troubleshooting.md](docs/troubleshooting.md).

Optional portable build (no installer): `npm run dist:portable` → a zipped, unzip-and-run app (still requires the admin/Developer-Mode step above).

### macOS (.dmg)

Must be built **on a Mac** (you cannot produce a macOS app from Windows/Linux):

```bash
cd /path/to/GoveeDMX
npm install
npm run build
cd desktop
npm install
npm run dist:mac       # universal: x64 + arm64
```

Output: `desktop/dist-app/GoveeDMX-<version>.dmg`. For Gatekeeper-clean distribution, configure Apple signing/notarization (`CSC_LINK`, `CSC_KEY_PASSWORD`); unsigned apps open via right-click → Open. Add `desktop/build/icon.icns` for branding.

### Linux (desktop AppImage)

On a Linux desktop:

```bash
cd /path/to/GoveeDMX
npm install
npm run build
cd desktop
npm install
npm run dist:linux     # AppImage in desktop/dist-app/
```

### Raspberry Pi / Linux (headless systemd service — recommended for show machines)

No desktop app needed; installs as an auto-starting service controlled from any browser on the LAN. On a fresh Ubuntu/Debian server, run:

```bash
curl -fsSL https://raw.githubusercontent.com/arielramosbuera/GoveeDmx/main/installers/install-ubuntu.sh | sudo bash
```

The installer adds Node.js 20 if needed and guides you through the web port, Art-Net port and universes, network binding, and node name. Re-run the same command later to update, factory-reset, uninstall, change the web port, view service status/logs, or repair the installation.

For unattended first install with recommended defaults:

```bash
curl -fsSL https://raw.githubusercontent.com/arielramosbuera/GoveeDmx/main/installers/install-ubuntu.sh | sudo bash -s -- --install --defaults
```

The service installs to `/opt/goveedmx`, stores configuration and logs in `/var/lib/goveedmx`, opens the required UFW ports when available, starts on boot, and restarts on failure. See [the Linux installation guide](docs/install-linux-pi.md) for management commands and noninteractive options.

### App icons (optional)

Place icons in `desktop/build/` before building: `icon.ico` (Windows), `icon.icns` (macOS), `icon.png` (Linux). A simplified `tray.png` is used for the system-tray glyph.

## Documentation

- [DMX channel chart](docs/dmx-chart.md)
- [Art-Net setup](docs/artnet-setup.md)
- [Patching workflow](docs/patching.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Architecture (developers)](docs/architecture.md)

## Repository layout

```
shared/      Shared TypeScript types (personalities, config, WS/REST DTOs)
server/      Backend: Art-Net input, mapping engine, Govee LAN client, REST + WS API
web/         React + Vite web UI (built and served by the backend)
desktop/     Electron shell for Windows/macOS (standalone package, built in isolation)
installers/  Linux/Raspberry Pi install.sh + uninstall.sh + systemd unit
docs/        User & developer documentation
```

## Notes & limitations

- Govee **LAN Control** must be enabled per device in the Govee Home app, and the bulb must be on the same L2 network/subnet as the bridge for multicast discovery to work.
- Strobe and fast effects are **software-generated** and bounded by Govee LAN latency; very high strobe rates are not physically achievable over the network (documented in the DMX chart).
- Iteration 1 supports **Art-Net** input. USB-DMX and OSC inputs can be added later via the same `InputSource` abstraction without touching the engine.

## License

MIT
