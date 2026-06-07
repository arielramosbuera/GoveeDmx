import { useEffect, useState } from 'react'
import { api } from '../api'
import type { BulbHealth } from '@shared'

export function ScanPanel({ bulbs }: { bulbs: BulbHealth[] }) {
	const [attachedIps, setAttachedIps] = useState<Set<string>>(new Set())
	const [manualIp, setManualIp] = useState('')
	const [manualName, setManualName] = useState('')
	const [busy, setBusy] = useState(false)

	const refreshAttached = () =>
		api.getConfig().then((c) => setAttachedIps(new Set(c.bulbs.map((b) => b.ip))))

	useEffect(() => {
		refreshAttached()
	}, [])

	const scan = async () => {
		setBusy(true)
		try {
			await api.scan()
		} finally {
			setTimeout(() => setBusy(false), 1200)
		}
	}

	const attach = async (ip: string) => {
		await api.attachBulb(ip)
		refreshAttached()
	}
	const detach = async (ip: string) => {
		await api.detachBulb(ip)
		refreshAttached()
	}
	const addManual = async () => {
		if (!manualIp.trim()) return
		await api.addManualBulb(manualIp.trim(), manualName.trim() || undefined)
		setManualIp('')
		setManualName('')
		refreshAttached()
	}

	return (
		<div className="panel">
			<h2>Bulbs</h2>
			<div className="actions">
				<button className="primary" onClick={scan} disabled={busy}>
					{busy ? 'Scanning...' : 'Scan network'}
				</button>
				<span className="muted">Enable "LAN Control" per device in the Govee Home app for discovery to work.</span>
			</div>

			<div className="addmanual">
				<input placeholder="Manual IP (e.g. 192.168.1.50)" value={manualIp} onChange={(e) => setManualIp(e.target.value)} />
				<input placeholder="Name (optional)" value={manualName} onChange={(e) => setManualName(e.target.value)} />
				<button onClick={addManual}>Add manually</button>
			</div>

			<table className="grid">
				<thead>
					<tr>
						<th></th>
						<th>Name</th>
						<th>IP</th>
						<th>MAC</th>
						<th>Power</th>
						<th>Bright</th>
						<th>Attached</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{bulbs.length === 0 && (
						<tr>
							<td colSpan={8} className="muted">
								No bulbs found yet. Click "Scan network".
							</td>
						</tr>
					)}
					{bulbs.map((b) => (
						<tr key={b.ip}>
							<td>
								<span className={`dot ${b.online ? 'ok' : 'error'}`} />
							</td>
							<td>{b.name}</td>
							<td>{b.ip}</td>
							<td className="mono">{b.mac || '-'}</td>
							<td>{b.power}</td>
							<td>{b.brightness ?? '-'}</td>
							<td>{attachedIps.has(b.ip) ? 'Yes' : 'No'}</td>
							<td className="rowactions">
								<button onClick={() => api.testBulb(b.ip, { power: true, brightness: 100, r: 255, g: 255, b: 255 })}>
									Test On
								</button>
								<button onClick={() => api.testBulb(b.ip, { power: false })}>Off</button>
								{attachedIps.has(b.ip) ? (
									<button className="danger" onClick={() => detach(b.ip)}>
										Detach
									</button>
								) : (
									<button className="primary" onClick={() => attach(b.ip)}>
										Attach
									</button>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
