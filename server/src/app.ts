import { randomUUID } from 'node:crypto'
import type { AppConfig, BulbHealth, ManualOverride, OverallHealth, PatchEntry } from '@shared'
import { DEFAULT_PERSONALITY_ID } from '@shared'
import { ConfigStore } from './config/store'
import { GoveeRegistry } from './govee/registry'
import { ArtNetInput } from './inputs/artnet'
import { Engine } from './engine/engine'
import { HealthMonitor } from './health/health'
import { findConflicts, findNextAddress, validateAddress } from './patch/patch'
import { logger } from './logger'
import type { WsHub } from './api/ws'

export interface AddPatchInput {
	mac?: string
	ip?: string
	name?: string
	universe?: number
	startAddress?: number
	personality?: string
}

/**
 * Central orchestrator. Owns the config, Govee registry, Art-Net input, engine,
 * and health monitor, and exposes the operations the REST API calls.
 */
export class App {
	readonly config: ConfigStore
	readonly registry: GoveeRegistry
	readonly artnet: ArtNetInput
	readonly engine: Engine
	readonly health: HealthMonitor
	private hub: WsHub | null = null
	private wsLastDmxMs = new Map<number, number>()
	private patchResolveTimer: NodeJS.Timeout | null = null
	private lastArtnetRecoverMs = 0
	private lastDiscoverRecoverMs = 0

	constructor(configStore: ConfigStore) {
		this.config = configStore
		const cfg = this.config.get()
		this.registry = new GoveeRegistry(cfg.govee)
		this.artnet = new ArtNetInput(cfg.artnet)
		this.engine = new Engine(this.registry.client, cfg.govee.maxMessagesPerSecond)
		this.health = new HealthMonitor({
			getEngineFps: () => this.engine.getFps(),
			getArtNetHealth: () => this.artnet.getStatus(),
			getBulbs: () => this.registry.getBulbs(),
			getPatchCount: () => this.config.get().patch.length,
		})
		this.wireEvents()
	}

	attachHub(hub: WsHub): void {
		this.hub = hub
	}

	async start(): Promise<void> {
		const cfg = this.config.get()
		await this.registry.start(cfg.bulbs)
		try {
			await this.artnet.start()
		} catch (err) {
			logger.error(`Art-Net failed to start: ${(err as Error).message}`)
		}
		this.engine.start()
		this.resolvePatch()
		this.health.start(1000)
		this.patchResolveTimer = setInterval(() => this.resolvePatch(), 2000)
	}

	async stop(): Promise<void> {
		if (this.patchResolveTimer) clearInterval(this.patchResolveTimer)
		this.health.stop()
		this.engine.stop()
		this.artnet.stop()
		this.registry.stop()
	}

	private wireEvents(): void {
		this.artnet.on('dmx', (frame) => {
			this.engine.setDmx(frame.universe, frame.data)
			this.broadcastDmx(frame.universe, frame.data, frame.sourceIp)
		})
		this.artnet.on('error', (err) => logger.debug(`Art-Net: ${err.message}`))

		this.registry.on('update', () => {
			this.resolvePatch()
			this.hub?.broadcast({ type: 'bulbs', bulbs: this.registry.getBulbs() })
		})

		this.health.on('health', (health: OverallHealth) => {
			this.hub?.broadcast({ type: 'health', health })
		})
		this.health.on('alert', (alert: { scope: string; message: string }) => this.handleAlert(alert))

		logger.on('log', (entry) => {
			this.hub?.broadcast({ type: 'log', level: entry.level, message: entry.message, timeMs: entry.timeMs })
		})
	}

	private handleAlert(alert: { scope: string; message: string }): void {
		const now = Date.now()
		if (alert.scope === 'artnet' && now - this.lastArtnetRecoverMs > 5000) {
			this.lastArtnetRecoverMs = now
			logger.warn(`Auto-recovery: restarting Art-Net listener (${alert.message})`)
			this.artnet.stop()
			this.artnet.start().catch((err) => logger.error(`Art-Net restart failed: ${(err as Error).message}`))
		}
		if (alert.scope === 'bulbs' && now - this.lastDiscoverRecoverMs > 10000) {
			this.lastDiscoverRecoverMs = now
			logger.info('Auto-recovery: re-running Govee discovery for offline bulbs')
			this.registry.discover()
		}
	}

	private broadcastDmx(universe: number, data: Uint8Array, sourceIp: string): void {
		const now = Date.now()
		const last = this.wsLastDmxMs.get(universe) ?? 0
		if (now - last < 40) return // throttle to ~25 fps to the UI
		this.wsLastDmxMs.set(universe, now)
		const status = this.artnet.getStatus().universes.find((u) => u.universe === universe)
		this.hub?.broadcast({
			type: 'dmx',
			universe,
			data: Array.from(data),
			fps: status?.fps ?? 0,
			sourceIp,
		})
	}

	/** Resolve patch entries' IPs (via MAC if known) and push to the engine. */
	resolvePatch(): void {
		const entries = this.config.get().patch.map((e) => {
			const ip = e.mac ? this.registry.resolveIpByMac(e.mac) || e.ip : e.ip
			return { ...e, ip }
		})
		this.engine.setPatch(entries)
	}

	// --- Config operations -------------------------------------------------

