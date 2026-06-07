import { describe, it, expect } from 'vitest'
import { macroKind, macroColor, strobeGate, newMacroState, MACRO_SWATCHES } from '../src/engine/macros'

describe('macroKind ranges', () => {
	it('classifies ranges', () => {
		expect(macroKind(0)).toBe('off')
		expect(macroKind(9)).toBe('off')
		expect(macroKind(10)).toBe('swatch')
		expect(macroKind(39)).toBe('swatch')
		expect(macroKind(40)).toBe('rainbow')
		expect(macroKind(99)).toBe('rainbow')
		expect(macroKind(100)).toBe('crossfade')
		expect(macroKind(160)).toBe('candle')
		expect(macroKind(220)).toBe('random')
		expect(macroKind(255)).toBe('random')
	})
})

describe('macroColor', () => {
	it('returns first swatch (red) at value 10', () => {
		expect(macroColor(10, 0, newMacroState())).toEqual(MACRO_SWATCHES[0])
	})

	it('rainbow starts at red when time 0', () => {
		const c = macroColor(40, 0, newMacroState())
		expect(c).toEqual({ r: 255, g: 0, b: 0 })
	})

	it('crossfade starts blue-heavy when time 0', () => {
		const c = macroColor(100, 0, newMacroState())
		expect(c.r).toBe(0)
		expect(c.b).toBe(255)
	})
})

describe('strobeGate', () => {
	it('is open for low values', () => {
		expect(strobeGate(0, 0)).toEqual({ open: true, blackout: false })
		expect(strobeGate(9, 0)).toEqual({ open: true, blackout: false })
	})
	it('is blackout for 10-19', () => {
		expect(strobeGate(15, 0)).toEqual({ open: false, blackout: true })
	})
	it('produces a square wave when strobing', () => {
		// value 255 -> 5 Hz -> 200ms period
		expect(strobeGate(255, 0).open).toBe(true)
		expect(strobeGate(255, 50).open).toBe(true)
		expect(strobeGate(255, 150).open).toBe(false)
	})
})
