# Patching Workflow

Patching maps a Govee bulb to a DMX universe and start address using a fixture personality.

## Steps

1. **Bulbs tab → Scan network.** Make sure each bulb has **LAN Control** enabled in the Govee Home app. Discovered bulbs appear with IP, MAC, and online status.
   - If a bulb isn't discovered (multicast blocked), use **Add manually** with its IP.
2. **Attach** the bulbs you want to control. Attached bulbs are persisted and polled for status.
3. **Test On / Off** to confirm the app can reach the bulb before patching.
4. **Patch tab → select bulb, set universe, optionally set a start address.**
   - Leave the address blank to **auto-assign** the next free address in that universe.
   - Each fixture uses **7 channels** (`rgbcct7`).
5. The patch table shows each fixture's channel range. **Conflicts** (overlapping ranges in the same universe) are highlighted; reassign addresses to clear them.

## Addressing

- Addresses are **1-based** (1–512).
- A 7-channel fixture at address `N` occupies channels `N … N+6`.
- Auto-assign finds the lowest free range, filling gaps left by removed fixtures.
- A fixture that would overflow the universe (address + 6 > 512) is rejected.

## Bulb IP changes (DHCP)

Patch entries store the bulb **MAC** when known. If a bulb's IP changes (DHCP lease), the bridge re-resolves the IP from the MAC during discovery, so the patch keeps working. For maximum reliability, give show-critical bulbs **DHCP reservations** (static leases).

## Manual test / override

The **Manual Test** tab lets you take over a patched fixture (Dimmer/RGB/CCT sliders and a color picker). While override is enabled, Art-Net is ignored for that fixture. Use **Release to Art-Net** to hand control back to the console. Overrides go through the same rate limiter as normal output.