	updateArtNet(partial: Partial<AppConfig['artnet']>): AppConfig {
		const cfg = this.config.update({ artnet: { ...this.config.get().artnet, ...partial } })
		this.artnet.updateConfig(cfg.artnet)
		this.artnet.stop()
		this.artnet.start().catch((err) => logger.error(`Art-Net restart failed: ${(err as Error).message}`))
		return cfg
	}

	updateGovee(partial: Partial<AppConfig['govee']>): AppConfig {
		const cfg = this.config.update({ govee: { ...this.config.get().govee, ...partial } })
		this.registry.updateConfig(cfg.govee)
		this.engine.setMaxMessagesPerSecond(cfg.govee.maxMessagesPerSecond)
		return cfg
	}

	// --- Bulb operations ---------------------------------------------------

	scan(): void {
		this.registry.discover()
	}

	getBulbs(): BulbHealth[] {
		return this.registry.getBulbs()
	}

	addManualBulb(ip: string, name?: string): void {
		this.registry.addManual(ip, name)
		this.attachBulb(ip, name)
	}

	attachBulb(ip: string, name?: string): AppConfig {
		const state = this.registry.getBulbs().find((b) => b.ip === ip)
		const bulbs = [...this.config.get().bulbs.filter((b) => b.ip !== ip)]
		bulbs.push({
			mac: state?.mac ?? '',
			ip,
			sku: '',
			name: name || state?.name || ip,
			source: 'manual',
		})
		const cfg = this.config.update({ bulbs })
		this.registry.seed(cfg.bulbs)
		return cfg
	}

	detachBulb(ip: string): AppConfig {
		const bulbs = this.config.get().bulbs.filter((b) => b.ip !== ip)
		return this.config.update({ bulbs })
	}

	/** One-shot direct control for commissioning a bulb (bypasses the engine). */
	testBulb(ip: string, opts: { power?: boolean; brightness?: number; r?: number; g?: number; b?: number; kelvin?: number }): void {
		if (opts.power === false) {
			this.registry.client.setPower(ip, false)
			return
		}
		this.registry.client.setPower(ip, true)
		if (typeof opts.brightness === 'number') this.registry.client.setBrightness(ip, opts.brightness)
		if (typeof opts.kelvin === 'number' && opts.kelvin > 0) {
			this.registry.client.setColorTemperature(ip, opts.kelvin)
		} else if (typeof opts.r === 'number') {
			this.registry.client.setColor(ip, opts.r ?? 0, opts.g ?? 0, opts.b ?? 0)
		}
		this.registry.client.requestStatus(ip)
	}

	// --- Patch operations --------------------------------------------------

	listPatch(): { entries: PatchEntry[]; conflicts: ReturnType<typeof findConflicts> } {
		const entries = this.config.get().patch
		return { entries, conflicts: findConflicts(entries) }
	}

	addPatch(input: AddPatchInput): { ok: boolean; error?: string; entry?: PatchEntry } {
		const personality = input.personality || DEFAULT_PERSONALITY_ID
		const ip = input.mac ? this.registry.resolveIpByMac(input.mac) || input.ip || '' : input.ip || ''
		if (!ip && !input.mac) return { ok: false, error: 'A bulb IP or MAC is required' }

		const universe = input.universe ?? this.config.get().artnet.universes[0] ?? 0
		const existing = this.config.get().patch

		let startAddress = input.startAddress
		if (startAddress == null) {
			const next = findNextAddress(existing, universe, personality)
			if (next == null) return { ok: false, error: `Universe ${universe} has no free space for this fixture` }
			startAddress = next
		} else {
			const err = validateAddress(personality, startAddress)
			if (err) return { ok: false, error: err }
		}

		const entry: PatchEntry = {
			id: randomUUID(),
			name: input.name || ip || input.mac || 'Fixture',
			mac: input.mac || '',
			ip,
			universe,
			startAddress,
			personality,
		}
		const patch = [...existing, entry]
		this.config.update({ patch })
		this.resolvePatch()
		return { ok: true, entry }
	}

	updatePatch(id: string, partial: Partial<PatchEntry>): { ok: boolean; error?: string; entry?: PatchEntry } {
		const patch = this.config.get().patch.slice()
		const idx = patch.findIndex((e) => e.id === id)
		if (idx < 0) return { ok: false, error: 'Patch entry not found' }
		const merged = { ...patch[idx], ...partial, id }
		const err = validateAddress(merged.personality, merged.startAddress)
		if (err) return { ok: false, error: err }
		patch[idx] = merged
		this.config.update({ patch })
		this.resolvePatch()
		return { ok: true, entry: merged }
	}

	removePatch(id: string): AppConfig {
		const patch = this.config.get().patch.filter((e) => e.id !== id)
		const cfg = this.config.update({ patch })
		this.resolvePatch()
		return cfg
	}

	setOverride(fixtureId: string, override: ManualOverride): { ok: boolean; error?: string } {
		const entry = this.config.get().patch.find((e) => e.id === fixtureId)
		if (!entry) return { ok: false, error: 'Patch entry not found' }
		this.engine.setOverride(fixtureId, override)
		return { ok: true }
	}

	getHealth(): OverallHealth {
		return this.health.getHealth()
	}
}
