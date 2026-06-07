import { describe, it, expect, beforeEach } from 'vitest'
import { BulbOutput } from '../src/engine/output'
import type { GoveeTarget } from '../src/engine/mapping'
import type { GoveeLanClient } from '../src/govee/client'

type Call = [string, ...unknown[]]

function fakeClient(calls: Call[]): GoveeLanClient {
	return {
		setPower: (ip: string, on: boolean) => (calls.push(['power', ip, on]), true),
		setBrightness: (ip: string, v: number) => (calls.push(['bri', ip, v]), true),
		setColor: (ip: string, r: number, g: number, b: number) => (calls.push(['rgb', ip, r, g, b]), true),
		setColorTemperature: (ip: string, k: number) => (calls.push(['cct', ip, k]), true),
		requestStatus: () => true,
	} as unknown as GoveeLanClient
}

const on: GoveeTarget = { power: true, brightness: 100, colorMode: 'rgb', r: 255, g: 0, b: 0, kelvin: 0 }

describe('BulbOutput rate limiting & change detection', () => {
	let calls: Call[]
	let out: BulbOutput

	beforeEach(() => {
		calls = []
		out = new BulbOutput(fakeClient(calls), 8) // 8 msg/s -> 125ms min interval
	})

	it('sends power, brightness and color when turning on', () => {
		out.setDesired('1.1.1.1', on)
		out.process(0)
		expect(calls).toEqual([
			['power', '1.1.1.1', true],
			['bri', '1.1.1.1', 100],
			['rgb', '1.1.1.1', 255, 0, 0],
		])
	})

	it('does not resend when nothing changed', () => {
		out.setDesired('1.1.1.1', on)
		out.process(0)
		const count = calls.length
		out.process(1000)
		expect(calls.length).toBe(count)
	})

	it('rate-limits rapid changes', () => {
		out.setDesired('1.1.1.1', on)
		out.process(0)
		const base = calls.length
		out.setDesired('1.1.1.1', { ...on, r: 0, b: 255 })
		out.process(50) // within 125ms window -> blocked
		expect(calls.length).toBe(base)
		out.process(200) // past window -> flush
		expect(calls.length).toBe(base + 1)
		expect(calls[calls.length - 1]).toEqual(['rgb', '1.1.1.1', 0, 0, 255])
	})

	it('only sends power-off when turning off', () => {
		out.setDesired('1.1.1.1', on)
		out.process(0)
		calls.length = 0
		out.setDesired('1.1.1.1', { ...on, power: false })
		out.process(1000)
		expect(calls).toEqual([['power', '1.1.1.1', false]])
	})

	it('sends color temperature in CCT mode', () => {
		out.setDesired('1.1.1.1', { power: true, brightness: 50, colorMode: 'cct', r: 0, g: 0, b: 0, kelvin: 4000 })
		out.process(0)
		expect(calls).toContainEqual(['cct', '1.1.1.1', 4000])
		expect(calls.find((c) => c[0] === 'rgb')).toBeUndefined()
	})
})
