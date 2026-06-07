import { EventEmitter } from 'node:events'
import type { AppHealth, ArtNetHealth, BulbHealth, HealthLevel, OverallHealth } from '@shared'

export interface HealthDeps {
	getEngineFps(): number
	getArtNetHealth(): ArtNetHealth
	getBulbs(): BulbHealth[]
	getPatchCount(): number
}

/**
 * Periodically samples app/Art-Net/bulb health, emits snapshots, and raises
 * alerts that the orchestrator uses to trigger auto-recovery.
 *
 * Emits: 'health' (OverallHealth), 'alert' ({ scope, message }).
 */
export class HealthMonitor extends EventEmitter {
	private startTime = Date.now()
	private lagSampleTimer: NodeJS.Timeout | null = null
	private buildTimer: NodeJS.Timeout | null = null
	private eventLoopLagMs = 0
	private lastArtnetOk = true

	constructor(private deps: HealthDeps) {
		super()
	}

	start(intervalMs = 1000): void {
		let expected = Date.now() + 500
		this.lagSampleTimer = setInterval(() => {
			const now = Date.now()
			this.eventLoopLagMs = Math.max(0, now - expected)
			expected = now + 500
		}, 500)

		this.buildTimer = setInterval(() => {
			const health = this.getHealth()
			this.emit('health', health)
			this.detectAlerts(health)
		}, intervalMs)
	}

	stop(): void {
		if (this.lagSampleTimer) clearInterval(this.lagSampleTimer)
		if (this.buildTimer) clearInterval(this.buildTimer)
		this.lagSampleTimer = null
		this.buildTimer = null
	}

	getHealth(): OverallHealth {
		const mem = process.memoryUsage()
		const appLevel: HealthLevel = this.eventLoopLagMs > 200 ? 'warn' : 'ok'
		const app: AppHealth = {
			level: appLevel,
			uptimeSec: Math.round((Date.now() - this.startTime) / 1000),
			memoryMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
			eventLoopLagMs: Math.round(this.eventLoopLagMs),
			engineFps: this.deps.getEngineFps(),
		}
		return {
			app,
			artnet: this.deps.getArtNetHealth(),
			bulbs: this.deps.getBulbs(),
			patchCount: this.deps.getPatchCount(),
		}
	}

	private detectAlerts(health: OverallHealth): void {
		const artnetOk = health.artnet.listening
		if (!artnetOk && this.lastArtnetOk) {
			this.emit('alert', { scope: 'artnet', message: 'Art-Net listener is not running' })
		}
		this.lastArtnetOk = artnetOk

		const offlinePatched = health.bulbs.filter((b) => !b.online)
		if (offlinePatched.length > 0) {
			this.emit('alert', { scope: 'bulbs', message: `${offlinePatched.length} bulb(s) offline` })
		}
	}
}
