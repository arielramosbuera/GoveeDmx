import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import type { WsServerMessage } from '@shared'
import type { App } from '../app'
import { logger } from '../logger'

/**
 * WebSocket hub. Broadcasts realtime messages (dmx, health, bulbs, logs) to all
 * connected UI clients and sends an initial snapshot on connect.
 */
export class WsHub {
	private wss: WebSocketServer

	constructor(server: Server, private app: App) {
		this.wss = new WebSocketServer({ server, path: '/ws' })
		this.wss.on('connection', (socket) => this.onConnection(socket))
		// The ws server surfaces the HTTP server's listen errors (e.g. EADDRINUSE).
		// Handle them here so a port conflict is reported gracefully instead of
		// crashing the process with an unhandled 'error' event.
		this.wss.on('error', (err) => logger.error(`WebSocket server error: ${err.message}`))
	}

	private onConnection(socket: WebSocket): void {
		// Initial snapshot so the UI is populated immediately.
		this.send(socket, { type: 'health', health: this.app.getHealth() })
		this.send(socket, { type: 'bulbs', bulbs: this.app.getBulbs() })
		for (const entry of logger.getRecent().slice(-50)) {
			this.send(socket, { type: 'log', level: entry.level, message: entry.message, timeMs: entry.timeMs })
		}
	}

	broadcast(msg: WsServerMessage): void {
		const data = JSON.stringify(msg)
		for (const client of this.wss.clients) {
			if (client.readyState === WebSocket.OPEN) client.send(data)
		}
	}

	private send(socket: WebSocket, msg: WsServerMessage): void {
		if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg))
	}

	close(): void {
		this.wss.close()
	}
}
