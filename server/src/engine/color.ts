export function clamp(v: number, min: number, max: number): number {
	if (Number.isNaN(v)) return min
	return Math.min(max, Math.max(min, v))
}

/** Linear scale from one range to another, clamped to the output range. */
export function scale(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
	if (inMax === inMin) return outMin
	const t = (value - inMin) / (inMax - inMin)
	return clamp(outMin + t * (outMax - outMin), Math.min(outMin, outMax), Math.max(outMin, outMax))
}

export interface Rgb {
	r: number
	g: number
	b: number
}

/** HSV (h: 0-360, s/v: 0-1) to RGB (0-255). */
export function hsvToRgb(h: number, s: number, v: number): Rgb {
	const hh = ((h % 360) + 360) % 360 / 60
	const c = v * s
	const x = c * (1 - Math.abs((hh % 2) - 1))
	let r = 0
	let g = 0
	let b = 0
	if (hh >= 0 && hh < 1) [r, g, b] = [c, x, 0]
	else if (hh < 2) [r, g, b] = [x, c, 0]
	else if (hh < 3) [r, g, b] = [0, c, x]
	else if (hh < 4) [r, g, b] = [0, x, c]
	else if (hh < 5) [r, g, b] = [x, 0, c]
	else [r, g, b] = [c, 0, x]
	const m = v - c
	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255),
	}
}
