// Prépare le dossier deploy/ soumis à Magic Deploy : configuration.nix (versionné) et
// server.mjs (bundle esbuild). Le site lui-même est téléversé ensuite par
// tools/deploy-upload.mjs (le proxy de Magic Deploy limite une requête à ~1 Mio).
import { cpSync, existsSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const bundle = join(root, 'dist-server/server.mjs')
if (!existsSync(join(root, 'dist')) || !existsSync(bundle)) {
  console.error('Build manquant : lance `pnpm build` d’abord.')
  process.exit(1)
}
rmSync(join(root, 'deploy/public'), { recursive: true, force: true })
cpSync(bundle, join(root, 'deploy/server.mjs'))
const size = statSync(join(root, 'deploy/server.mjs')).size
if (size > 700 * 1024) throw new Error(`server.mjs trop gros pour Magic Deploy (${size} o)`)

// Jeton de téléversement (secret UPLOAD_TOKEN de la machine), créé une fois, jamais versionné.
const tokenFile = join(root, '.secrets/upload-token')
if (!existsSync(tokenFile)) writeFileSync(tokenFile, randomBytes(32).toString('hex') + '\n', { mode: 0o600 })
console.log(`deploy/ prêt : configuration.nix + server.mjs (${(size / 1024).toFixed(0)} Kio) ; jeton dans .secrets/upload-token`)
