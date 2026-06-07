import { EventEmitter } from 'node:events'
import type { BulbHealth, BulbRef, GoveeConfig } from '@shared'
import { GoveeLanClient } from './client'
import { logger } from '../logger'

interface DeviceState {
	mac: string
	ip: string
	sku: string
	name: string
	source: 'discovered' | 'manual'
	onOff: number | undefined
	brightness: number | undefined
	color: { r: number; g: number; b: number } | undefined
	colorTempKelvin: number | undefined
	lastSeenMs: number | null
}

/**
 * Tracks all known Govee bulbs (discovered + configured), runs discovery and
 * status polling, and exposes a health view. Online status is derived from how
 * recently a device replied.
 */
export class GoveeRegistry extends EventEmitter {
	readonly client: GoveeLanClient
	private devices = new Map<string, DeviceState>() // keyed by ip
	private discoverTimer: NodeJS.Timeout | null = null
	private pollTimer: NodeJS.Timeout | null = null
	private config: GoveeConfig

	constructor(config: GoveeConfig) {
		super()
		this.config = config
		this.client = new GoveeLanClient({ interfaceAddress: config.interfaceAddress || undefined })
		this.client.on('device', (d) => this.onDevice(d))
		this.client.on('status', (s) => this.onStatus(s))
		this.client.on('error', (err) => logger.debug(`Govee socket: ${err.message}`))
	}

	async start(knownBulbs: BulbRef[]): Promise<void> {
		this.seed(knownBulbs)
		await this.client.start()
		logger.info('Govee LAN listener started')
		this.startTimers()
		if (this.config.autoDiscover) this.client.discover()
		this.requestAllStatus()
	}

	stop(): void {
		this.stopTimers()
		this.client.stop()
		this.client.removeAllListeners()
	}

	updateConfig(config: GoveeConfig): void {
		this.config = config
		this.stopTimers()
		this.startTimers()
	}

	seed(bulbs: BulbRef[]): void {
		for (const b of bulbs) {
			if (!b.ip) continue
			if (!this.devices.has(b.ip)) {
				this.devices.set(b.ip, {
					mac: b.mac || '',
					ip: b.ip,
					sku: b.sku || '',
					name: b.name || b.ip,
					source: b.source,
					onOff: undefined,
					brightness: undefined,
					color: undefined,
					colorTempKelvin: undefined,
					lastSeenMs: null,
				})
			}
		}
	}

	discover(): void {
		this.client.discover()
	}

	addManual(ip: string, name?: string): void {
		const existing = this.devices.get(ip)
		this.devices.set(ip, {
			mac: existing?.mac ?? '',
			ip,
			sku: existing?.sku ?? '',
			name: name || existing?.name || ip,
			source: 'manual',
			onOff: existing?.onOff,
			brightness: existing?.brightness,
			color: existing?.color,
			colorTempKelvin: existing?.colorTempKelvin,
			lastSeenMs: existing?.lastSeenMs ?? null,
		})
		this.client.requestStatus(ip)
		this.emit('update')
	}

	resolveIpByMac(mac: string): string | null {
		if (!mac) return null
		for (const d of this.devices.values()) if (d.mac === mac) return d.ip
		return null
	}

	requestAllStatus(): void {
		for (const ip of this.devices.keys()) this.client.requestStatus(ip)
	}

	getBulbs(): BulbHealth[] {
		const threshold = Math.max(3000, this.config.pollInterval * 1000 * 2.5)
		const now = Date.now()
		return [...this.devices.values()].map((d) => ({
			mac: d.mac,
			ip: d.ip,
			name: d.name,
			online: d.lastSeenMs !== null && now - d.lastSeenMs < threshold,
			lastSeenMs: d.lastSeenMs,
			power: d.onOff === 1 ? 'on' : d.onOff === 0 ? 'off' : 'unknown',
			brightness: d.brightness ?? null,
			color: d.color ?? null,
			colorTempKelvin: d.colorTempKelvin ?? null,
		}))
	}

	private onDevice(d: { ip: string; device?: string; sku?: string }): void {
		if (!d.ip) return
		const existing = this.devices.get(d.ip)
		const isNew = !existing
		this.devices.set(d.ip, {
			mac: d.device || existing?.mac || '',
			ip: d.ip,
			sku: d.sku || existing?.sku || '',
			name: existing?.source === 'manual' && existing.name ? existing.name : existing?.name || d.sku || d.ip,
			source: existing?.source === 'manual' ? 'manual' : 'discovered',
			onOff: existing?.onOff,
			brightness: existing?.brightness,
			color: existing?.color,
			colorTempKelvin: existing?.colorTempKelvin,
			lastSeenMs: Date.now(),
		})
		if (isNew) {
			logger.info(`Discovered Govee ${d.sku || ''} at ${d.ip} (${d.device || 'unknown'})`)
			this.client.requestStatus(d.ip)
		}
		this.emit('update')
	}

	private onStatus(s: {
		ip: string
		onOff?: number
		brightness?: number
		color?: { r: number; g: number; b: number }
		colorTemInKelvin?: number
	}): void {
		let dev = this.devices.get(s.ip)
		if (!dev) {
			dev = {
				mac: '',
				ip: s.ip,
				sku: '',
				name: s.ip,
				source: 'discovered',
				onOff: undefined,
				brightness: undefined,
				color: undefined,
				colorTempKelvin: undefined,
				lastSeenMs: null,
			}
			this.devices.set(s.ip, dev)
		}
		dev.onOff = s.onOff
		dev.brightness = s.brightness
		dev.color = s.color
		dev.colorTempKelvin = s.colorTemInKelvin
		dev.lastSeenMs = Date.now()
		this.emit('update')
	}

	private startTimers(): void {
		if (this.config.autoDiscover && this.config.discoverInterval > 0) {
			this.discoverTimer = setInterval(() => this.client.discover(), this.config.discoverInterval * 1000)
		}
		const pollMs = Math.max(1, this.config.pollInterval) * 1000
		this.pollTimer = setInterval(() => this.requestAllStatus(), pollMs)
	}

	private stopTimers(): void {
		if (this.discoverTimer) clearInterval(this.discoverTimer)
		if (this.pollTimer) clearInterval(this.pollTimer)
		this.discoverTimer = null
		this.pollTimer = null
	}
}
