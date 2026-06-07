# Art-Net Setup

GoveeDMX listens for **ArtDmx** packets on UDP port **6454** and maps them to patched Govee bulbs.

## Network

- Put the GoveeDMX machine, the lighting console, and the Govee bulbs on the **same LAN/subnet**.
- Govee discovery uses **multicast** (239.255.255.250); ensure your switches/Wi-Fi allow multicast (IGMP snooping configured correctly, or disabled on small networks).
- Art-Net is commonly sent as **broadcast** (e.g. 2.255.255.255 or 10.255.255.255) or **unicast** to the bridge IP. Both are accepted.

## Configuration (Art-Net tab)

| Setting | Meaning |
| ------- | ------- |
| **Bind interface IP** | The NIC to listen on. `0.0.0.0` listens on all interfaces. On multi-homed machines (e.g. a separate lighting network), set the specific NIC IP. |
| **Port** | Art-Net UDP port. Standard is **6454**. |
| **Accepted universes** | Comma-separated 15-bit Port-Addresses (e.g. `0, 1`). Leave empty to accept **all** universes. |
| **Node name** | Name reported in ArtPollReply. |
| **Reply to ArtPoll** | When enabled, the bridge answers ArtPoll so consoles/management tools discover it as a node. |

Universes use the Art-Net 15-bit Port-Address: `PortAddress = (Net << 8) | (Subnet << 4) | Universe`. Most consoles let you set the universe number directly.

## Console setup

1. Set the console output to **Art-Net**.
2. Set the **universe** to match one of the accepted universes in GoveeDMX.
3. Output to **broadcast** or **unicast** the GoveeDMX machine's IP.
4. Bring up channels; confirm activity in the GoveeDMX **Art-Net Monitor** tab (FPS and source IP should appear).

## Permissions

On some systems binding to UDP 6454 requires elevated privileges or a firewall allow rule:

- **Windows**: allow the app through Windows Defender Firewall for UDP 6454 and 4001–4003.
- **Linux/Pi**: the installer opens the ports; running as a service avoids manual firewall steps. If a port is reserved/in use (`EACCES`/`EADDRINUSE`), stop the conflicting Art-Net app or change the bind interface.
