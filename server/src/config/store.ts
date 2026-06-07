import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { z } from 'zod'
import type { AppConfig } from '@shared'
import { DEFAULT_PERSONALITY_ID } from '@shared'
import { getConfigPath } from '../paths'
import { logger } from '../logger'

const CONFIG_VERSION = 1

const bulbSchema = z.object({
	mac: z.string().default(''),
	ip: z.string(),
	sku: z.string().default(''),
	name: z.string().default(''),
	source: z.enum(['discovered', 'manual']).default('manual'),
})

const patchSchema = z.object({
	id: z.string(),
	name: z.string().default(''),
	mac: z.string().default(''),
	ip: z.string(),
	universe: z.number().int().min(0).max(32767).default(0),
	startAddress: z.number().int().min(1).max(512).default(1),
	personality: z.string().default(DEFAULT_PERSONALITY_ID),
})

const configSchema = z.object({
	version: z.number().int().default(CONFIG_VERSION),
	server: z
		.object({
			httpPort: z.number().int().min(1).max(65535).default(8080),
		})
		.default({ httpPort: 8080 }),
	artnet: z
		.object({
			bindAddress: z.string().default('0.0.0.0'),
			port: z.number().int().min(1).max(65535).default(6454),
			universes: z.array(z.number().int().min(0).max(32767)).default([0]),
			enableArtPollReply: z.boolean().default(true),
			nodeName: z.string().default('GoveeDMX'),
		})
		.default({ bindAddress: '0.0.0.0', port: 6454, universes: [0], enableArtPollReply: true, nodeName: 'GoveeDMX' }),
	govee: z
		.object({
			interfaceAddress: z.string().default(''),
			autoDiscover: z.boolean().default(true),
			discoverInterval: z.number().int().min(0).max(3600).default(60),
			pollInterval: z.number().int().min(1).max(600).default(5),
			maxMessagesPerSecond: z.number().min(1).max(40).default(8),
		})
		.default({ interfaceAddress: '', autoDiscover: true, discoverInterval: 60, pollInterval: 5, maxMessagesPerSecond: 8 }),
	bulbs: z.array(bulbSchema).default([]),
	patch: z.array(patchSchema).default([]),
})

export function defaultConfig(): AppConfig {
	return configSchema.parse({}) as AppConfig
}

export class ConfigStore extends EventEmitter {
	private config: AppConfig
	private readonly filePath: string

	constructor(filePath: string = getConfigPath()) {
		super()
		this.filePath = filePath
		this.config = defaultConfig()
	}

	get path(): string {
		return this.filePath
	}

	get(): AppConfig {
		return this.config
	}

	load(): AppConfig {
		try {
			if (!fs.existsSync(this.filePath)) {
				logger.info(`No config found, creating defaults at ${this.filePath}`)
				this.save()
				return this.config
			}
			const raw = fs.readFileSync(this.filePath, 'utf8')
			const parsed = JSON.parse(raw)
			const migrated = this.migrate(parsed)
			this.config = configSchema.parse(migrated) as AppConfig
			logger.info(`Loaded config from ${this.filePath}`)
		} catch (err) {
			logger.error(`Failed to load config, using defaults: ${(err as Error).message}`)
			this.config = defaultConfig()
		}
		return this.config
	}

	/** Apply a partial update (deep-merged at the top level) and persist. */
	update(partial: Partial<AppConfig>): AppConfig {
		const merged = {
			...this.config,
			...partial,
			server: { ...this.config.server, ...(partial.server ?? {}) },
			artnet: { ...this.config.artnet, ...(partial.artnet ?? {}) },
			govee: { ...this.config.govee, ...(partial.govee ?? {}) },
			bulbs: partial.bulbs ?? this.config.bulbs,
			patch: partial.patch ?? this.config.patch,
		}
		this.config = configSchema.parse(merged) as AppConfig
		this.save()
		this.emit('change', this.config)
		return this.config
	}

	save(): void {
		try {
			fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
			const tmp = `${this.filePath}.tmp`
			fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2))
			fs.renameSync(tmp, this.filePath)
		} catch (err) {
			logger.error(`Failed to save config: ${(err as Error).message}`)
		}
	}

	private migrate(input: unknown): unknown {
		// Placeholder for future schema migrations keyed on `version`.
		if (input && typeof input === 'object') {
			const obj = input as Record<string, unknown>
			if (typeof obj.version !== 'number') obj.version = CONFIG_VERSION
			return obj
		}
		return input
	}
}
