# GoveeDMX

Control Govee smart lights from a lighting console using Art-Net (DMX over IP), entirely over your local network.

GoveeDMX receives Art-Net, maps DMX channels to Govee fixtures, and controls the lights through Govee's LAN API. Configuration, patching, testing, monitoring, and health information are available from a web browser.

```text
Lighting console ── Art-Net UDP 6454 ──▶ GoveeDMX ── Govee LAN API ──▶ Lights
                                              │
                                              └── Web UI on port 8080
```

## Quick start

Before starting, enable **LAN Control** for each light in the Govee Home app. The GoveeDMX computer and lights must be on the same local network.

### Windows

1. [Download GoveeDMX Setup 1.0.2](https://github.com/arielramosbuera/GoveeDmx/releases/latest/download/GoveeDMX.Setup.1.0.2.exe).
2. Right-click the installer and select **Run as administrator** so it can configure Windows Firewall.
3. Start GoveeDMX, then use the web interface that opens automatically.

No separate Node.js installation is required.

### Ubuntu, Debian, and Raspberry Pi

Run this command on the server:

```bash
curl -fsSL https://raw.githubusercontent.com/arielramosbuera/GoveeDmx/main/installers/install-ubuntu.sh | sudo bash
```

The guided installer installs required software, asks for network and Art-Net settings, and configures GoveeDMX as an automatically restarting systemd service. Open the displayed web address from any device on the LAN.

Run the same command again for updates, factory reset, uninstall, web-port changes, service status, logs, or repair.

For an unattended first installation using defaults:

```bash
curl -fsSL https://raw.githubusercontent.com/arielramosbuera/GoveeDmx/main/installers/install-ubuntu.sh | sudo bash -s -- --install --defaults
```

### macOS

A prebuilt macOS package is not currently published. See [macOS installation](docs/install-macos.md) for build and Gatekeeper instructions.

## First-time setup

1. Open the **Art-Net** tab and confirm the network interface, UDP port, and universe.
2. Open **Bulbs**, select **Scan network**, and attach the discovered lights.
3. Open **Patch** and assign each fixture a universe and starting DMX address.
4. Use **Manual Test** to confirm each light responds.
5. Send DMX from the console and verify it in **Art-Net Monitor** and **Dashboard**.

The default fixture personality uses seven channels:

1. Dimmer
2. Red
3. Green
4. Blue
5. Color temperature
6. Macro
7. Strobe

See the [complete DMX channel chart](docs/dmx-chart.md) for values and behavior.

## Features

- Art-Net input with multiple universes, FPS monitoring, source tracking, and ArtPollReply
- Govee LAN discovery, manual fixture entry, and direct local control
- Fixture patching with address validation and conflict detection
- Manual control and testing for commissioning
- Software color macros, fades, candle effect, rainbow, random colors, and strobe
- Per-light rate limiting to avoid overwhelming the Govee LAN API
- Live 512-channel Art-Net monitor
- Application, Art-Net, and light health monitoring with automatic recovery
- Browser-based interface usable from computers, tablets, and phones
- Windows desktop app and headless Linux/Raspberry Pi service

## Network requirements

Default ports:

- TCP `8080`: web interface and API
- UDP `6454`: Art-Net input and ArtPollReply
- UDP `4001–4003`: Govee discovery, status, and control

Govee discovery uses multicast and normally requires the bridge and lights to be on the same subnet. Managed switches, VLANs, VPNs, or restrictive firewall rules can block discovery.

## Service management on Linux

```bash
sudo systemctl status goveedmx
sudo systemctl restart goveedmx
sudo journalctl -u goveedmx -f
```

Configuration and logs are stored in `/var/lib/goveedmx`.

## Help and documentation

- [Windows installation](docs/install-windows.md)
- [Linux and Raspberry Pi installation](docs/install-linux-pi.md)
- [Art-Net setup](docs/artnet-setup.md)
- [Patching workflow](docs/patching.md)
- [DMX channel chart](docs/dmx-chart.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Latest release](https://github.com/arielramosbuera/GoveeDmx/releases/latest)

For source builds, testing, architecture, and packaging instructions, see [Development](DEVELOPMENT.md).

## License

Copyright © 2026 Ariel Ramos.

GoveeDMX is free software licensed under the [GNU General Public License v3.0 or later](LICENSE).
