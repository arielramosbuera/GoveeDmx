import { useState } from 'react'
import { useLiveData } from './useLiveData'
import { HealthPanel } from './panels/HealthPanel'
import { ArtNetPanel } from './panels/ArtNetPanel'
import { ScanPanel } from './panels/ScanPanel'
import { PatchPanel } from './panels/PatchPanel'
import { ManualTestPanel } from './panels/ManualTestPanel'
import { MonitorPanel } from './panels/MonitorPanel'

type Tab = 'dashboard' | 'artnet' | 'scan' | 'patch' | 'test' | 'monitor'

const TABS: { id: Tab; label: string }[] = [
	{ id: 'dashboard', label: 'Dashboard' },
	{ id: 'artnet', label: 'Art-Net' },
	{ id: 'scan', label: 'Bulbs' },
	{ id: 'patch', label: 'Patch' },
	{ id: 'test', label: 'Manual Test' },
	{ id: 'monitor', label: 'Art-Net Monitor' },
]

export function App() {
	const [tab, setTab] = useState<Tab>('dashboard')
	const live = useLiveData()

	return (
		<div className="app">
			<header className="topbar">
				<div className="brand">
					<span className="logo">●</span> GoveeDMX
					<span className="subtitle">Art-Net → Govee LAN bridge</span>
				</div>
				<div className={`conn ${live.connected ? 'on' : 'off'}`}>{live.connected ? 'Connected' : 'Disconnected'}</div>
			</header>

			<nav className="tabs">
				{TABS.map((t) => (
					<button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
						{t.label}
					</button>
				))}
			</nav>

			<main className="content">
				{tab === 'dashboard' && <HealthPanel live={live} />}
				{tab === 'artnet' && <ArtNetPanel />}
				{tab === 'scan' && <ScanPanel bulbs={live.bulbs} />}
				{tab === 'patch' && <PatchPanel bulbs={live.bulbs} />}
				{tab === 'test' && <ManualTestPanel />}
				{tab === 'monitor' && <MonitorPanel live={live} />}
			</main>
		</div>
	)
}
