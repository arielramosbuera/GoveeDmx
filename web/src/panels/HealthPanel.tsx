import type { LiveData } from '../useLiveData'
import type { HealthLevel } from '@shared'

function Dot({ level }: { level: HealthLevel }) {
	return <span className={`dot ${level}`} title={level} />
}

export function HealthPanel({ live }: { live: LiveData }) {
	const h = live.health

	return (
		<div className="panel">
			<h2>Dashboard</h2>
			{!h && <p className="muted">Waiting for status...</p>}
			{h && (
				<div className="cards">
					<div className="card">
						<h3>
							<Dot level={h.app.level} /> Application
						</h3>
						<ul className="kv">
							<li>
								<span>Uptime</span>
								<b>{h.app.uptimeSec}s</b>
							</li>
							<li>
								<span>Memory</span>
								<b>{h.app.memoryMb} MB</b>
							</li>
							<li>
								<span>Engine</span>
								<b>{h.app.engineFps} fps</b>
							</li>
							<li>
								<span>Event loop lag</span>
								<b>{h.app.eventLoopLagMs} ms</b>
							</li>
						</ul>
					</div>

					<div className="card">
						<h3>
							<Dot level={h.artnet.level} /> Art-Net
						</h3>
						<ul className="kv">
							<li>
								<span>Listening</span>
								<b>{h.artnet.listening ? 'Yes' : 'No'}</b>
							</li>
							<li>
								<span>Bind</span>
								<b>
									{h.artnet.bindAddress}:{h.artnet.port}
								</b>
							</li>
							<li>
								<span>Total packets</span>
								<b>{h.artnet.totalPackets}</b>
							</li>
						</ul>
						<table className="mini">
							<thead>
								<tr>
									<th>Universe</th>
									<th>FPS</th>
									<th>Source</th>
								</tr>
							</thead>
							<tbody>
								{h.artnet.universes.length === 0 && (
									<tr>
										<td colSpan={3} className="muted">
											No DMX received yet
										</td>
									</tr>
								)}
								{h.artnet.universes.map((u) => (
									<tr key={u.universe}>
										<td>{u.universe}</td>
										<td>{u.fps}</td>
										<td>{u.sourceIp ?? '-'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<div className="card">
						<h3>Bulbs ({h.bulbs.length})</h3>
						<ul className="kv">
							<li>
								<span>Online</span>
								<b>{h.bulbs.filter((b) => b.online).length}</b>
							</li>
							<li>
								<span>Patched fixtures</span>
								<b>{h.patchCount}</b>
							</li>
						</ul>
					</div>
				</div>
			)}

			<h3>Live log</h3>
			<div className="logbox">
				{live.logs.length === 0 && <div className="muted">No log messages yet.</div>}
				{live.logs
					.slice()
					.reverse()
					.map((l, i) => (
						<div key={i} className={`logline ${l.level}`}>
							<span className="ts">{new Date(l.timeMs).toLocaleTimeString()}</span>
							<span className="lvl">{l.level.toUpperCase()}</span>
							<span>{l.message}</span>
						</div>
					))}
			</div>
		</div>
	)
}
