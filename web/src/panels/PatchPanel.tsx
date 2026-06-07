import { useEffect, useState } from 'react'
import { api } from '../api'
import type { BulbHealth, PatchEntry, Personality } from '@shared'

export function PatchPanel({ bulbs }: { bulbs: BulbHealth[] }) {
	const [entries, setEntries] = useState<PatchEntry[]>([])
	const [conflicts, setConflicts] = useState<{ a: string; b: string; universe: number }[]>([])
	const [personalities, setPersonalities] = useState<Record<string, Personality>>({})
	const [defaultUniverse, setDefaultUniverse] = useState(0)

	const [selIp, setSelIp] = useState('')
	const [name, setName] = useState('')
	const [universe, setUniverse] = useState(0)
	const [address, setAddress] = useState('')
	const [error, setError] = useState('')

	const refresh = async () => {
		const p = await api.getPatch()
		setEntries(p.entries)
		setConflicts(p.conflicts)
	}

	useEffect(() => {
		api.getPersonalities().then(setPersonalities)
		api.getConfig().then((c) => {
			setDefaultUniverse(c.artnet.universes[0] ?? 0)
			setUniverse(c.artnet.universes[0] ?? 0)
		})
		refresh()
	}, [])

	const personality = personalities['rgbcct7']
	const channelCount = personality?.channelCount ?? 7

	const add = async () => {
		setError('')
		const bulb = bulbs.find((b) => b.ip === selIp)
		if (!bulb) {
			setError('Select a bulb')
			return
		}
		const res = await api.addPatch({
			ip: bulb.ip,
			mac: bulb.mac,
			name: name || bulb.name,
			universe,
			startAddress: address.trim() ? parseInt(address, 10) : undefined,
		})
		if (!res.ok) {
			setError(res.error || 'Failed to patch')
			return
		}
		setName('')
		setAddress('')
		refresh()
	}

	const conflictIds = new Set(conflicts.flatMap((c) => [c.a, c.b]))

	return (
		<div className="panel">
			<h2>Patch</h2>

			<div className="addpatch">
				<select value={selIp} onChange={(e) => setSelIp(e.target.value)}>
					<option value="">Select bulb...</option>
					{bulbs.map((b) => (
						<option key={b.ip} value={b.ip}>
							{b.name} ({b.ip})
						</option>
					))}
				</select>
				<input placeholder="Fixture name" value={name} onChange={(e) => setName(e.target.value)} />
				<input
					type="number"
					title="Universe"
					value={universe}
					onChange={(e) => setUniverse(parseInt(e.target.value, 10) || 0)}
					style={{ width: 90 }}
				/>
				<input
					placeholder={`Addr (auto)`}
					value={address}
					onChange={(e) => setAddress(e.target.value)}
					style={{ width: 110 }}
				/>
				<button className="primary" onClick={add}>
					Patch fixture
				</button>
			</div>
			{error && <p className="error-text">{error}</p>}
			<p className="muted">
				Default universe {defaultUniverse}. Each fixture uses {channelCount} channels. Leave address blank to auto-assign the
				next free address.
			</p>

			<table className="grid">
				<thead>
					<tr>
						<th>Name</th>
						<th>IP</th>
						<th>Universe</th>
						<th>Channels</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{entries.length === 0 && (
						<tr>
							<td colSpan={5} className="muted">
								No fixtures patched yet.
							</td>
						</tr>
					)}
					{entries.map((e) => (
						<tr key={e.id} className={conflictIds.has(e.id) ? 'conflict' : ''}>
							<td>{e.name}</td>
							<td>{e.ip}</td>
							<td>{e.universe}</td>
							<td>
								{e.startAddress} – {e.startAddress + channelCount - 1}
							</td>
							<td>
								<button className="danger" onClick={() => api.removePatch(e.id).then(refresh)}>
									Remove
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{conflicts.length > 0 && <p className="error-text">Address conflicts detected (highlighted). Re-assign addresses.</p>}

			{personality && (
				<>
					<h3>DMX channel map — {personality.name}</h3>
					<table className="grid">
						<thead>
							<tr>
								<th>Channel offset</th>
								<th>Parameter</th>
								<th>Values</th>
							</tr>
						</thead>
						<tbody>
							{personality.channels.map((c) => (
								<tr key={c.key}>
									<td>+{c.offset}</td>
									<td>{c.name}</td>
									<td className="muted">{c.description}</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			)}
		</div>
	)
}
