// Téléverse le build (dist/) sur la machine Magic Deploy (voir server/deploy.ts).
//   node tools/deploy-upload.mjs <https://…>      (jeton lu dans .secrets/upload-token)
// Seuls les fichiers modifiés sont envoyés, par morceaux < 1 Mio (limite du proxy).
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const base = (process.argv[2] ?? process.env.OMBRES_URL ?? '').replace(/\/$/, '')
if (!base) {
  console.error('usage : node tools/deploy-upload.mjs <url du jeu>')
  process.exit(2)
}
const token = readFileSync(join(root, '.secrets/upload-token'), 'utf8').trim()
const auth = { authorization: `Bearer ${token}` }
const dist = join(root, 'dist')
const PART = 800 * 1024

const files = {}
const walk = d => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else files[relative(dist, p).split(sep).join('/')] = createHash('sha256').update(readFileSync(p)).digest('hex')
  }
}
walk(dist)

async function call(method, path, body, headers = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${base}/__deploy/${path}`, { method, body, headers: { ...auth, ...headers } })
      const text = await res.text()
      if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`)
      return JSON.parse(text)
    } catch (err) {
      if (attempt >= 4) throw err
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
  }
}

const remote = (await call('GET', 'manifest')).files ?? {}
const todo = Object.entries(files).filter(([path, hash]) => remote[path] !== hash)
const uploads = []
for (const [path, hash] of todo) {
  const buf = readFileSync(join(dist, path))
  const count = Math.max(1, Math.ceil(buf.length / PART))
  for (let i = 0; i < count; i++) uploads.push({ path, hash, i, count, body: buf.subarray(i * PART, (i + 1) * PART) })
}
let done = 0
let bytes = 0
const worker = async () => {
  while (uploads.length) {
    const u = uploads.shift()
    await call('PUT', `part?hash=${u.hash}&index=${u.i}&count=${u.count}`, u.body, { 'content-type': 'application/octet-stream' })
    done++
    bytes += u.body.length
    if (done % 50 === 0) console.log(`  ${done} morceaux, ${(bytes / 1e6).toFixed(1)} Mo`)
  }
}
console.log(`${Object.keys(files).length} fichiers, ${todo.length} à envoyer (${uploads.length} morceaux)`)
await Promise.all([worker(), worker(), worker(), worker()])
const result = await call('POST', 'commit', JSON.stringify({ files }), { 'content-type': 'application/json' })
console.log(`Site en ligne : ${result.files} fichiers, ${(result.bytes / 1e6).toFixed(1)} Mo — ${base}`)
