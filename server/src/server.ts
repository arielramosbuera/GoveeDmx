import path from 'node:path'
import fs from 'node:fs'
import { ConfigStore } from './config/store'
import { App } from './app'
import { createHttpServer } from './api/http'
import { WsHub } from './api/ws'
import { logger, type LogLevel } from './logger'
import { getLogPath } from './paths'
import { getLocalIPv4 } from './util/net'

function resolveStaticDir(): string {
	const candidates = [
		process.env.GOVEEDMX_STATIC_DIR,
		path.join(__dirname, 'web'), // packaged: web copied next to server bundle
		path.join(__dirname, '..', '..', 'web', 'dist'), // monorepo dev
	].filter(Boolean) as string[]
	for (const dir of candidates) {
		if (fs.existsSync(path.join(dir, 'index.html'))) return dir
	}
	return candidates[candidates.length - 1]
}

async function main(): Promise<void> {
	logger.setLevel((process.env.GOVEEDMX_LOG_LEVEL as LogLevel) || 'info')
	logger.setLogFile(getLogPath())
	logger.info('GoveeDMX starting...')

	const configStore = new ConfigStore()
	configStore.load()

	const app = new App(configStore)
	const staticDir = resolveStaticDir()
	const server = createHttpServer(app, staticDir)
	const hub = new WsHub(server, app)
	app.attachHub(hub)

	await app.start()

	const port = configStore.get().server.httpPort
	server.on('error', (err: NodeJS.ErrnoException) => {
		if (err.code === 'EADDRINUSE') {
			logger.error(`HTTP port ${port} is already in use. Set a different port in config and restart.`)
		} else {
			logger.error(`HTTP server error: ${err.message}`)
		}
		if (process.env.GOVEEDMX_EMBEDDED !== '1') process.exit(1)
	})

	server.listen(port, () => {
		const ip = getLocalIPv4(configStore.get().artnet.bindAddress)
		logger.info(`GoveeDMX web UI: http://localhost:${port}  (LAN: http://${ip}:${port})`)
	})

	const shutdown = async (signal: string) => {
		logger.info(`Received ${signal}, shutting down...`)
		hub.close()
		await app.stop()
		server.close(() => process.exit(0))
		setTimeout(() => process.exit(0), 2000).unref()
	}
	process.on('SIGINT', () => void shutdown('SIGINT'))
	process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
	logger.error(`Fatal: ${(err as Error).stack || (err as Error).message}`)
	if (process.env.GOVEEDMX_EMBEDDED !== '1') process.exit(1)
})
