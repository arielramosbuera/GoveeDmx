import { hsvToRgb, scale, type Rgb } from './color'

/** Static color swatches for the low macro range (10-39). */
export const MACRO_SWATCHES: Rgb[] = [
	{ r: 255, g: 0, b: 0 }, // red
	{ r: 255, g: 64, b: 0 }, // orange
	{ r: 255, g: 160, b: 0 }, // amber
	{ r: 255, g: 255, b: 0 }, // yellow
	{ r: 0, g: 255, b: 0 }, // green
	{ r: 0, g: 255, b: 255 }, // cyan
	{ r: 0, g: 0, b: 255 }, // blue
	{ r: 128, g: 0, b: 255 }, // violet
	{ r: 255, g: 0, b: 255 }, // magenta
	{ r: 255, g: 147, b: 41 }, // warm white
]

export type MacroKind = 'off' | 'swatch' | 'rainbow' | 'crossfade' | 'candle' | 'random'

export function macroKind(value: number): MacroKind {
	if (value <= 9) return 'off'
	if (value <= 39) return 'swatch'
	if (value <= 99) return 'rainbow'
	if (value <= 159) return 'crossfade'
	if (value <= 219) return 'candle'
	return 'random'
}

interface MacroState {
	lastRandomMs: number
	randomColor: Rgb
	flicker: number
}

/**
 * Compute the color produced by a software macro.
 * `state` carries per-fixture memory for stateful effects (candle/random).
 * Deterministic effects (swatch/rainbow/crossfade) ignore state.
 */
export function macroColor(value: number, timeMs: number, state: MacroState): Rgb {
	switch (macroKind(value)) {
		case 'swatch': {
			const idx = Math.min(MACRO_SWATCHES.length - 1, Math.floor(scale(value, 10, 39, 0, MACRO_SWATCHES.length)))
			return MACRO_SWATCHES[idx]
		}
		case 'rainbow': {
			// 40 (slow) -> 99 (fast). Period 1-12s.
			const periodMs = scale(value, 40, 99, 12000, 1000)
			const hue = ((timeMs % periodMs) / periodMs) * 360
			return hsvToRgb(hue, 1, 1)
		}
		case 'crossfade': {
			const periodMs = scale(value, 100, 159, 12000, 1000)
			const t = (timeMs % periodMs) / periodMs
			const tri = t < 0.5 ? t * 2 : 2 - t * 2 // 0..1..0
			return {
				r: Math.round(255 * tri),
				g: 0,
				b: Math.round(255 * (1 - tri)),
			}
		}
		case 'candle': {
			// Warm flicker. Update flicker slowly for a believable candle.
			if (timeMs - state.lastRandomMs > 80) {
				state.flicker = 0.7 + Math.random() * 0.3
				state.lastRandomMs = timeMs
			}
			const f = state.flicker
			return { r: Math.round(255 * f), g: Math.round(110 * f), b: Math.round(20 * f) }
		}
		case 'random': {
			const intervalMs = scale(value, 220, 255, 2000, 250)
			if (timeMs - state.lastRandomMs > intervalMs) {
				state.randomColor = hsvToRgb(Math.random() * 360, 1, 1)
				state.lastRandomMs = timeMs
			}
			return state.randomColor
		}
		default:
			return { r: 0, g: 0, b: 0 }
	}
}

export function newMacroState(): MacroState {
	return { lastRandomMs: 0, randomColor: { r: 255, g: 255, b: 255 }, flicker: 1 }
}

/**
 * Strobe/shutter gate:
 *  - 0-9   => open (always on)
 *  - 10-19 => blackout (always off)
 *  - 20-255 => strobe; returns on/off square wave.
 *
 * Strobe rate is intentionally capped low (Govee LAN round-trips are slow,
 * so high-frequency strobe is not physically achievable over the network).
 */
export function strobeGate(value: number, timeMs: number): { open: boolean; blackout: boolean } {
	if (value <= 9) return { open: true, blackout: false }
	if (value <= 19) return { open: false, blackout: true }
	const hz = scale(value, 20, 255, 0.5, 5) // 0.5 - 5 Hz
	const periodMs = 1000 / hz
	const phase = (timeMs % periodMs) / periodMs
	return { open: phase < 0.5, blackout: false }
}
