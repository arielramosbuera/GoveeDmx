import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@shared': resolve(repoRoot, 'shared/src/index.ts'),
		},
	},
	server: {
		fs: { allow: [repoRoot] },
		proxy: {
			'/api': 'http://localhost:8080',
			'/ws': { target: 'ws://localhost:8080', ws: true },
		},
	},
	build: {
		outDir: 'dist',
		emptyOutDir: true,
	},
})
