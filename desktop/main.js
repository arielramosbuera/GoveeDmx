'use strict'

/**
 * Electron shell for GoveeDMX.
 *
 * Boots the exact same backend bundle in-process (so there is no separate
 * runtime or sidecar), then opens a window pointed at the local web UI.
 * The backend runs inside Electron's main process, and the desktop window owns
 * that process. Closing or losing the window exits the app and backend together.
 */

const { app, BrowserWindow, shell, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')

const isPackaged = app.isPackaged
const serverEntry = isPackaged
	? path.join(process.resourcesPath, 'server', 'server.cjs')
	: path.join(__dirname, '..', 'server', 'dist', 'server.cjs')
const staticDir = isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'web', 'dist')
const iconPath = isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, 'build', 'icon.png')

process.env.GOVEEDMX_STATIC_DIR = staticDir
process.env.GOVEEDMX_DATA_DIR = app.getPath('userData')

let mainWindow = null
let splashWindow = null
let isQuitting = false
let startupComplete = false
let startupFailed = false
let desktopLogPath = null
let currentStartupStep = 0
let ownershipWatchdog = null

const STARTUP_STEPS = [
	'Preparing application',
	'Checking packaged resources',
	'Checking local server port',
	'Starting bridge services',
	'Waiting for the web service',
	'Loading the control panel',
]

function formatError(error) {
	if (error instanceof Error) return error.stack || error.message
	return String(error)
}

function initializeDesktopLogging() {
	desktopLogPath = path.join(app.getPath('userData'), 'logs', 'desktop.log')
	try {
		fs.mkdirSync(path.dirname(desktopLogPath), { recursive: true })
	} catch (error) {
		console.error('Unable to create desktop log directory:', error)
	}
}

function writeDesktopLog(level, message) {
	const line = `${new Date().toISOString()} [${level}] ${message}`
	const sink = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log
	sink(line)
	if (!desktopLogPath) return
	try {
		fs.appendFileSync(desktopLogPath, `${line}\n`)
	} catch (error) {
		console.error('Unable to write desktop log:', error)
	}
}

function isUsableWindow(window) {
	return Boolean(window && !window.isDestroyed() && !window.webContents.isDestroyed())
}

function quitApplication(reason, exitCode = 0) {
	if (isQuitting) return
	isQuitting = true
	writeDesktopLog('INFO', `Stopping desktop and in-process backend: ${reason}`)
	if (ownershipWatchdog) {
		clearInterval(ownershipWatchdog)
		ownershipWatchdog = null
	}

	const forceExit = setTimeout(() => app.exit(exitCode), 3000)
	forceExit.unref()
	app.quit()
}

function startOwnershipWatchdog() {
	if (ownershipWatchdog) clearInterval(ownershipWatchdog)
	ownershipWatchdog = setInterval(() => {
		if (startupComplete && !isQuitting && !isUsableWindow(mainWindow)) {
			quitApplication('control panel window is no longer available', 1)
		}
	}, 1000)
	ownershipWatchdog.unref()
}

function getBackendLogTail() {
	const backendLogPath = path.join(app.getPath('userData'), 'logs', 'goveedmx.log')
	try {
		const lines = fs.readFileSync(backendLogPath, 'utf8').trim().split(/\r?\n/)
		return lines.slice(-8).join('\n')
	} catch {
		return ''
	}
}

