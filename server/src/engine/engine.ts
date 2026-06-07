import type { GoveeLanClient } from '../govee/client'
import type { ManualOverride, PatchEntry } from '@shared'
import { PERSONALITIES, DMX_UNIVERSE_SIZE } from '@shared'
import { BulbOutput } from './output'
import { computeTarget, type ChannelValues, type MacroMemory } from './mapping'
import { newMacroState } from './macros'

const TICK_HZ = 40

interface FixtureRuntime {
	entry: PatchEntry
	memory: MacroMemory
}

/**
 * The mapping engine: reads the latest DMX values for each patched fixture,
 * computes the desired Govee output via the fixture personality, and pushes it
 * to the rate-limited output. Runs at a fixed tick so software effects
 * (macros/strobe) evolve smoothly.
 */
export class Engine {
	private output: BulbOutput
	private buffers = new Map<number, Uint8Array>()
	private fixtures: FixtureRuntime[] = []
	private overrides = new Map<string, ManualOverride>()
	private timer: NodeJS.Timeout | null = null
	private tickTimes: number[] = []

	constructor(
		client: GoveeLanClient,
		maxMessagesPerSecond: number,
	) {
		this.output = new BulbOutput(client, maxMessagesPerSecond)
	}

	start(): void {
		if (this.timer) return
		this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ)
	}

	/** Run a single engine tick. Exposed for deterministic testing. */
	tick(now: number = Date.now()): void {
		this.tickTimes.push(now)
		const cutoff = now - 1000
		while (this.tickTimes.length && this.tickTimes[0] < cutoff) this.tickTimes.shift()

		for (const fixture of this.fixtures) {
			const channels = this.readChannels(fixture)
			const target = computeTarget(channels, now, fixture.memory)
			if (fixture.entry.ip) this.output.setDesired(fixture.entry.ip, target)
		}
		this.output.process(now)
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer)
		this.timer = null
	}

	setMaxMessagesPerSecond(mps: number): void {
		this.output.setMaxMessagesPerSecond(mps)
	}

	setDmx(universe: number, data: Uint8Array): void {
		this.buffers.set(universe, data)
	}

	setPatch(entries: PatchEntry[]): void {
		const prev = new Map(this.fixtures.map((f) => [f.entry.id, f.memory]))
		this.fixtures = entries.map((entry) => ({
			entry,
			memory: prev.get(entry.id) ?? (newMacroState() as MacroMemory),
		}))
		// Drop output state for IPs no longer patched.
		const activeIps = new Set(entries.map((e) => e.ip))
		for (const ip of this.knownIps()) if (!activeIps.has(ip)) this.output.remove(ip)
	}

	setOverride(fixtureId: string, override: ManualOverride): void {
		if (override.enabled) this.overrides.set(fixtureId, override)
		else this.overrides.delete(fixtureId)
	}

	getOverride(fixtureId: string): ManualOverride | undefined {
		return this.overrides.get(fixtureId)
	}

	forceResend(ip: string): void {
		this.output.forceResend(ip)
	}

	getFps(): number {
		return this.tickTimes.length
	}

	private knownIps(): string[] {
		return [...new Set(this.fixtures.map((f) => f.entry.ip))]
	}

	private readChannels(fixture: FixtureRuntime): ChannelValues {
		const override = this.overrides.get(fixture.entry.id)
		if (override?.enabled) {
			return {
				dimmer: override.dimmer,
				red: override.red,
				green: override.green,
				blue: override.blue,
				cct: override.cct,
				macro: 0,
				strobe: 0,
			}
		}

		const personality = PERSONALITIES[fixture.entry.personality] ?? PERSONALITIES.rgbcct7
		const buf = this.buffers.get(fixture.entry.universe)
		const base = fixture.entry.startAddress - 1
		const read = (offset: number): number => {
			if (!buf) return 0
			const idx = base + offset
			if (idx < 0 || idx >= DMX_UNIVERSE_SIZE) return 0
			return buf[idx] ?? 0
		}
		const get = (key: string): number => {
			const ch = personality.channels.find((c) => c.key === key)
			return ch ? read(ch.offset) : 0
		}
		return {
			dimmer: get('dimmer'),
			red: get('red'),
			green: get('green'),
			blue: get('blue'),
			cct: get('cct'),
			macro: get('macro'),
			strobe: get('strobe'),
		}
	}
}
