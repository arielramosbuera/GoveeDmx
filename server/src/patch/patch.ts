import type { PatchEntry } from '@shared'
import { PERSONALITIES, DEFAULT_PERSONALITY_ID, DMX_UNIVERSE_SIZE } from '@shared'

export function channelCount(personalityId: string): number {
	return (PERSONALITIES[personalityId] ?? PERSONALITIES[DEFAULT_PERSONALITY_ID]).channelCount
}

/** Inclusive 1-based [start, end] DMX range a fixture occupies. */
export function channelSpan(entry: Pick<PatchEntry, 'startAddress' | 'personality'>): [number, number] {
	const count = channelCount(entry.personality)
	return [entry.startAddress, entry.startAddress + count - 1]
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return aStart <= bEnd && bStart <= aEnd
}

export interface PatchConflict {
	a: string
	b: string
	universe: number
}

/** Detect fixtures whose DMX ranges overlap within the same universe. */
export function findConflicts(entries: PatchEntry[]): PatchConflict[] {
	const conflicts: PatchConflict[] = []
	for (let i = 0; i < entries.length; i++) {
		for (let j = i + 1; j < entries.length; j++) {
			const a = entries[i]
			const b = entries[j]
			if (a.universe !== b.universe) continue
			const [aS, aE] = channelSpan(a)
			const [bS, bE] = channelSpan(b)
			if (overlaps(aS, aE, bS, bE)) conflicts.push({ a: a.id, b: b.id, universe: a.universe })
		}
	}
	return conflicts
}

/**
 * Find the lowest free 1-based start address in a universe that fits a fixture
 * of the given personality without overlapping existing entries. Returns null
 * if the universe cannot fit it.
 */
export function findNextAddress(entries: PatchEntry[], universe: number, personalityId: string): number | null {
	const count = channelCount(personalityId)
	const occupied = entries
		.filter((e) => e.universe === universe)
		.map((e) => channelSpan(e))
		.sort((a, b) => a[0] - b[0])

	let candidate = 1
	for (const [start, end] of occupied) {
		if (candidate + count - 1 < start) break // fits in the gap before this fixture
		if (candidate <= end) candidate = end + 1
	}
	if (candidate + count - 1 > DMX_UNIVERSE_SIZE) return null
	return candidate
}

export function validateAddress(personalityId: string, startAddress: number): string | null {
	const count = channelCount(personalityId)
	if (startAddress < 1) return 'Start address must be >= 1'
	if (startAddress + count - 1 > DMX_UNIVERSE_SIZE) return `Fixture (${count}ch) does not fit at address ${startAddress}`
	return null
}
