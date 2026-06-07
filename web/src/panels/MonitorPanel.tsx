import { useState } from 'react'
import type { LiveData } from '../useLiveData'
import { DMX_UNIVERSE_SIZE } from '@shared'

export function MonitorPanel({ live }: { live: LiveData }) {
	const universes = Object.keys(live.dmx)
		.map((n) => parseInt(n, 10))
		.sort((a, b) => a - b)
	const [selected, setSelected] = useState<number | null>(null)
	const active = selected ?? universes[0] ?? null
	const u = active != null ? live.dmx[active] : undefined

	return (
		<div className="panel">
			<h2>Live Art-Net Monitor</h2>
			{universes.length === 0 && <p className="muted">No Art-Net data received yet. Send DMX to this machine.</p>}

			{universes.length > 0 && (
				<>
					<div className="form-row">
						<label>
							Universe
							<select value={active ?? ''} onChange={(e) => setSelected(parseInt(e.target.value, 10))}>
								{universes.map((n) => (
									<option key={n} value={n}>
										{n}
									</option>
								))}
							</select>
						</label>
						{u && (
							<span className="muted">
								{u.fps} fps · source {u.sourceIp ?? '-'}
							</span>
						)}
					</div>

					{u && (
						<div className="dmxgrid">
							{Array.from({ length: DMX_UNIVERSE_SIZE }, (_, i) => {
								const v = u.data[i] ?? 0
								return (
									<div key={i} className={`cell ${v > 0 ? 'active' : ''}`} title={`Ch ${i + 1}: ${v}`}>
										<span className="ch">{i + 1}</span>
										<span className="val" style={{ opacity: 0.25 + (v / 255) * 0.75 }}>
											{v}
										</span>
									</div>
								)
							})}
						</div>
					)}
				</>
			)}
		</div>
	)
}
