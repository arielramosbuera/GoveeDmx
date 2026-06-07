import { describe, it, expect } from 'vitest'
import { computeTarget, dimmerToBrightness, cctToKelvin, type ChannelValues } from '../src/engine/mapping'
import { newMacroState } from '../src/engine/macros'

const zero: ChannelValues = { dimmer: 0, red: 0, green: 0, blue: 0, cct: 0, macro: 0, strobe: 0 }
const mem = () => newMacroState() as never

describe('dimmerToBrightness', () => {
	it('maps 0 to off', () => expect(dimmerToBrightness(0)).toBe(0))
	it('maps 255 to 100', () => expect(dimmerToBrightness(255)).toBe(100))
	it('never returns 0 when dimmer > 0', () => expect(dimmerToBrightness(1)).toBe(1))
	it('maps mid value', () => expect(dimmerToBrightness(128)).toBe(50))
})

describe('cctToKelvin', () => {
	it('maps 1 to 2000K', () => expect(cctToKelvin(1)).toBe(2000))
	it('maps 255 to 9000K', () => expect(cctToKelvin(255)).toBe(9000))
})

describe('computeTarget precedence', () => {
	it('off when dimmer is 0', () => {
		const t = computeTarget({ ...zero, red: 255 }, 0, mem())
		expect(t.power).toBe(false)
	})

	it('uses RGB when no CCT/macro', () => {
		const t = computeTarget({ ...zero, dimmer: 255, red: 255, green: 10, blue: 5 }, 0, mem())
		expect(t.power).toBe(true)
		expect(t.brightness).toBe(100)
		expect(t.colorMode).toBe('rgb')
		expect([t.r, t.g, t.b]).toEqual([255, 10, 5])
	})

	it('CCT overrides RGB', () => {
		const t = computeTarget({ ...zero, dimmer: 255, red: 255, cct: 255 }, 0, mem())
		expect(t.colorMode).toBe('cct')
		expect(t.kelvin).toBe(9000)
	})

	it('macro overrides CCT and RGB', () => {
		const t = computeTarget({ ...zero, dimmer: 255, red: 0, green: 0, blue: 0, cct: 255, macro: 10 }, 0, mem())
		expect(t.colorMode).toBe('rgb')
		// macro 10 is the first swatch (red)
		expect([t.r, t.g, t.b]).toEqual([255, 0, 0])
	})

	it('strobe blackout forces power off', () => {
		const t = computeTarget({ ...zero, dimmer: 255, red: 255, strobe: 15 }, 0, mem())
		expect(t.power).toBe(false)
	})

	it('strobe open leaves power on', () => {
		const t = computeTarget({ ...zero, dimmer: 255, red: 255, strobe: 5 }, 0, mem())
		expect(t.power).toBe(true)
	})
})
