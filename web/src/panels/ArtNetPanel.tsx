import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ArtNetConfig } from '@shared'

export function ArtNetPanel() {
	const [cfg, setCfg] = useState<ArtNetConfig | null>(null)
	const [universesText, setUniversesText] = useState('')
	const [status, setStatus] = useState<string>('')

	useEffect(() => {
		api.getConfig().then((c) => {
			setCfg(c.artnet)
			setUniversesText(c.artnet.universes.join(', '))
		})
	}, [])

	if (!cfg) return <div className="panel">Loading...</div>

	const set = <K extends keyof ArtNetConfig>(key: K, value: ArtNetConfig[K]) => setCfg({ ...cfg, [key]: value })

	const save = async () => {
		setStatus('Saving...')
		try {
			const universes = universesText
				.split(',')
				.map((s) => parseInt(s.trim(), 10))
				.filter((n) => Number.isFinite(n))
			await api.updateArtNet({ ...cfg, universes })
			setStatus('Saved. Art-Net listener restarted.')
		} catch (err) {
			setStatus(`Error: ${(err as Error).message}`)
		}
	}

	return (
		<div className="panel">
			<h2>Art-Net Configuration</h2>
			<div className="form">
				<label>
					Bind interface IP
					<input value={cfg.bindAddress} onChange={(e) => set('bindAddress', e.target.value)} placeholder="0.0.0.0" />
					<small>0.0.0.0 listens on all interfaces. Set a specific NIC IP on multi-homed machines.</small>
				</label>
				<label>
					Port
					<input
						type="number"
						value={cfg.port}
						onChange={(e) => set('port', parseInt(e.target.value, 10) || 6454)}
					/>
					<small>Art-Net standard is 6454.</small>
				</label>
				<label>
					Accepted universes (comma separated)
					<input value={universesText} onChange={(e) => setUniversesText(e.target.value)} placeholder="0, 1, 2" />
					<small>15-bit Port-Address. Leave empty to accept all universes.</small>
				</label>
				<label>
					Node name
					<input value={cfg.nodeName} onChange={(e) => set('nodeName', e.target.value)} />
				</label>
				<label className="checkbox">
					<input
						type="checkbox"
						checked={cfg.enableArtPollReply}
						onChange={(e) => set('enableArtPollReply', e.target.checked)}
					/>
					Reply to ArtPoll (appear as a node to consoles)
				</label>
			</div>
			<div className="actions">
				<button className="primary" onClick={save}>
					Save
				</button>
				<span className="muted">{status}</span>
			</div>
		</div>
	)
}
