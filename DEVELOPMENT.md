# GoveeDMX development

End-user installation and operation are documented in the [main README](README.md).

## Requirements

- Node.js 20 or newer
- npm
- Platform packaging tools when building desktop installers

## Source setup

```bash
npm install
npm run build
npm start
```

Open `http://localhost:8080`.

Development commands:

```bash
npm run dev:server
npm run dev:web
npm test
npm run typecheck
```

The Vite development server runs on port 5173 and proxies API and WebSocket traffic to the backend on port 8080.

## Repository layout

```text
shared/      Shared types, fixture personalities, and API contracts
server/      Art-Net input, mapping engine, Govee LAN client, and API
web/         React web interface
desktop/     Electron desktop shell and platform packaging
installers/  Linux installer, uninstaller, release builder, and systemd unit
docs/        User and technical documentation
```

See [architecture](docs/architecture.md) for the application data flow and module design.

## Build shared production assets

From the repository root:

```bash
npm install
npm run build
```

This produces:

- `server/dist/server.cjs`
- `web/dist/`

## Windows installer

Run PowerShell as Administrator, or enable Windows Developer Mode so electron-builder can create required symbolic links.

```powershell
cd C:\GoveeDMX
npm install
npm run build
cd desktop
npm install
npm run dist:win
```

Output: `desktop\dist-app\GoveeDMX Setup <version>.exe`.

The NSIS installer uses `desktop/build/installer.nsh` to configure Windows Firewall. An optional portable ZIP can be built with:

```powershell
npm run dist:portable
```

## macOS package

Build on macOS:

```bash
npm install
npm run build
cd desktop
npm install
npm run dist:mac
```

Signing and notarization require `CSC_LINK` and `CSC_KEY_PASSWORD`.

## Linux desktop AppImage

For a Linux desktop:

```bash
npm install
npm run build
cd desktop
npm install
npm run dist:linux
```

Headless Ubuntu, Debian, and Raspberry Pi systems should use the systemd release instead of Electron.

## Linux systemd release

Build the application, then run:

```bash
./installers/build-release.sh
```

This produces the architecture-independent release archive and SHA-256 checksum under `release/`.

## Release checklist

1. Update package versions.
2. Run `npm run typecheck`, `npm test`, and `npm run build`.
3. Validate the installer scripts with ShellCheck.
4. Build and verify release artifacts.
5. Tag the commit and publish the artifacts on GitHub.
