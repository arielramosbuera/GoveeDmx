import { clamp, scale } from './color'
import { macroColor, macroKind, strobeGate, type MacroKind } from './macros'

export interface ChannelValues {
	dimmer: number
	red: number
	green: number
	blue: number
	cct: number
	macro: number
	strobe: number
}

export interface GoveeTarget {
	power: boolean
	/** 1-100 when powered on. */
	brightness: number
	colorMode: 'rgb' | 'cct'
	r: number
	g: number
	b: number
	kelvin: number
}

export interface MacroMemory {
	lastRandomMs: number
	randomColor: { r: number; g: number; b: number }
	flicker: number
}

/** Convert a 0-255 dimmer value into a Govee brightness percentage (1-100, or 0 when off). */
export function dimmerToBrightness(dimmer: number): number {
	if (dimmer <= 0) return 0
	return Math.max(1, Math.round((dimmer / 255) * 100))
}

/** Convert a 1-255 CCT channel value into Kelvin (2000-9000). */
export function cctToKelvin(cct: number): number {
	return Math.round(scale(cct, 1, 255, 2000, 9000))
}

/**
 * Compute the desired Govee output for a fixture from its DMX channel values.
 * Precedence: strobe shutter gates output; macro (if active) overrides color;
 * else CCT (if > 0) overrides RGB; else RGB. Dimmer scales brightness and 0 = off.
 */
export function computeTarget(ch: ChannelValues, timeMs: number, memory: MacroMemory): GoveeTarget {
	const gate = strobeGate(ch.strobe, timeMs)
	const dimmerOn = ch.dimmer > 0
	const powerOn = dimmerOn && !gate.blackout && gate.open

	let colorMode: 'rgb' | 'cct' = 'rgb'
	let r = clamp(ch.red, 0, 255)
	let g = clamp(ch.green, 0, 255)
	let b = clamp(ch.blue, 0, 255)
	let kelvin = 0

	const kind: MacroKind = macroKind(ch.macro)
	if (kind !== 'off') {
		const c = macroColor(ch.macro, timeMs, memory)
		colorMode = 'rgb'
		r = c.r
		g = c.g
		b = c.b
	} else if (ch.cct > 0) {
		colorMode = 'cct'
		kelvin = cctToKelvin(ch.cct)
	}

	return {
		power: powerOn,
		brightness: dimmerToBrightness(ch.dimmer),
		colorMode,
		r,
		g,
		b,
		kelvin,
	}
}

/** True when the fixture has any time-varying software effect active (macro/strobe). */
export function isDynamic(ch: ChannelValues): boolean {
	return macroKind(ch.macro) !== 'off' || ch.strobe >= 20
}
