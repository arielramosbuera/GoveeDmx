import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { WebSocket } from 'ws'
import { ConfigStore } from '../src/config/store'
import { App } from '../src/app'
import { createHttpServer } from '../src/api/http'
import { WsHub } from '../src/api/ws'

let server: http.Server
let app: App
let baseUrl: string
let configFile: string

beforeAll(async () => {
	configFile = path.join(os.tmpdir(), `goveedmx-api-${Date.now()}.json`)
	const store = new ConfigStore(configFile)
	store.load()
	app = new App(store)
	server = createHttpServer(app, path.join(os.tmpdir(), 'goveedmx-nostatic'))
	const hub = new WsHub(server, app)
	app.attachHub(hub)
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
	const addr = server.address() as { port: number }
	baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()))
	try {
		fs.rmSync(configFile, { force: true })
	} catch {
		// ignore
	}
})

async function json(method: string, p: string, body?: unknown): Promise<{ status: number; data: any }> {
	const res = await fetch(baseUrl + p, {
		method,
		headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	})
	const text = await res.text()
	return { status: res.status, data: text ? JSON.parse(text) : undefined }
}

describe('REST API', () => {
	it('returns health', async () => {
		const { status, data } = await json('GET', '/api/health')
		expect(status).toBe(200)
		expect(data.app).toBeDefined()
		expect(data.artnet).toBeDefined()
	})

	it('returns config and personalities', async () => {
		expect((await json('GET', '/api/config')).data.server.httpPort).toBe(8080)
		expect((await json('GET', '/api/personalities')).data.rgbcct7).toBeDefined()
	})

	it('adds a manual bulb and patches it (auto address)', async () => {
		await json('POST', '/api/bulbs/manual', { ip: '10.0.0.5', name: 'Bulb A' })
		const bulbs = (await json('GET', '/api/bulbs')).data
		expect(bulbs.some((b: any) => b.ip === '10.0.0.5')).toBe(true)

		const add = await json('POST', '/api/patch', { ip: '10.0.0.5', name: 'Fix A', universe: 0 })
		expect(add.data.ok).toBe(true)
		expect(add.data.entry.startAddress).toBe(1)

		const list = (await json('GET', '/api/patch')).data
		expect(list.entries.length).toBe(1)
	})

	it('rejects an out-of-range patch address', async () => {
		const res = await json('POST', '/api/patch', { ip: '10.0.0.6', universe: 1, startAddress: 510 })
		expect(res.status).toBe(400)
		expect(res.data.ok).toBe(false)
	})

	it('updates Art-Net config', async () => {
		const res = await json('PUT', '/api/config/artnet', { nodeName: 'MyBridge' })
		expect(res.data.ok).toBe(true)
		expect((await json('GET', '/api/config')).data.artnet.nodeName).toBe('MyBridge')
	})

	it('404s unknown routes', async () => {
		expect((await json('GET', '/api/nope')).status).toBe(404)
	})
})

describe('WebSocket hub', () => {
	it('sends an initial health snapshot on connect', async () => {
		const addr = server.address() as { port: number }
		const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/ws`)
		const msg = await new Promise<any>((resolve, reject) => {
			ws.on('message', (d) => resolve(JSON.parse(d.toString())))
			ws.on('error', reject)
			setTimeout(() => reject(new Error('timeout')), 3000)
		})
		expect(['health', 'bulbs', 'log']).toContain(msg.type)
		ws.close()
	})
})
