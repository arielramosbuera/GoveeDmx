import type { GoveeLanClient } from '../govee/client'
import type { GoveeTarget } from './mapping'

interface Pending {
	desired: GoveeTarget
	sent: GoveeTarget | null
	lastFlushMs: number
}

/**
 * Per-bulb, rate-limited Govee output.
 *
 * The engine pushes a desired target for each bulb every tick; this class only
 * sends UDP commands when something actually changed AND the per-bulb minimum
 * interval has elapsed. This protects the bulbs from being flooded at DMX
 * refresh rates (Govee LAN silently drops commands when overloaded).
 */
export class BulbOutput {
	private pending = new Map<string, Pending>()
	private minIntervalMs: number

	constructor(
		private client: GoveeLanClient,
		maxMessagesPerSecond: number,
	) {
		this.minIntervalMs = 1000 / Math.max(1, maxMessagesPerSecond)
	}

	setMaxMessagesPerSecond(mps: number): void {
		this.minIntervalMs = 1000 / Math.max(1, mps)
	}

	setDesired(ip: string, target: GoveeTarget): void {
		const p = this.pending.get(ip)
		if (p) p.desired = target
		else this.pending.set(ip, { desired: target, sent: null, lastFlushMs: Number.NEGATIVE_INFINITY })
	}

	/** Force the next process() to resend full state to a bulb (e.g. after reconnect). */
	forceResend(ip: string): void {
		const p = this.pending.get(ip)
		if (p) p.sent = null
	}

	remove(ip: string): void {
		this.pending.delete(ip)
	}

	/** Called every engine tick. Flushes bulbs whose state changed and are due. */
	process(now: number): void {
		for (const [ip, p] of this.pending) {
			if (!this.needsSend(p)) continue
			if (now - p.lastFlushMs < this.minIntervalMs) continue
			this.flush(ip, p)
			p.lastFlushMs = now
		}
	}

	private needsSend(p: Pending): boolean {
		if (!p.sent) return true
		return !targetsEqual(p.desired, p.sent)
	}

	private flush(ip: string, p: Pending): void {
		const d = p.desired
		const prev = p.sent
		const powerChanged = !prev || prev.power !== d.power
		const turningOn = d.power && (!prev || !prev.power)

		if (powerChanged) this.client.setPower(ip, d.power)

		if (d.power) {
			if (turningOn || !prev || prev.brightness !== d.brightness) {
				this.client.setBrightness(ip, d.brightness)
			}
			if (turningOn || !prev || !colorEqual(prev, d)) {
				if (d.colorMode === 'cct') this.client.setColorTemperature(ip, d.kelvin)
				else this.client.setColor(ip, d.r, d.g, d.b)
			}
		}

		p.sent = { ...d }
	}
}

function colorEqual(a: GoveeTarget, b: GoveeTarget): boolean {
	if (a.colorMode !== b.colorMode) return false
	if (a.colorMode === 'cct') return a.kelvin === b.kelvin
	return a.r === b.r && a.g === b.g && a.b === b.b
}

export function targetsEqual(a: GoveeTarget, b: GoveeTarget): boolean {
	if (a.power !== b.power) return false
	if (!a.power) return true // when off, only power matters
	return a.brightness === b.brightness && colorEqual(a, b)
}
