import { describe, it, expect } from 'vitest'
import { findNextAddress, findConflicts, validateAddress, channelSpan } from '../src/patch/patch'
import type { PatchEntry } from '@shared'

function entry(id: string, universe: number, startAddress: number): PatchEntry {
	return { id, name: id, mac: '', ip: `1.1.1.${id}`, universe, startAddress, personality: 'rgbcct7' }
}

describe('channelSpan', () => {
	it('spans 7 channels', () => {
		expect(channelSpan({ startAddress: 1, personality: 'rgbcct7' })).toEqual([1, 7])
	})
})

describe('findNextAddress', () => {
	it('returns 1 for an empty universe', () => {
		expect(findNextAddress([], 0, 'rgbcct7')).toBe(1)
	})
	it('returns 8 after one fixture at address 1', () => {
		expect(findNextAddress([entry('a', 0, 1)], 0, 'rgbcct7')).toBe(8)
	})
	it('fills a gap before a later fixture', () => {
		// fixture at 20; gap 1..7 fits a 7ch fixture
		expect(findNextAddress([entry('a', 0, 20)], 0, 'rgbcct7')).toBe(1)
	})
	it('ignores other universes', () => {
		expect(findNextAddress([entry('a', 1, 1)], 0, 'rgbcct7')).toBe(1)
	})
	it('returns null when universe is full', () => {
		const entries: PatchEntry[] = []
		for (let a = 1; a + 6 <= 512; a += 7) entries.push(entry(`e${a}`, 0, a))
		expect(findNextAddress(entries, 0, 'rgbcct7')).toBeNull()
	})
})

describe('findConflicts', () => {
	it('detects overlap', () => {
		const c = findConflicts([entry('a', 0, 1), entry('b', 0, 4)])
		expect(c.length).toBe(1)
	})
	it('no conflict across universes', () => {
		expect(findConflicts([entry('a', 0, 1), entry('b', 1, 1)])).toEqual([])
	})
	it('no conflict when adjacent', () => {
		expect(findConflicts([entry('a', 0, 1), entry('b', 0, 8)])).toEqual([])
	})
})

describe('validateAddress', () => {
	it('rejects addresses below 1', () => {
		expect(validateAddress('rgbcct7', 0)).toBeTruthy()
	})
	it('rejects addresses that overflow the universe', () => {
		expect(validateAddress('rgbcct7', 510)).toBeTruthy()
	})
	it('accepts a fitting address', () => {
		expect(validateAddress('rgbcct7', 506)).toBeNull()
	})
})
