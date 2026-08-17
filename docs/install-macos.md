# Install on macOS

GoveeDMX ships as a standard macOS app (Electron) in a `.dmg`.

## Use the installer (end users)

1. Download `GoveeDMX-<version>.dmg` (universal: Intel + Apple Silicon).
2. Open it and drag **GoveeDMX** to **Applications**.
3. Launch GoveeDMX. The window opens to the control UI; the bridge runs inside the app.
4. macOS will ask for **Local Network** permission the first time (needed for Govee discovery and Art-Net). Allow it.

If the app is unsigned, macOS Gatekeeper may block the first launch:

- Right-click the app → **Open** → **Open**, or
- System Settings → Privacy & Security → **Open Anyway**.

The bridge runs inside Electron's main process. Closing the control window stops the app and backend together. Data and logs live in Electron's application-support directory.

## Build the app (developers)

Requires Node.js 20+ on macOS (to produce a mac build).

```bash
npm install
npm run build
cd desktop                                # standalone package (isolated node_modules)
npm install
npm run dist:mac                          # x64 + arm64 dmg
```

The `.dmg` is written to `desktop/dist-app/`.

> For notarization, configure Apple Developer signing (`CSC_LINK`, `CSC_KEY_PASSWORD`, and notarize settings) per the electron-builder docs. Place `icon.icns` in `desktop/build/`.
