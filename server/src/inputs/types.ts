import type { EventEmitter } from 'node:events'

export interface DmxFrame {
	universe: number
	/** 512 channel values (0-255). */
	data: Uint8Array
	sourceIp: string
}

/**
 * A DMX input source. Iteration 1 implements Art-Net; future sources
 * (USB-DMX dongles, OSC) implement this same contract so the engine and
 * the rest of the app are transport-agnostic.
 *
 * Emits: 'dmx' (DmxFrame), 'error' (Error).
 */
export interface InputSource extends EventEmitter {
	readonly kind: string
	start(): Promise<void>
	stop(): void
}
