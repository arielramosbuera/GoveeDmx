# Install on Windows

GoveeDMX ships as a standard Windows desktop app (Electron) with an NSIS installer. No command line required to run it.

## Use the installer (end users)

1. Download `GoveeDMX Setup <version>.exe`.
2. Double-click and follow the installer (Start Menu + desktop shortcuts are created).
3. Launch **GoveeDMX**. The app window opens to the control UI; the bridge runs inside the app.
4. When Windows Defender Firewall prompts, **allow** the app on private networks (needed for Art-Net UDP 6454 and Govee LAN UDP 4001–4003).

The bridge runs inside Electron's main process. Closing the control window or losing its renderer stops the entire app and releases all network ports. Starting GoveeDMX again starts a fresh backend.

Data and logs are stored in `%APPDATA%\@goveedmx\desktop`.

## Build the installer (developers)

Requires Node.js 20+.

```powershell
npm install
npm run build                 # builds web + server bundle
cd desktop                    # the desktop shell is a standalone package (isolated node_modules)
npm install                   # installs the Electron toolchain
npm run dist:win
```

The signed/unsigned `GoveeDMX Setup <version>.exe` is written to `desktop/dist-app/`.

> Code signing is optional. For distribution without SmartScreen warnings, configure an Authenticode certificate per the electron-builder docs. Place `icon.ico` in `desktop/build/` for app branding.

> **Building on Windows requires symlink-creation privilege.** electron-builder extracts a signing toolchain that contains symlinks. If you see `Cannot create symbolic link : A required privilege is not held by the client`, either enable **Windows Developer Mode** (Settings → Privacy & security → For developers) or run the build from an **Administrator** terminal. CI runners (GitHub Actions `windows-latest`) have this by default.
