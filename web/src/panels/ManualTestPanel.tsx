import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { ManualOverride, PatchEntry } from '@shared'

const DEFAULT: ManualOverride = { enabled: false, dimmer: 255, red: 255, green: 255, blue: 255, cct: 0 }

export function ManualTestPanel() {
	const [entries, setEntries] = useState<PatchEntry[]>([])
	const [selId, setSelId] = useState('')
	const [ov, setOv] = useState<ManualOverride>(DEFAULT)
	const sendTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	useEffect(() => {
		api.getPatch().then((p) => {
			setEntries(p.entries)
			if (p.entries[0]) setSelId(p.entries[0].id)
		})
	}, [])

	const pushOverride = (next: ManualOverride) => {
		setOv(next)
		if (!selId) return
		if (sendTimer.current) clearTimeout(sendTimer.current)
		sendTimer.current = setTimeout(() => {
			api.setOverride(selId, next).catch(() => undefined)
		}, 60)
	}

	const set = <K extends keyof ManualOverride>(key: K, value: ManualOverride[K]) => pushOverride({ ...ov, [key]: value })

	const toggle = (enabled: boolean) => pushOverride({ ...ov, enabled })

	const hexToRgb = (hex: string) => ({
		red: parseInt(hex.slice(1, 3), 16),
		green: parseInt(hex.slice(3, 5), 16),
		blue: parseInt(hex.slice(5, 7), 16),
	})
	const rgbToHex = () =>
		'#' + [ov.red, ov.green, ov.blue].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')

	return (
		<div className="panel">
			<h2>Manual Test / Override</h2>
			<p className="muted">
				Take direct control of a patched fixture to verify it responds. While override is enabled, Art-Net is ignored for
				this fixture.
			</p>

			<div className="form-row">
				<label>
					Fixture
					<select value={selId} onChange={(e) => setSelId(e.target.value)}>
						<option value="">Select...</option>
						{entries.map((e) => (
							<option key={e.id} value={e.id}>
								{e.name} ({e.ip})
							</option>
						))}
					</select>
				</label>
				<label className="checkbox">
					<input type="checkbox" checked={ov.enabled} onChange={(e) => toggle(e.target.checked)} disabled={!selId} />
					Override enabled
				</label>
			</div>

			<div className="sliders">
				<Slider label="Dimmer" value={ov.dimmer} onChange={(v) => set('dimmer', v)} />
				<Slider label="Red" value={ov.red} onChange={(v) => set('red', v)} />
				<Slider label="Green" value={ov.green} onChange={(v) => set('green', v)} />
				<Slider label="Blue" value={ov.blue} onChange={(v) => set('blue', v)} />
				<Slider label="CCT (0=RGB)" value={ov.cct} onChange={(v) => set('cct', v)} />
				<label className="colorpick">
					Color
					<input type="color" value={rgbToHex()} onChange={(e) => pushOverride({ ...ov, ...hexToRgb(e.target.value) })} />
				</label>
			</div>

			<div className="actions">
				<button onClick={() => pushOverride({ ...DEFAULT, enabled: true })}>Full white</button>
				<button onClick={() => pushOverride({ ...ov, enabled: true, dimmer: 0 })}>Blackout</button>
				<button className="danger" onClick={() => toggle(false)}>
					Release to Art-Net
				</button>
			</div>
		</div>
	)
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
	return (
		<label className="slider">
			<span>
				{label} <b>{value}</b>
			</span>
			<input type="range" min={0} max={255} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} />
		</label>
	)
}
