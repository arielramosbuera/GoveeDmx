import { useEffect, useRef, useState } from 'react'
import type { BulbHealth, OverallHealth, WsServerMessage } from '@shared'

export interface DmxUniverseData {
	data: number[]
	fps: number
	sourceIp: string | null
	updatedMs: number
}

export interface LogLine {
	level: 'debug' | 'info' | 'warn' | 'error'
	message: string
	timeMs: number
}

export interface LiveData {
	connected: boolean
	health: OverallHealth | null
	bulbs: BulbHealth[]
	dmx: Record<number, DmxUniverseData>
	logs: LogLine[]
}

/** Opens a WebSocket to the backend and exposes realtime state, with auto-reconnect. */
export function useLiveData(): LiveData {
	const [connected, setConnected] = useState(false)
	const [health, setHealth] = useState<OverallHealth | null>(null)
	const [bulbs, setBulbs] = useState<BulbHealth[]>([])
	const [dmx, setDmx] = useState<Record<number, DmxUniverseData>>({})
	const [logs, setLogs] = useState<LogLine[]>([])
	const wsRef = useRef<WebSocket | null>(null)

	useEffect(() => {
		let closed = false
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined

		const connect = () => {
			const proto = location.protocol === 'https:' ? 'wss' : 'ws'
			const ws = new WebSocket(`${proto}://${location.host}/ws`)
			wsRef.current = ws
			ws.onopen = () => setConnected(true)
			ws.onclose = () => {
				setConnected(false)
				if (!closed) reconnectTimer = setTimeout(connect, 1500)
			}
			ws.onerror = () => ws.close()
			ws.onmessage = (ev) => {
				let msg: WsServerMessage
				try {
					msg = JSON.parse(ev.data)
				} catch {
					return
				}
				switch (msg.type) {
					case 'health':
						setHealth(msg.health)
						break
					case 'bulbs':
						setBulbs(msg.bulbs)
						break
					case 'dmx':
						setDmx((prev) => ({
							...prev,
							[msg.universe]: { data: msg.data, fps: msg.fps, sourceIp: msg.sourceIp, updatedMs: Date.now() },
						}))
						break
					case 'log':
						setLogs((prev) => [...prev.slice(-199), { level: msg.level, message: msg.message, timeMs: msg.timeMs }])
						break
				}
			}
		}

		connect()
		return () => {
			closed = true
			if (reconnectTimer) clearTimeout(reconnectTimer)
			wsRef.current?.close()
		}
	}, [])

	return { connected, health, bulbs, dmx, logs }
}
