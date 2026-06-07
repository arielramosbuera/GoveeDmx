import dgram from 'node:dgram'
import { EventEmitter } from 'node:events'

/**
 * Govee LAN (WLAN) API client.
 *
 * Protocol summary (Govee "LAN Control" developer guide):
 *  - Discovery request: multicast UDP to 239.255.255.250:4001 with a "scan" command.
 *  - Device responses (scan + status): sent to the multicast group, received on local UDP port 4002.
 *  - Control / status request: unicast UDP to <device-ip>:4003.
 *
 * "LAN Control" must be enabled per-device in the Govee Home app.
 */

export const GOVEE_MULTICAST_ADDR = '239.255.255.250'
export const GOVEE_SEND_SCAN_PORT = 4001
export const GOVEE_RECV_PORT = 4002
export const GOVEE_CONTROL_PORT = 4003

export interface GoveeScanResult {
	ip: string
	device?: string
	sku?: string
	bleVersionHard?: string
	bleVersionSoft?: string
	wifiVersionHard?: string
	wifiVersionSoft?: string
}

export interface GoveeStatusResult {
	ip: string
	onOff?: number
	brightness?: number
	color?: { r: number; g: number; b: number }
	colorTemInKelvin?: number
}

export interface GoveeClientOptions {
	interfaceAddress?: string
}

export interface GoveeLanClientEvents {
	ready: []
	error: [Error]
	device: [GoveeScanResult]
	status: [GoveeStatusResult]
}

export class GoveeLanClient extends EventEmitter {
	private interfaceAddress: string | undefined
	private socket: dgram.Socket | null = null
	bound = false

	constructor(options: GoveeClientOptions = {}) {
		super()
		this.interfaceAddress = options.interfaceAddress || undefined
	}

	start(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.socket) {
				resolve()
				return
			}

			const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
			this.socket = socket

			socket.on('error', (err) => {
				this.emit('error', err)
				if (!this.bound) {
					this.socket = null
					reject(err)
				}
			})

			socket.on('message', (msg, rinfo) => this.handleMessage(msg, rinfo))

			socket.on('listening', () => {
				this.bound = true
				try {
					socket.setBroadcast(true)
					socket.setMulticastTTL(128)
					if (this.interfaceAddress) socket.setMulticastInterface(this.interfaceAddress)
					socket.addMembership(GOVEE_MULTICAST_ADDR, this.interfaceAddress || undefined)
				} catch (err) {
					this.emit('error', err as Error)
				}
				this.emit('ready')
				resolve()
			})

			socket.bind(GOVEE_RECV_PORT, this.interfaceAddress || undefined)
		})
	}

	stop(): void {
		if (this.socket) {
			try {
				this.socket.dropMembership(GOVEE_MULTICAST_ADDR, this.interfaceAddress || undefined)
			} catch {
				// ignore
			}
			try {
				this.socket.close()
			} catch {
				// ignore
			}
			this.socket = null
			this.bound = false
		}
	}

	discover(): void {
		this.sendRaw({ msg: { cmd: 'scan', data: { account_topic: 'reserve' } } }, GOVEE_SEND_SCAN_PORT, GOVEE_MULTICAST_ADDR)
	}

	setPower(ip: string, on: boolean): boolean {
		return this.control(ip, 'turn', { value: on ? 1 : 0 })
	}

	setBrightness(ip: string, value: number): boolean {
		return this.control(ip, 'brightness', { value: clamp(Math.round(value), 0, 100) })
	}

	setColor(ip: string, r: number, g: number, b: number): boolean {
		return this.control(ip, 'colorwc', {
			color: { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) },
			colorTemInKelvin: 0,
		})
	}

	setColorTemperature(ip: string, kelvin: number): boolean {
		return this.control(ip, 'colorwc', {
			color: { r: 0, g: 0, b: 0 },
			colorTemInKelvin: clamp(Math.round(kelvin), 2000, 9000),
		})
	}

	requestStatus(ip: string): boolean {
		return this.control(ip, 'devStatus', {})
	}

	private control(ip: string, cmd: string, data: Record<string, unknown>): boolean {
		if (!ip) return false
		this.sendRaw({ msg: { cmd, data } }, GOVEE_CONTROL_PORT, ip)
		return true
	}

	private sendRaw(payloadObj: unknown, port: number, address: string): void {
		if (!this.socket) {
			this.emit('error', new Error('Govee LAN socket is not started'))
			return
		}
		const buf = Buffer.from(JSON.stringify(payloadObj))
		this.socket.send(buf, 0, buf.length, port, address, (err) => {
			if (err) this.emit('error', err)
		})
	}

	private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
		let parsed: { msg?: { cmd?: string; data?: Record<string, unknown> } }
		try {
			parsed = JSON.parse(msg.toString('utf8'))
		} catch {
			return
		}
		const inner = parsed?.msg
		if (!inner || !inner.cmd) return
		const data = (inner.data || {}) as Record<string, unknown>

		switch (inner.cmd) {
			case 'scan':
				this.emit('device', {
					ip: (data.ip as string) || rinfo.address,
					device: data.device as string,
					sku: data.sku as string,
					bleVersionHard: data.bleVersionHard as string,
					bleVersionSoft: data.bleVersionSoft as string,
					wifiVersionHard: data.wifiVersionHard as string,
					wifiVersionSoft: data.wifiVersionSoft as string,
				})
				break
			case 'devStatus':
				this.emit('status', {
					ip: rinfo.address,
					onOff: data.onOff as number,
					brightness: data.brightness as number,
					color: data.color as { r: number; g: number; b: number },
					colorTemInKelvin: data.colorTemInKelvin as number,
				})
				break
			default:
				break
		}
	}

	// Typed event overloads -------------------------------------------------
	override on<K extends keyof GoveeLanClientEvents>(event: K, listener: (...args: GoveeLanClientEvents[K]) => void): this {
		return super.on(event, listener as (...args: unknown[]) => void)
	}
	override emit<K extends keyof GoveeLanClientEvents>(event: K, ...args: GoveeLanClientEvents[K]): boolean {
		return super.emit(event, ...args)
	}
}

export function clamp(value: number, min: number, max: number): number {
	const n = Number(value)
	if (Number.isNaN(n)) return min
	return Math.min(max, Math.max(min, n))
}
