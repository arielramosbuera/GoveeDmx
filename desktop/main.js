'use strict'

/**
 * Electron shell for GoveeDMX.
 *
 * Boots the exact same backend bundle in-process (so there is no separate
 * runtime or sidecar), then opens a window pointed at the local web UI.
 * Closing the window hides to the tray so the bridge keeps running during a
 * show; "Quit" from the tray stops everything.
 */

const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')

const isPackaged = app.isPackaged
const serverEntry = isPackaged
	? path.join(process.resourcesPath, 'server', 'server.cjs')
	: path.join(__dirname, '..', 'server', 'dist', 'server.cjs')
const staticDir = isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'web', 'dist')
const iconPath = isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, 'build', 'icon.png')
const trayIconPath = isPackaged ? path.join(process.resourcesPath, 'tray.png') : path.join(__dirname, 'build', 'tray.png')

process.env.GOVEEDMX_STATIC_DIR = staticDir
process.env.GOVEEDMX_DATA_DIR = app.getPath('userData')

let mainWindow = null
let tray = null
let isQuitting = false

function getPort() {
	try {
		const cfgPath = path.join(app.getPath('userData'), 'config.json')
		const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
		if (cfg && cfg.server && cfg.server.httpPort) return cfg.server.httpPort
	} catch {
		// config not created yet
	}
	return 8080
}

function waitForServer(port, timeoutMs = 15000) {
	const start = Date.now()
	return new Promise((resolve, reject) => {
		const tryOnce = () => {
			const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1000 }, (res) => {
				res.resume()
				resolve()
			})
			req.on('error', () => {
				if (Date.now() - start > timeoutMs) reject(new Error('Server did not start in time'))
				else setTimeout(tryOnce, 300)
			})
			req.on('timeout', () => req.destroy())
		}
		tryOnce()
	})
}

async function createWindow() {
	const port = getPort()
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 820,
		minWidth: 900,
		minHeight: 600,
		title: 'GoveeDMX',
		backgroundColor: '#0e1116',
		icon: iconPath,
		webPreferences: { contextIsolation: true },
	})

	try {
		await waitForServer(port)
	} catch (err) {
		console.error(err)
	}
	await mainWindow.loadURL(`http://localhost:${port}`)

	mainWindow.on('close', (e) => {
		if (!isQuitting) {
			e.preventDefault()
			mainWindow.hide()
		}
	})
}

function createTray() {
	// Use the dedicated simplified tray glyph; fall back to the app icon.
	let icon = nativeImage.createFromPath(trayIconPath)
	if (icon.isEmpty()) icon = nativeImage.createFromPath(iconPath)
	if (!icon.isEmpty()) icon = icon.resize({ width: 16, height: 16 })
	tray = new Tray(icon)
	tray.setToolTip('GoveeDMX bridge')
	const menu = Menu.buildFromTemplate([
		{ label: 'Open GoveeDMX', click: () => (mainWindow ? mainWindow.show() : createWindow()) },
		{ label: 'Open in browser', click: () => shell.openExternal(`http://localhost:${getPort()}`) },
		{ type: 'separator' },
		{
			label: 'Quit',
			click: () => {
				isQuitting = true
				app.quit()
			},
		},
	])
	tray.setContextMenu(menu)
	tray.on('click', () => (mainWindow ? mainWindow.show() : createWindow()))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
	app.quit()
} else {
	app.on('second-instance', () => {
		if (mainWindow) {
			mainWindow.show()
			mainWindow.focus()
		}
	})

	app.whenReady().then(() => {
		// Start the backend in-process.
		require(serverEntry)
		createWindow()
		createTray()

		app.on('activate', () => {
			if (BrowserWindow.getAllWindows().length === 0) createWindow()
		})
	})

	// Keep running in the tray when all windows are closed.
	app.on('window-all-closed', () => {
		// no-op: tray keeps the app alive; use tray > Quit to exit
	})
}
