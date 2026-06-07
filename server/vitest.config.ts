import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	resolve: {
		alias: {
			'@shared': resolve(__dirname, '../shared/src/index.ts'),
		},
	},
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
	},
})
