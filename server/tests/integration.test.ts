import { describe, it, expect } from 'vitest'
import dgram from 'node:dgram'
import { ArtNetInput } from '../src/inputs/artnet'
import { Engine } from '../src/engine/engine'
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

function buildArtDmx(universe: number, data: number[]): Buffer {
	const buf = Buffer.alloc(18 + data.length)
	buf.write('Art-Net\0', 0, 'latin1')
	buf.writeUInt16LE(0x5000, 8)
	buf[11] = 14
	buf[14] = universe & 0xff
	buf[15] = (universe >> 8) & 0x7f
	buf.writeUInt16BE(data.length, 16)
	for (let i = 0; i < data.length; i++) buf[18 + i] = data[i]
	return buf
}

describe('Art-Net -> Engine -> Govee integration', () => {
	it('turns a patched fixture on with the right color', async () => {
		const port = 16000 + Math.floor(Math.random() * 500)
		const input = new ArtNetInput({
			bindAddress: '127.0.0.1',
			port,
			universes: [0],
			enableArtPollReply: false,
			nodeName: 'test',
		})
		const calls: Call[] = []
		const engine = new Engine(fakeClient(calls), 1000)
		engine.setPatch([
			{ id: 'x', name: 'x', mac: '', ip: '9.9.9.9', universe: 0, startAddress: 1, personality: 'rgbcct7' },
		])
		input.on('dmx', (f) => engine.setDmx(f.universe, f.data))

		await input.start()
		const received = new Promise<void>((resolve) => input.once('dmx', () => resolve()))

		const sender = dgram.createSocket('udp4')
		const data = new Array(7).fill(0)
		data[0] = 255 // dimmer
		data[1] = 255 // red
		const pkt = buildArtDmx(0, data)
		await new Promise<void>((resolve, reject) =>
			sender.send(pkt, port, '127.0.0.1', (err) => (err ? reject(err) : resolve())),
		)
		await received

		engine.tick(1000)

		expect(calls).toContainEqual(['power', '9.9.9.9', true])
		expect(calls).toContainEqual(['rgb', '9.9.9.9', 255, 0, 0])

		sender.close()
		input.stop()
		engine.stop()
	})
})
