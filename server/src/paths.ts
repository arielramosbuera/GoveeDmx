import os from 'node:os'
import path from 'node:path'

const APP_DIR_NAME = 'GoveeDMX'

/**
 * Per-OS application data directory used to store config and logs.
 * Can be overridden with the GOVEEDMX_DATA_DIR environment variable
 * (useful for the Electron app and the systemd service).
 */
export function getDataDir(): string {
	const override = process.env.GOVEEDMX_DATA_DIR
	if (override && override.trim()) return override.trim()

	const home = os.homedir()
	switch (process.platform) {
		case 'win32':
			return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), APP_DIR_NAME)
		case 'darwin':
			return path.join(home, 'Library', 'Application Support', APP_DIR_NAME)
		default:
			return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), APP_DIR_NAME)
	}
}

export function getConfigPath(): string {
	return path.join(getDataDir(), 'config.json')
}

export function getLogPath(): string {
	return path.join(getDataDir(), 'logs', 'goveedmx.log')
}