function splashHtml() {
	const steps = STARTUP_STEPS.map(
		(step, index) => `<li id="step-${index}" class="pending"><span class="marker"></span><span>${step}</span></li>`,
	).join('')
	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
	<title>GoveeDMX Startup</title>
	<style>
		:root { color-scheme: dark; font-family: "Segoe UI", sans-serif; }
		* { box-sizing: border-box; }
		body { margin: 0; min-height: 100vh; padding: 34px 40px; background: #0e1116; color: #e7edf5; }
		.brand { display: flex; align-items: center; gap: 13px; margin-bottom: 26px; }
		.logo { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #42d392, #2f80ed); color: #07110d; font-weight: 800; font-size: 21px; }
		h1 { margin: 0; font-size: 22px; font-weight: 650; }
		.subtitle { margin-top: 3px; color: #8f9cac; font-size: 13px; }
		ol { list-style: none; margin: 0; padding: 0; }
		li { display: flex; align-items: center; gap: 12px; min-height: 34px; color: #687485; font-size: 14px; transition: color .2s; }
		.marker { width: 10px; height: 10px; flex: 0 0 auto; border: 2px solid #465263; border-radius: 50%; }
		li.active { color: #e7edf5; }
		li.active .marker { border-color: #42d392; border-top-color: transparent; animation: spin .8s linear infinite; }
		li.done { color: #aab5c2; }
		li.done .marker { border-color: #42d392; background: #42d392; box-shadow: inset 0 0 0 2px #0e1116; }
		li.error { color: #ff9a9a; }
		li.error .marker { border-color: #ff6262; background: #ff6262; }
		#error { display: none; margin-top: 18px; padding: 13px; border: 1px solid #713c42; border-radius: 8px; background: #29171b; color: #ffd3d3; font: 12px/1.45 Consolas, monospace; white-space: pre-wrap; max-height: 118px; overflow: auto; }
		#actions { display: none; margin-top: 14px; gap: 10px; }
		button { border: 1px solid #526173; border-radius: 6px; padding: 7px 12px; background: #202833; color: #edf3fa; cursor: pointer; }
		button:hover { background: #2a3543; }
		@keyframes spin { to { transform: rotate(360deg); } }
	</style>
</head>
<body>
	<div class="brand"><div class="logo">G</div><div><h1>GoveeDMX</h1><div class="subtitle">Starting the Art-Net bridge</div></div></div>
	<ol>${steps}</ol>
	<div id="error"></div>
	<div id="actions"><button onclick="location.href='goveedmx://open-logs'">Open logs folder</button><button onclick="location.href='goveedmx://quit'">Close</button></div>
</body>
</html>`
}

async function createSplash() {
	splashWindow = new BrowserWindow({
		width: 560,
		height: 480,
		resizable: false,
		maximizable: false,
		fullscreenable: false,
		title: 'GoveeDMX Startup',
		backgroundColor: '#0e1116',
		icon: iconPath,
		webPreferences: { contextIsolation: true, sandbox: true },
	})
	splashWindow.setMenu(null)
	splashWindow.webContents.on('render-process-gone', (_event, details) => {
		writeDesktopLog('ERROR', `Startup renderer stopped (${details.reason}, exit code ${details.exitCode})`)
		quitApplication('startup renderer stopped', 1)
	})
	splashWindow.webContents.on('will-navigate', (event, url) => {
		if (!url.startsWith('goveedmx://')) return
		event.preventDefault()
		if (url === 'goveedmx://open-logs') void shell.openPath(path.dirname(desktopLogPath))
		if (url === 'goveedmx://quit') {
			quitApplication('startup error window closed', 1)
		}
	})
	splashWindow.on('closed', () => {
		splashWindow = null
		if (!startupComplete) quitApplication('startup window closed', startupFailed ? 1 : 0)
	})
	await splashWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(splashHtml())}`)
}

function updateSplash(stepIndex, state, detail = '') {
	if (!splashWindow || splashWindow.isDestroyed()) return
	const script = `(() => {
		const index = ${JSON.stringify(stepIndex)};
		const state = ${JSON.stringify(state)};
		const detail = ${JSON.stringify(detail)};
		document.querySelectorAll('li').forEach((element, i) => {
			if (i < index) element.className = 'done';
			else if (i === index) element.className = state;
			else element.className = 'pending';
		});
		if (state === 'error') {
			const error = document.getElementById('error');
			error.textContent = detail;
			error.style.display = 'block';
			document.getElementById('actions').style.display = 'flex';
		}
	})()`
	void splashWindow.webContents.executeJavaScript(script).catch((error) => {
		writeDesktopLog('WARN', `Unable to update splash screen: ${formatError(error)}`)
	})
}

function setStartupStep(stepIndex) {
	currentStartupStep = stepIndex
	writeDesktopLog('INFO', STARTUP_STEPS[stepIndex])
	updateSplash(stepIndex, 'active')
}

function checkPortAvailable(port) {
	return new Promise((resolve, reject) => {
		const tester = net.createServer()
		tester.once('error', (error) => {
			if (error.code === 'EADDRINUSE') {
				reject(new Error(`Port ${port} is already in use. Close the other GoveeDMX instance or change the HTTP port in config.json.`))
			} else {
				reject(error)
			}
		})
		tester.once('listening', () => tester.close(() => resolve()))
		tester.listen(port)
	})
}

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
				if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve()
				else if (Date.now() - start > timeoutMs) reject(new Error(`Health check returned HTTP ${res.statusCode}`))
				else setTimeout(tryOnce, 300)
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

async function createWindow(port) {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 820,
		minWidth: 900,
		minHeight: 600,
		title: 'GoveeDMX',
		backgroundColor: '#0e1116',
		icon: iconPath,
		show: false,
		webPreferences: { contextIsolation: true, sandbox: true },
	})

	mainWindow.webContents.on('render-process-gone', (_event, details) => {
		const error = new Error(`Control panel renderer stopped (${details.reason}, exit code ${details.exitCode})`)
		writeDesktopLog('ERROR', formatError(error))
		quitApplication('control panel renderer stopped', 1)
	})

	await mainWindow.loadURL(`http://localhost:${port}`)
	mainWindow.show()

	mainWindow.on('close', () => {
		if (!isQuitting) writeDesktopLog('INFO', 'Control panel close requested')
	})
	mainWindow.on('closed', () => {
		mainWindow = null
		if (!isQuitting) quitApplication('control panel window closed')
	})
}

function showStartupError(stepIndex, error) {
	startupFailed = true
	const backendTail = getBackendLogTail()
	const detail = [formatError(error), backendTail ? `\nRecent backend log:\n${backendTail}` : '', desktopLogPath ? `\nDesktop log: ${desktopLogPath}` : '']
		.filter(Boolean)
		.join('\n')
	writeDesktopLog('ERROR', formatError(error))
	updateSplash(stepIndex, 'error', detail)
	if (splashWindow && !splashWindow.isDestroyed()) {
		splashWindow.show()
		splashWindow.focus()
	} else if (app.isReady()) {
		dialog.showErrorBox('GoveeDMX failed to start', detail)
	}
}

async function startApplication() {
	const port = getPort()
	try {
		setStartupStep(0)

		setStartupStep(1)
		const requiredPaths = [serverEntry, path.join(staticDir, 'index.html')]
		const missing = requiredPaths.filter((filePath) => !fs.existsSync(filePath))
		if (missing.length > 0) throw new Error(`Required application files are missing:\n${missing.join('\n')}`)

		setStartupStep(2)
		await checkPortAvailable(port)

		setStartupStep(3)
		process.env.GOVEEDMX_EMBEDDED = '1'
		require(serverEntry)
		writeDesktopLog('INFO', `Backend loaded inside Electron main process PID ${process.pid}`)

		setStartupStep(4)
		await waitForServer(port)

		setStartupStep(5)
		await createWindow(port)

		startupComplete = true
		startOwnershipWatchdog()
		updateSplash(STARTUP_STEPS.length, 'done')
		writeDesktopLog('INFO', 'Startup completed successfully')
		if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
	} catch (error) {
		showStartupError(currentStartupStep, error)
	}
}

function focusApplication() {
	const window = mainWindow || splashWindow
	if (!isUsableWindow(window)) return false
	if (window.isMinimized()) window.restore()
	window.show()
	window.focus()
	return true
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
	app.quit()
} else {
	app.on('second-instance', () => {
		if (focusApplication()) return
		writeDesktopLog('WARN', 'Second launch found a windowless owner; restarting the complete app')
		app.relaunch()
		quitApplication('replacing windowless single-instance owner', 1)
	})

	app.whenReady().then(async () => {
		initializeDesktopLogging()
		writeDesktopLog('INFO', `GoveeDMX desktop starting (packaged: ${isPackaged})`)
		await createSplash()
		await startApplication()

		app.on('activate', () => {
			if (!focusApplication()) quitApplication('application activated without an owned window', 1)
		})
	}).catch((error) => {
		writeDesktopLog('ERROR', `Electron initialization failed: ${formatError(error)}`)
		if (app.isReady()) showStartupError(0, error)
	})

	app.on('window-all-closed', () => {
		quitApplication('all desktop windows closed')
	})
	app.on('before-quit', () => {
		isQuitting = true
		if (ownershipWatchdog) clearInterval(ownershipWatchdog)
	})
}

process.on('uncaughtException', (error) => {
	writeDesktopLog('ERROR', `Uncaught exception: ${formatError(error)}`)
	if (!startupComplete && isUsableWindow(splashWindow)) showStartupError(currentStartupStep, error)
	else quitApplication('uncaught main-process exception', 1)
})
process.on('unhandledRejection', (error) => {
	writeDesktopLog('ERROR', `Unhandled rejection: ${formatError(error)}`)
	if (!startupComplete && isUsableWindow(splashWindow)) showStartupError(currentStartupStep, error)
	else quitApplication('unhandled main-process rejection', 1)
})
