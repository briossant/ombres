// Assemble le dossier deploy/ soumis à Magic Deploy : configuration.nix (versionné),
// server.mjs (bundle esbuild) et public/ (build Vite). Lancer après `pnpm build`.
import { cpSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const dist = join(root, 'dist')
const bundle = join(root, 'dist-server/server.mjs')
if (!existsSync(dist) || !existsSync(bundle)) {
  console.error('Build manquant : lance `pnpm build` d’abord.')
  process.exit(1)
}
rmSync(join(root, 'deploy/public'), { recursive: true, force: true })
cpSync(dist, join(root, 'deploy/public'), { recursive: true })
cpSync(bundle, join(root, 'deploy/server.mjs'))

let bytes = 0
let files = 0
const walk = d => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    const s = statSync(p)
    if (s.isDirectory()) walk(p)
    else { bytes += s.size; files++ }
  }
}
walk(join(root, 'deploy'))
console.log(`deploy/ prêt : ${files} fichiers, ${(bytes / 1e6).toFixed(1)} Mo`)
