# Troubleshooting

## Installed app finds no bulbs (but dev/`npm start` does)

This is almost always **Windows Firewall**. Discovery sends a multicast query and
receives bulb replies inbound on UDP 4002. The dev process (`node.exe`) was allowed
through the firewall, but the installed `GoveeDMX.exe` is a new program and its
inbound replies are blocked, so the scan returns nothing.

Fix (PowerShell as Administrator):

```powershell
netsh advfirewall firewall add rule name="GoveeDMX Govee LAN" dir=in action=allow protocol=UDP localport=4001-4003
netsh advfirewall firewall add rule name="GoveeDMX Art-Net" dir=in action=allow protocol=UDP localport=6454
```

The installer (`build/installer.nsh`) adds these rules automatically when run as
Administrator. Current desktop builds stop the in-process backend whenever the
control window closes or its renderer exits, so a normal relaunch does not leave
ports behind. If an older build remains, end `GoveeDMX.exe` in Task Manager and
install the latest release.

## Bulbs not discovered

- Enable **LAN Control** for each device in the Govee Home app (Device Settings → LAN Control). Not all models support it.
- Ensure the bridge and bulbs are on the **same subnet**. Multicast discovery (239.255.255.250) does not cross routers/VLANs without relaying.
- On managed switches/APs, misconfigured **IGMP snooping** can drop multicast. Try a flat/unmanaged segment to confirm.
- Use **Add manually** with the bulb IP as a fallback; assign a DHCP reservation so the IP is stable.

## Bulb discovered but won't respond

- Click **Test On** in the Bulbs tab. If nothing happens, the control port (UDP 4003) may be blocked by a firewall.
- Some bulbs rate-limit aggressively. Lower **Max messages/sec** (Govee config) if you see flicker or dropped commands.

## No Art-Net received

- Confirm the console outputs the **universe** listed in the Art-Net tab, to **broadcast** or the bridge's IP.
- Check the **Art-Net Monitor** tab for FPS/source IP.
- On multi-NIC machines, set **Bind interface IP** to the lighting-network NIC instead of `0.0.0.0`.

## "bind EACCES" / "EADDRINUSE" on port 6454

- Another Art-Net application (or a previous instance) is using 6454, or the OS reserved it.
- Close the conflicting app, or bind to a specific interface. On Windows, check reserved port ranges with `netsh int ipv4 show excludedportrange protocol=udp`.
- The bridge auto-retries the Art-Net listener; the Dashboard shows the error.

## Web UI won't load

- Confirm the server is running and the port (default **8080**) isn't in use. Change `server.httpPort` in the config file if needed.
- Config file location:
  - Windows: `%APPDATA%\@goveedmx\desktop\config.json`
  - macOS: `~/Library/Application Support/GoveeDMX/config.json`
  - Linux/Pi: `~/.config/GoveeDMX/config.json` (or the service's data dir)

## Flicker / laggy effects

- Increase **Max messages/sec** cautiously, or reduce the number of simultaneously animating fixtures.
- Govee LAN is best-effort UDP; large rigs running fast macros will hit the per-bulb cap by design to stay stable.

## Logs

- Live logs appear on the **Dashboard**.
- Persistent logs:
  - Windows: `%APPDATA%\@goveedmx\desktop\logs\goveedmx.log`
  - macOS: `~/Library/Application Support/GoveeDMX/logs/goveedmx.log`
  - Linux/Pi: `~/.config/GoveeDMX/logs/goveedmx.log` (or `journalctl -u goveedmx`)
