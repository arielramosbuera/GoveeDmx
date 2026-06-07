import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LogEntry {
	level: LogLevel
	message: string
	timeMs: number
}

/**
 * Lightweight, dependency-free logger.
 * - Prints to the console.
 * - Appends to a rotating log file (best-effort).
 * - Keeps a ring buffer of recent entries.
 * - Emits 'log' events so the API layer can stream them to the UI.
 *
 * A small custom logger is used (instead of a heavier framework) so the whole
 * server bundles cleanly into a single file for Electron / single-binary delivery.
 */
export class Logger extends EventEmitter {
	private minLevel: LogLevel = 'info'
	private buffer: LogEntry[] = []
	private readonly bufferSize = 500
	private filePath: string | null = null
	private readonly maxFileBytes = 5 * 1024 * 1024

	setLevel(level: LogLevel): void {
		this.minLevel = level
	}

	setLogFile(filePath: string): void {
		try {
			fs.mkdirSync(path.dirname(filePath), { recursive: true })
			this.filePath = filePath
		} catch (err) {
			this.filePath = null
			// eslint-disable-next-line no-console
			console.error('Failed to set up log file:', (err as Error).message)
		}
	}

	getRecent(): LogEntry[] {
		return [...this.buffer]
	}

	debug(message: string): void {
		this.write('debug', message)
	}
	info(message: string): void {
		this.write('info', message)
	}
	warn(message: string): void {
		this.write('warn', message)
	}
	error(message: string): void {
		this.write('error', message)
	}

	private write(level: LogLevel, message: string): void {
		if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return
		const entry: LogEntry = { level, message, timeMs: Date.now() }

		this.buffer.push(entry)
		if (this.buffer.length > this.bufferSize) this.buffer.shift()

		const line = `${new Date(entry.timeMs).toISOString()} [${level.toUpperCase()}] ${message}`
		// eslint-disable-next-line no-console
		const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
		sink(line)

		this.appendToFile(line)
		this.emit('log', entry)
	}

	private appendToFile(line: string): void {
		if (!this.filePath) return
		try {
			try {
				const stat = fs.statSync(this.filePath)
				if (stat.size > this.maxFileBytes) {
					fs.renameSync(this.filePath, `${this.filePath}.1`)
				}
			} catch {
				// file may not exist yet; ignore
			}
			fs.appendFileSync(this.filePath, line + '\n')
		} catch {
			// best-effort logging; never throw from the logger
		}
	}
}

export const logger = new Logger()
