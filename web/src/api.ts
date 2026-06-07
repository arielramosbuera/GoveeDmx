import type { AppConfig, ArtNetConfig, BulbHealth, GoveeConfig, ManualOverride, PatchEntry, Personality } from '@shared'

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
	const res = await fetch(url, {
		method,
		headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	})
	const text = await res.text()
	const data = text ? JSON.parse(text) : undefined
	if (!res.ok) {
		const message = (data && (data.error as string)) || `HTTP ${res.status}`
		throw new Error(message)
	}
	return data as T
}

export const api = {
	getConfig: () => request<AppConfig>('GET', '/api/config'),
	getPersonalities: () => request<Record<string, Personality>>('GET', '/api/personalities'),
	updateArtNet: (cfg: Partial<ArtNetConfig>) => request('PUT', '/api/config/artnet', cfg),
	updateGovee: (cfg: Partial<GoveeConfig>) => request('PUT', '/api/config/govee', cfg),

	getBulbs: () => request<BulbHealth[]>('GET', '/api/bulbs'),
	scan: () => request('POST', '/api/bulbs/scan'),
	attachBulb: (ip: string, name?: string) => request('POST', '/api/bulbs/attach', { ip, name }),
	addManualBulb: (ip: string, name?: string) => request('POST', '/api/bulbs/manual', { ip, name }),
	detachBulb: (ip: string) => request('DELETE', `/api/bulbs/${encodeURIComponent(ip)}`),
	testBulb: (ip: string, opts: Record<string, unknown>) => request('POST', '/api/bulbs/test', { ip, ...opts }),

	getPatch: () => request<{ entries: PatchEntry[]; conflicts: { a: string; b: string; universe: number }[] }>('GET', '/api/patch'),
	addPatch: (input: Partial<PatchEntry> & { mac?: string; ip?: string }) =>
		request<{ ok: boolean; error?: string; entry?: PatchEntry }>('POST', '/api/patch', input),
	updatePatch: (id: string, partial: Partial<PatchEntry>) =>
		request<{ ok: boolean; error?: string; entry?: PatchEntry }>('PUT', `/api/patch/${id}`, partial),
	removePatch: (id: string) => request('DELETE', `/api/patch/${id}`),
	setOverride: (id: string, override: ManualOverride) => request('POST', `/api/patch/${id}/override`, override),
}
