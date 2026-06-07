import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { App } from '../app'
import { PERSONALITIES } from '@shared'
import { logger } from '../logger'

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, params: Record<string, string>, body: unknown) => void | Promise<void>

interface Route {
	method: string
	pattern: string[]
	handler: Handler
}

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
	const data = JSON.stringify(payload)
	res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
	res.end(data)
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = []
		req.on('data', (c) => chunks.push(c as Buffer))
		req.on('end', () => {
			if (chunks.length === 0) return resolve(undefined)
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
			} catch {
				resolve(undefined)
			}
		})
		req.on('error', () => resolve(undefined))
	})
}

export function createHttpServer(app: App, staticDir: string): http.Server {
	const routes: Route[] = []
	const add = (method: string, p: string, handler: Handler) =>
		routes.push({ method, pattern: p.split('/').filter(Boolean), handler })

	// --- Health / config ---
	add('GET', '/api/health', (_req, res) => sendJson(res, 200, app.getHealth()))
	add('GET', '/api/config', (_req, res) => sendJson(res, 200, app.config.get()))
	add('GET', '/api/personalities', (_req, res) => sendJson(res, 200, PERSONALITIES))
	add('GET', '/api/logs', (_req, res) => sendJson(res, 200, logger.getRecent()))

	add('PUT', '/api/config/artnet', (_req, res, _p, body) => {
		sendJson(res, 200, { ok: true, data: app.updateArtNet((body ?? {}) as Record<string, unknown>) })
	})
	add('PUT', '/api/config/govee', (_req, res, _p, body) => {
		sendJson(res, 200, { ok: true, data: app.updateGovee((body ?? {}) as Record<string, unknown>) })
	})

	// --- Bulbs ---
	add('GET', '/api/bulbs', (_req, res) => sendJson(res, 200, app.getBulbs()))
	add('POST', '/api/bulbs/scan', (_req, res) => {
		app.scan()
		sendJson(res, 200, { ok: true })
	})
	add('POST', '/api/bulbs/attach', (_req, res, _p, body) => {
		const b = (body ?? {}) as { ip?: string; name?: string }
		if (!b.ip) return sendJson(res, 400, { ok: false, error: 'ip required' })
		sendJson(res, 200, { ok: true, data: app.attachBulb(b.ip, b.name) })
	})
	add('POST', '/api/bulbs/manual', (_req, res, _p, body) => {
		const b = (body ?? {}) as { ip?: string; name?: string }
		if (!b.ip) return sendJson(res, 400, { ok: false, error: 'ip required' })
		app.addManualBulb(b.ip, b.name)
		sendJson(res, 200, { ok: true })
	})
	add('POST', '/api/bulbs/test', (_req, res, _p, body) => {
		const b = (body ?? {}) as { ip?: string } & Record<string, unknown>
		if (!b.ip) return sendJson(res, 400, { ok: false, error: 'ip required' })
		app.testBulb(b.ip, b as never)
		sendJson(res, 200, { ok: true })
	})
	add('DELETE', '/api/bulbs/:ip', (_req, res, params) => {
		sendJson(res, 200, { ok: true, data: app.detachBulb(params.ip) })
	})

	// --- Patch ---
	add('GET', '/api/patch', (_req, res) => sendJson(res, 200, app.listPatch()))
	add('POST', '/api/patch', (_req, res, _p, body) => {
		const result = app.addPatch((body ?? {}) as never)
		sendJson(res, result.ok ? 200 : 400, result)
	})
	add('PUT', '/api/patch/:id', (_req, res, params, body) => {
		const result = app.updatePatch(params.id, (body ?? {}) as never)
		sendJson(res, result.ok ? 200 : 400, result)
	})
	add('DELETE', '/api/patch/:id', (_req, res, params) => {
		sendJson(res, 200, { ok: true, data: app.removePatch(params.id) })
	})
	add('POST', '/api/patch/:id/override', (_req, res, params, body) => {
		const result = app.setOverride(params.id, (body ?? {}) as never)
		sendJson(res, result.ok ? 200 : 400, result)
	})

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url || '/', 'http://localhost')
			const segments = url.pathname.split('/').filter(Boolean)

			if (url.pathname.startsWith('/api/')) {
				const match = matchRoute(routes, req.method || 'GET', segments)
				if (!match) return sendJson(res, 404, { ok: false, error: 'Not found' })
				const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : undefined
				await match.route.handler(req, res, match.params, body)
				return
			}

			serveStatic(res, staticDir, url.pathname)
		} catch (err) {
			logger.error(`HTTP handler error: ${(err as Error).message}`)
			if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Internal error' })
		}
	})

	return server
}

function matchRoute(routes: Route[], method: string, segments: string[]): { route: Route; params: Record<string, string> } | null {
	for (const route of routes) {
		if (route.method !== method) continue
		if (route.pattern.length !== segments.length) continue
		const params: Record<string, string> = {}
		let ok = true
		for (let i = 0; i < route.pattern.length; i++) {
			const pat = route.pattern[i]
			if (pat.startsWith(':')) params[pat.slice(1)] = decodeURIComponent(segments[i])
			else if (pat !== segments[i]) {
				ok = false
				break
			}
		}
		if (ok) return { route, params }
	}
	return null
}

function serveStatic(res: http.ServerResponse, staticDir: string, pathname: string): void {
	const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '')
	let filePath = path.join(staticDir, safePath)

	if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
		filePath = path.join(staticDir, 'index.html')
	}
	if (!fs.existsSync(filePath)) {
		res.writeHead(404, { 'Content-Type': 'text/plain' })
		res.end('GoveeDMX UI not built. Run "npm run build:web".')
		return
	}
	const ext = path.extname(filePath).toLowerCase()
	res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
	fs.createReadStream(filePath).pipe(res)
}
