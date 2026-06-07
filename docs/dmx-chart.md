# DMX Channel Chart

Personality: **RGB + CCT + Macro + Strobe (7 channels)** — id `rgbcct7`.

Each patched bulb occupies **7 consecutive DMX channels**, so up to **73 bulbs per 512-channel universe**. Power is auto-derived from the Dimmer channel (Dimmer 0 = bulb off).

| Offset | Channel | Range | Behavior |
| ------ | ------- | ----- | -------- |
| +0 | **Dimmer (Master)** | 0 | Bulb off (sends power off) |
| | | 1–255 | On; brightness = scale(1–255 → 1–100%) |
| +1 | **Red** | 0–255 | Red component (RGB mode) |
| +2 | **Green** | 0–255 | Green component (RGB mode) |
| +3 | **Blue** | 0–255 | Blue component (RGB mode) |
| +4 | **CCT (tunable white)** | 0 | Use RGB |
| | | 1–255 | White mode; Kelvin = scale(1–255 → 2000K–9000K). **Overrides RGB.** |
| +5 | **Macro / Presets (software)** | 0–9 | Off (use RGB/CCT) |
| | | 10–39 | Static color swatch (10 swatches) |
| | | 40–99 | Rainbow fade (slow → fast) |
| | | 100–159 | Two-color crossfade (slow → fast) |
| | | 160–219 | Candle / flicker |
| | | 220–255 | Random color (slow → fast) |
| +6 | **Strobe / Shutter (software)** | 0–9 | Open (steady) |
| | | 10–19 | Blackout (forced off) |
| | | 20–255 | Strobe slow → fast (≈0.5–5 Hz) |

## Precedence (evaluated every engine tick)

1. **Strobe / shutter** gates the output: blackout forces off; strobe pulses the bulb on/off.
2. **Macro** (when > 9) drives the color, overriding CCT and RGB.
3. Otherwise **CCT** (when > 0) drives white, overriding RGB.
4. Otherwise **RGB** drives the color.
5. **Dimmer** sets brightness; Dimmer 0 turns the bulb off.

## Example

To patch a bulb at universe 0, address 1 and make it warm white at 50%:

- Ch1 (Dimmer) = 128
- Ch5 (CCT) = 32 → ≈2900K
- All others = 0

## Notes

- **Strobe is software-generated.** Govee LAN command round-trips are relatively slow, so the achievable strobe rate is capped (documented above). For hard, fast strobe, use dedicated DMX fixtures.
- The Macro channel overrides any color set on the RGB/CCT channels while it is active (> 9).
