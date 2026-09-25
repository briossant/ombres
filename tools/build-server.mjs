// Bundle le serveur Node en un seul fichier ESM (dist-server/server.mjs), sans node_modules à déployer.
import { build } from 'esbuild'

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist-server/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['vite', 'bufferutil', 'utf-8-validate'],
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
})
