/**
 * Shared types used by both the backend (server) and the web UI.
 * Keep this file dependency-free so it can be consumed by Node (esbuild) and Vite alike.
 */

export const DMX_UNIVERSE_SIZE = 512

// ---------------------------------------------------------------------------
// Fixture personalities
// ---------------------------------------------------------------------------

export interface ChannelDef {
	/** Zero-based offset from the fixture start address. */
	offset: number
	/** Stable key used by the engine. */
	key: ChannelKey
	/** Human readable name. */
	name: string
	/** Short description / value semantics. */
	description: string
}

export type ChannelKey = 'dimmer' | 'red' | 'green' | 'blue' | 'cct' | 'macro' | 'strobe'

export interface Personality {
	id: string
	name: string
	channelCount: number
	channels: ChannelDef[]
}

/** Default and only personality for iteration 1: Dimmer, R, G, B, CCT, Macro, Strobe. */
export const PERSONALITY_RGBCCT7: Personality = {
	id: 'rgbcct7',
	name: 'RGB + CCT + Macro + Strobe (7ch)',
	channelCount: 7,
	channels: [
		{ offset: 0, key: 'dimmer', name: 'Dimmer', description: '0 = off, 1-255 = master intensity' },
		{ offset: 1, key: 'red', name: 'Red', description: '0-255 red' },
		{ offset: 2, key: 'green', name: 'Green', description: '0-255 green' },
		{ offset: 3, key: 'blue', name: 'Blue', description: '0-255 blue' },
		{ offset: 4, key: 'cct', name: 'Color Temp', description: '0 = use RGB, 1-255 = 2000K-9000K (overrides RGB)' },
		{ offset: 5, key: 'macro', name: 'Macro', description: '0-9 off; presets/effects (overrides color)' },
		{ offset: 6, key: 'strobe', name: 'Strobe', description: '0-9 open; 10-19 blackout; 20-255 strobe slow-fast' },
	],
}

export const PERSONALITIES: Record<string, Personality> = {
	[PERSONALITY_RGBCCT7.id]: PERSONALITY_RGBCCT7,
}

export const DEFAULT_PERSONALITY_ID = PERSONALITY_RGBCCT7.id

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ArtNetConfig {
	/** Local interface IP to bind the Art-Net listener to. '0.0.0.0' = all interfaces. */
	bindAddress: string
	/** UDP port to listen on (Art-Net standard is 6454). */
	port: number
	/** Accept only these universes (Art-Net 15-bit Port-Address). Empty = accept all. */
	universes: number[]
	/** Reply to ArtPoll so consoles can see this bridge as a node. */
	enableArtPollReply: boolean
	/** Short name reported in ArtPollReply. */
	nodeName: string
}

export interface GoveeConfig {
	/** Optional interface IP for Govee multicast (multi-NIC machines). '' = default. */
	interfaceAddress: string
	/** Auto-discover bulbs periodically. */
	autoDiscover: boolean
	/** Discovery interval (seconds, 0 = once at startup). */
	discoverInterval: number
	/** Poll bulb status interval (seconds). */
	pollInterval: number
	/** Maximum control messages per second per bulb (rate limiter). */
	maxMessagesPerSecond: number
}

export interface BulbRef {
	/** Govee device id (MAC-like), stable across IP changes. May be empty for manual entries. */
	mac: string
	/** Last known IP address (used for control). */
	ip: string
	/** SKU / model, if known. */
	sku: string
	/** User-friendly name. */
	name: string
	/** How this bulb entered the system. */
	source: 'discovered' | 'manual'
}

export interface PatchEntry {
	id: string
	name: string
	/** Govee device id (MAC). Empty allowed only for manual IP-only entries. */
	mac: string
	/** IP used for control. */
	ip: string
	/** Art-Net universe (Port-Address). */
	universe: number
	/** 1-based DMX start address. */
	startAddress: number
	/** Personality id. */
	personality: string
}

export interface ServerConfig {
	/** HTTP/web UI port. */
	httpPort: number
}

export interface AppConfig {
	version: number
	server: ServerConfig
	artnet: ArtNetConfig
	govee: GoveeConfig
	bulbs: BulbRef[]
	patch: PatchEntry[]
}

// ---------------------------------------------------------------------------
// Runtime status / health
// ---------------------------------------------------------------------------

export type HealthLevel = 'ok' | 'warn' | 'error' | 'unknown'

export interface AppHealth {
	level: HealthLevel
	uptimeSec: number
	memoryMb: number
	eventLoopLagMs: number
	engineFps: number
}

export interface ArtNetHealth {
	level: HealthLevel
	listening: boolean
	bindAddress: string
	port: number
	totalPackets: number
	universes: ArtNetUniverseStatus[]
	lastError?: string
}

export interface ArtNetUniverseStatus {
	universe: number
	fps: number
	lastPacketMs: number | null
	sourceIp: string | null
}

export interface BulbHealth {
	mac: string
	ip: string
	name: string
	online: boolean
	lastSeenMs: number | null
	power: 'on' | 'off' | 'unknown'
	brightness: number | null
	color: { r: number; g: number; b: number } | null
	colorTempKelvin: number | null
}

export interface OverallHealth {
	app: AppHealth
	artnet: ArtNetHealth
	bulbs: BulbHealth[]
	patchCount: number
}

// ---------------------------------------------------------------------------
// WebSocket protocol (server -> client)
// ---------------------------------------------------------------------------

export interface WsDmxMessage {
	type: 'dmx'
	universe: number
	/** Full 512-channel snapshot (0-255). */
	data: number[]
	fps: number
	sourceIp: string | null
}

export interface WsHealthMessage {
	type: 'health'
	health: OverallHealth
}

export interface WsBulbsMessage {
	type: 'bulbs'
	bulbs: BulbHealth[]
}

export interface WsLogMessage {
	type: 'log'
	level: 'debug' | 'info' | 'warn' | 'error'
	message: string
	timeMs: number
}

export type WsServerMessage = WsDmxMessage | WsHealthMessage | WsBulbsMessage | WsLogMessage

// ---------------------------------------------------------------------------
// REST DTOs
// ---------------------------------------------------------------------------

export interface ManualOverride {
	/** When true, the engine ignores Art-Net for this fixture and uses these values. */
	enabled: boolean
	dimmer: number
	red: number
	green: number
	blue: number
	cct: number
}

export interface ApiResult<T = unknown> {
	ok: boolean
	error?: string
	data?: T
}
