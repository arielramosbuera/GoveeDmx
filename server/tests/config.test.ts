import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ConfigStore, defaultConfig } from '../src/config/store'

const tmpFiles: string[] = []
function tmpPath(): string {
	const p = path.join(os.tmpdir(), `goveedmx-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
	tmpFiles.push(p)
	return p
}

afterEach(() => {
	for (const f of tmpFiles.splice(0)) {
		try {
			fs.rmSync(f, { force: true })
		} catch {
			// ignore
		}
	}
})

describe('defaultConfig', () => {
	it('has sane defaults', () => {
		const c = defaultConfig()
		expect(c.server.httpPort).toBe(8080)
		expect(c.artnet.port).toBe(6454)
		expect(c.govee.maxMessagesPerSecond).toBe(8)
	})
})

describe('ConfigStore', () => {
	it('creates defaults when no file exists', () => {
		const file = tmpPath()
		const store = new ConfigStore(file)
		const cfg = store.load()
		expect(cfg.server.httpPort).toBe(8080)
		expect(fs.existsSync(file)).toBe(true)
	})

	it('persists updates and reloads them', () => {
		const file = tmpPath()
		const store = new ConfigStore(file)
		store.load()
		store.update({ server: { httpPort: 9123 } })

		const store2 = new ConfigStore(file)
		const cfg = store2.load()
		expect(cfg.server.httpPort).toBe(9123)
	})

	it('falls back to defaults on corrupt file', () => {
		const file = tmpPath()
		fs.writeFileSync(file, '{ not valid json')
		const store = new ConfigStore(file)
		const cfg = store.load()
		expect(cfg.server.httpPort).toBe(8080)
	})

	it('fills missing fields from partial config', () => {
		const file = tmpPath()
		fs.writeFileSync(file, JSON.stringify({ server: { httpPort: 7000 } }))
		const store = new ConfigStore(file)
		const cfg = store.load()
		expect(cfg.server.httpPort).toBe(7000)
		expect(cfg.artnet.port).toBe(6454) // filled by schema default
	})
})
