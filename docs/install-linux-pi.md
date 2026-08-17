# Install on Linux / Raspberry Pi

Show machines are often headless, so on Linux/Pi GoveeDMX installs as a **systemd service** and you control it from any device's browser. No desktop app needed.

## Requirements

- A Debian/Ubuntu/Raspberry Pi OS (or similar) host.
- `sudo` access and an internet connection during installation.
- GoveeDMX installs **Node.js 20** automatically when Node 20+ is not already available.

## Install

Run this one-line command:

```bash
curl -fsSL https://raw.githubusercontent.com/arielramosbuera/GoveeDmx/main/installers/install-ubuntu.sh | sudo bash
```

The installer will:

1. Install Node.js 20 and basic prerequisites if needed.
2. Download and verify the latest prebuilt release.
3. Guide you through the web port, Art-Net port and universes, network interface, and node name.
4. Install the self-contained service to `/opt/goveedmx`.
5. Create a `goveedmx` service user and systemd service.
6. Open the selected ports if `ufw` is available.
7. Print the web UI URL, e.g. `http://192.168.1.50:8080`.

Open that URL from any computer/tablet on the same LAN to configure the bridge.

For an unattended installation using recommended defaults:

```bash
curl -fsSL https://raw.githubusercontent.com/arielramosbuera/GoveeDmx/main/installers/install-ubuntu.sh | sudo bash -s -- --install --defaults
```

## Update and maintenance

Re-run the same one-line command. An existing installation opens a menu with:

1. Update while preserving configuration.
2. Reinstall with a confirmed factory reset.
3. Uninstall while preserving data or purging everything.
4. Change the web UI port.
5. Show status, restart, or view recent logs.
6. Repair service files, ownership, and firewall rules.

Automation options include `--update`, `--reinstall --yes --defaults`, `--uninstall`,
`--uninstall --purge --yes`, `--port PORT`, and `--repair`. Pass options to a
piped script with `sudo bash -s --`, as shown in the unattended example.

Configuration and application logs are stored in `/var/lib/goveedmx`. Useful
systemd commands are:

```bash
sudo systemctl status goveedmx
sudo systemctl restart goveedmx
sudo journalctl -u goveedmx -f
```

The bridge must be on the same IPv4 LAN as the Govee devices for multicast
discovery. Required inbound ports are the selected web TCP port (default 8080),
the selected Art-Net UDP port (default 6454), and Govee UDP 4001–4003.

## Optional: desktop AppImage

On a Linux desktop you can also build the Electron AppImage:

```bash
npm install && npm run build
cd desktop                       # standalone package (isolated node_modules)
npm install
npm run dist:linux
```
