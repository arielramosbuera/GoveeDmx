import dgram from 'node:dgram'
import { EventEmitter } from 'node:events'
import type { ArtNetConfig, ArtNetHealth, ArtNetUniverseStatus } from '@shared'
import { DMX_UNIVERSE_SIZE } from '@shared'
import type { DmxFrame, InputSource } from './types'
import { getLocalIPv4 } from '../util/net'
import { logger } from '../logger'

const ARTNET_HEADER = 'Art-Net\0'
const OP_POLL = 0x2000
const OP_POLL_REPLY = 0x2100
const OP_DMX = 0x5000
const ARTNET_PORT = 0x1936 // 6454

export interface ParsedDmx {
	universe: number
	data: Uint8Array
}

/** Read and validate the Art-Net opcode. Returns null if not a valid Art-Net packet. */
export function readArtNetOpcode(msg: Buffer): number | null {
	if (msg.length < 10) return null
	if (msg.toString('latin1', 0, 8) !== ARTNET_HEADER) return null
	return msg.readUInt16LE(8)
}

/** Parse an ArtDmx packet into a 15-bit universe + 512-byte data array. */
export function parseArtDmx(msg: Buffer): ParsedDmx | null {
	if (readArtNetOpcode(msg) !== OP_DMX) return null
	if (msg.length < 18) return null
	const universe = (msg.readUInt8(15) << 8) | msg.readUInt8(14)
	const length = msg.readUInt16BE(16)
	const dataLen = Math.min(length, msg.length - 18, DMX_UNIVERSE_SIZE)
	const data = new Uint8Array(DMX_UNIVERSE_SIZE)
	for (let i = 0; i < dataLen; i++) data[i] = msg.readUInt8(18 + i)
	return { universe, data }
}

interface UniverseStat {
	packetTimes: number[]
	lastPacketMs: number | null
	sourceIp: string | null
}

/**
 * Art-Net input source. Listens for ArtDmx packets and (optionally) answers
 * ArtPoll with an ArtPollReply so lighting consoles can discover the bridge.
 */
export class ArtNetInput extends EventEmitter implements InputSource {
	readonly kind = 'artnet'
	private socket: dgram.Socket | null = null
	private config: ArtNetConfig
	private stats = new Map<number, UniverseStat>()
	private totalPackets = 0
	private listening = false
	private lastError: string | undefined

	constructor(config: ArtNetConfig) {
		super()
		this.config = config
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
				this.lastError = err.message
				this.emit('error', err)
				if (!this.listening) {
					this.socket = null
					reject(err)
				}
			})
			socket.on('message', (msg, rinfo) => this.handleMessage(msg, rinfo))
			socket.on('listening', () => {
				this.listening = true
				try {
					socket.setBroadcast(true)
				} catch {
					// ignore
				}
				logger.info(`Art-Net listening on ${this.config.bindAddress}:${this.config.port}`)
				resolve()
			})
			socket.bind(this.config.port, this.config.bindAddress === '0.0.0.0' ? undefined : this.config.bindAddress)
		})
	}

	stop(): void {
		this.listening = false
		if (this.socket) {
			try {
				this.socket.close()
			} catch {
				// ignore
			}
			this.socket = null
		}
	}

	private accepts(universe: number): boolean {
		if (!this.config.universes || this.config.universes.length === 0) return true
		return this.config.universes.includes(universe)
	}

	private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
		const opcode = readArtNetOpcode(msg)
		if (opcode === null) return

		if (opcode === OP_DMX) {
			const parsed = parseArtDmx(msg)
			if (!parsed) return
			if (!this.accepts(parsed.universe)) return
			this.recordPacket(parsed.universe, rinfo.address)
			const frame: DmxFrame = { universe: parsed.universe, data: parsed.data, sourceIp: rinfo.address }
			this.emit('dmx', frame)
		} else if (opcode === OP_POLL && this.config.enableArtPollReply) {
			this.sendPollReply(rinfo.address)
		}
	}

	private recordPacket(universe: number, sourceIp: string): void {
		this.totalPackets++
		let stat = this.stats.get(universe)
		if (!stat) {
			stat = { packetTimes: [], lastPacketMs: null, sourceIp: null }
			this.stats.set(universe, stat)
		}
		const now = Date.now()
		stat.packetTimes.push(now)
		// keep only the last second for FPS
		const cutoff = now - 1000
		while (stat.packetTimes.length && stat.packetTimes[0] < cutoff) stat.packetTimes.shift()
		stat.lastPacketMs = now
		stat.sourceIp = sourceIp
	}

	private sendPollReply(targetIp: string): void {
		if (!this.socket) return
		const ip = getLocalIPv4(this.config.bindAddress)
		const buf = Buffer.alloc(239)
		buf.write(ARTNET_HEADER, 0, 'latin1')
		buf.writeUInt16LE(OP_POLL_REPLY, 8)
		const ipParts = ip.split('.').map((n) => parseInt(n, 10) || 0)
		buf[10] = ipParts[0]
		buf[11] = ipParts[1]
		buf[12] = ipParts[2]
		buf[13] = ipParts[3]
		buf.writeUInt16LE(ARTNET_PORT, 14)
		buf[16] = 0 // VersInfoH
		buf[17] = 1 // VersInfoL
		buf[18] = 0 // NetSwitch
		buf[19] = 0 // SubSwitch
		buf[20] = 0 // OemHi
		buf[21] = 0 // OemLo
		buf[22] = 0 // Ubea
		buf[23] = 0xd2 // Status1: node running, indicators normal
		buf.writeUInt16LE(0, 24) // EstaMan
		const shortName = this.config.nodeName.slice(0, 17)
		buf.write(shortName, 26, 'latin1')
		buf.write(`${this.config.nodeName} (GoveeDMX bridge)`.slice(0, 63), 44, 'latin1')
		buf.write('GoveeDMX node ready', 108, 'latin1') // NodeReport
		buf.writeUInt16BE(1, 172) // NumPortsHi/Lo -> 1 port
		buf[174] = 0xc0 // PortType[0]: input + DMX512
		buf[182] = 0x80 // GoodInput[0]: data received

		this.socket.send(buf, 0, buf.length, ARTNET_PORT, targetIp, (err) => {
			if (err) logger.debug(`ArtPollReply send failed: ${err.message}`)
		})
	}

	updateConfig(config: ArtNetConfig): void {
		this.config = config
	}

	getStatus(): ArtNetHealth {
		const universes: ArtNetUniverseStatus[] = [...this.stats.entries()].map(([universe, stat]) => ({
			universe,
			fps: stat.packetTimes.length,
			lastPacketMs: stat.lastPacketMs,
			sourceIp: stat.sourceIp,
		}))
		const anyRecent = universes.some((u) => u.lastPacketMs !== null && Date.now() - u.lastPacketMs < 3000)
		return {
			level: !this.listening ? 'error' : anyRecent ? 'ok' : 'warn',
			listening: this.listening,
			bindAddress: this.config.bindAddress,
			port: this.config.port,
			totalPackets: this.totalPackets,
			universes,
			lastError: this.lastError,
		}
	}
}
