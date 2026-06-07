import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

await build({
	entryPoints: [resolve(__dirname, 'src/server.ts')],
	bundle: true,
	platform: 'node',
	target: 'node20',
	format: 'cjs',
	outfile: resolve(__dirname, 'dist/server.cjs'),
	sourcemap: true,
	tsconfig: resolve(__dirname, 'tsconfig.json'),
	// node builtins are external automatically for platform:node.
	// Bundle ws + zod into the single file so the artifact is self-contained.
	logLevel: 'info',
})

console.log('Built server -> dist/server.cjs')
