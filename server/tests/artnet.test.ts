import { describe, it, expect } from 'vitest'
import { parseArtDmx, readArtNetOpcode } from '../src/inputs/artnet'

export function buildArtDmx(universe: number, data: number[]): Buffer {
	const buf = Buffer.alloc(18 + data.length)
	buf.write('Art-Net\0', 0, 'latin1')
	buf.writeUInt16LE(0x5000, 8)
	buf[10] = 0
	buf[11] = 14 // protocol version 14
	buf[12] = 0 // sequence
	buf[13] = 0 // physical
	buf[14] = universe & 0xff
	buf[15] = (universe >> 8) & 0x7f
	buf.writeUInt16BE(data.length, 16)
	for (let i = 0; i < data.length; i++) buf[18 + i] = data[i]
	return buf
}

describe('readArtNetOpcode', () => {
	it('rejects non Art-Net packets', () => {
		expect(readArtNetOpcode(Buffer.from('hello world!!'))).toBeNull()
	})
	it('reads the ArtDmx opcode', () => {
		expect(readArtNetOpcode(buildArtDmx(0, [1, 2, 3]))).toBe(0x5000)
	})
})

describe('parseArtDmx', () => {
	it('parses universe and data', () => {
		const parsed = parseArtDmx(buildArtDmx(0, [255, 128, 0, 1]))
		expect(parsed).not.toBeNull()
		expect(parsed!.universe).toBe(0)
		expect(parsed!.data[0]).toBe(255)
		expect(parsed!.data[1]).toBe(128)
		expect(parsed!.data.length).toBe(512)
	})

	it('decodes a 15-bit universe (net + subnet + universe)', () => {
		// net=1, subnet/universe low byte = 2 -> 0x102 = 258
		const parsed = parseArtDmx(buildArtDmx(258, [0]))
		expect(parsed!.universe).toBe(258)
	})

	it('returns null for invalid packets', () => {
		expect(parseArtDmx(Buffer.from('not artnet'))).toBeNull()
	})

	it('clamps oversized length to 512', () => {
		const buf = buildArtDmx(0, new Array(512).fill(7))
		const parsed = parseArtDmx(buf)
		expect(parsed!.data.length).toBe(512)
		expect(parsed!.data[511]).toBe(7)
	})
})
