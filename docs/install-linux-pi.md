# Install on Linux / Raspberry Pi

Show machines are often headless, so on Linux/Pi GoveeDMX installs as a **systemd service** and you control it from any device's browser. No desktop app needed.

## Requirements

- A Debian/Ubuntu/Raspberry Pi OS (or similar) host.
- **Node.js 20+**. On Raspberry Pi OS / Debian:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

## Install

From a copy of this repository (or a release bundle) on the device:

```bash
cd installers
sudo ./install.sh
```

The installer will:

1. Verify Node.js 20+.
2. Build the app if prebuilt artifacts aren't present.
3. Install the self-contained server bundle to `/opt/goveedmx` and the web UI to `/opt/goveedmx/web`.
4. Create a `goveedmx` service user and a `systemd` service (auto-start on boot, auto-restart on failure).
5. Open the required ports if `ufw` is active.
6. Print the web UI URL, e.g. `http://192.168.1.50:8080`.

Open that URL from any computer/tablet on the same LAN to configure the bridge.

## Manage the service

```bash
sudo systemctl status goveedmx     # state
sudo systemctl restart goveedmx    # restart
sudo journalctl -u goveedmx -f     # live logs
```

Config and logs are stored in `/var/lib/goveedmx`.

## Uninstall

```bash
cd installers
sudo ./uninstall.sh            # keeps config/data
sudo ./uninstall.sh --purge    # also removes data dir and service user
```

## Optional: desktop AppImage

On a Linux desktop you can also build the Electron AppImage:

```bash
npm install && npm run build
cd desktop                       # standalone package (isolated node_modules)
npm install
npm run dist:linux
```
