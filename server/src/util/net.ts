import os from 'node:os'

/**
 * Best-effort local IPv4 address for ArtPollReply.
 * If a specific bind address is configured (not 0.0.0.0), that is returned.
 */
export function getLocalIPv4(bindAddress?: string): string {
	if (bindAddress && bindAddress !== '0.0.0.0' && bindAddress !== '::') return bindAddress
	const ifaces = os.networkInterfaces()
	for (const name of Object.keys(ifaces)) {
		for (const info of ifaces[name] ?? []) {
			if (info.family === 'IPv4' && !info.internal) return info.address
		}
	}
	return '127.0.0.1'
}
