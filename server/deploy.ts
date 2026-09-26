// Mise à jour du site par téléversement, pour l'hébergement Magic Deploy.
//
// Pourquoi : le proxy de Magic Deploy refuse toute requête de plus de ~1 Mio, alors
// que le jeu pèse ~20 Mo. La machine ne reçoit donc que la configuration et ce
// serveur ; le site (build Vite) vit dans un volume persistant et se téléverse
// ici, par morceaux de moins de 1 Mio, avec vérification SHA-256 et bascule atomique.
//
// Activé seulement si un jeton est fourni (fichier OMBRES_UPLOAD_TOKEN_FILE, secret
// Magic Deploy hors du store Nix). Client : tools/deploy-upload.mjs.
//
//   GET  /__deploy/manifest                     → { files: { chemin: sha256 } } du site servi
//   PUT  /__deploy/part?hash=…&index=i&count=n  → un morceau du fichier de ce SHA-256 (corps brut)
//   POST /__deploy/commit                       → { files: { chemin: sha256 } } : assemble,
//        vérifie, copie les fichiers inchangés depuis le site courant, bascule.
import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'

const MAX_PART = 1024 * 1024
const MAX_FILES = 4000
const MAX_TOTAL = 200 * 1024 * 1024
const SAFE_PATH = /^[A-Za-z0-9._\-/]+$/

export interface DeployHandler {
  handle(req: IncomingMessage, res: ServerResponse): boolean
}

function loadToken(): Buffer | null {
  const file = process.env.OMBRES_UPLOAD_TOKEN_FILE
  if (!file || !existsSync(file)) return null
  const token = readFileSync(file, 'utf8').trim()
  return token.length >= 32 ? Buffer.from(token) : null
}

function safeRel(path: string): string | null {
  if (!SAFE_PATH.test(path) || path.includes('..') || path.startsWith('/')) return null
  const norm = normalize(path)
  return norm.startsWith('..') || norm.includes(`..${sep}`) ? null : norm
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) throw new Error('corps trop grand')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex')

/**
 * @param siteDir dossier servi (dans le volume), remplacé atomiquement à chaque commit
 * @param onCommit appelé après une bascule (vider les caches du serveur statique)
 */
export function createDeployHandler(siteDir: string, onCommit: () => void): DeployHandler | null {
  const token = loadToken()
  if (!token) return null
  const incoming = `${siteDir}.incoming`
  const parts = `${siteDir}.parts`
  const manifestFile = `${siteDir}.manifest.json`

  const authorized = (req: IncomingMessage): boolean => {
    const header = req.headers.authorization ?? ''
    const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7).trim() : '')
    return given.length === token.length && timingSafeEqual(given, token)
  }

  const json = (res: ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
  }

  const readManifest = async (): Promise<Record<string, string>> => {
    try {
      return (JSON.parse(await readFile(manifestFile, 'utf8')) as { files: Record<string, string> }).files
    } catch {
      return {}
    }
  }

  const commit = async (wanted: Record<string, string>) => {
    const entries = Object.entries(wanted)
    if (entries.length === 0 || entries.length > MAX_FILES) throw new Error('manifeste invalide')
    const current = await readManifest()
    await rm(incoming, { recursive: true, force: true })
    let total = 0
    for (const [path, hash] of entries) {
      const rel = safeRel(path)
      if (!rel || !/^[0-9a-f]{64}$/.test(hash)) throw new Error(`chemin ou hash invalide : ${path}`)
      const dest = join(incoming, rel)
      await mkdir(dirname(dest), { recursive: true })
      if (current[path] === hash && existsSync(join(siteDir, rel))) {
        await copyFile(join(siteDir, rel), dest)
        total += (await stat(dest)).size
        continue
      }
      // Assemble les morceaux téléversés.
      const partDir = join(parts, hash)
      const names = (await readdir(partDir).catch(() => [] as string[])).sort()
      const count = names.length ? Number(names[0]!.split('-')[1]) : 0
      if (!count || names.length !== count) throw new Error(`morceaux manquants : ${path}`)
      const buf = Buffer.concat(await Promise.all(names.map(n => readFile(join(partDir, n)))))
      if (sha256(buf) !== hash) throw new Error(`hash différent : ${path}`)
      total += buf.length
      if (total > MAX_TOTAL) throw new Error('site trop gros')
      await writeFile(dest, buf)
    }
    // Bascule : l'ancien site est gardé le temps du renommage, puis supprimé.
    const old = `${siteDir}.old`
    await rm(old, { recursive: true, force: true })
    if (existsSync(siteDir)) await rename(siteDir, old)
    await rename(incoming, siteDir)
    await writeFile(manifestFile, JSON.stringify({ files: wanted }))
    await rm(old, { recursive: true, force: true })
    await rm(parts, { recursive: true, force: true })
    onCommit()
    return { files: entries.length, bytes: total }
  }

  return {
    handle(req, res) {
      const url = new URL(req.url ?? '/', 'http://x')
      if (!url.pathname.startsWith('/__deploy/')) return false
      if (!authorized(req)) {
        json(res, 401, { error: 'unauthorized' })
        return true
      }
      const route = url.pathname.slice('/__deploy/'.length)
      const run = async () => {
        if (req.method === 'GET' && route === 'manifest') return json(res, 200, { files: await readManifest() })
        if (req.method === 'PUT' && route === 'part') {
          const hash = url.searchParams.get('hash') ?? ''
          const index = Number(url.searchParams.get('index'))
          const count = Number(url.searchParams.get('count'))
          if (!/^[0-9a-f]{64}$/.test(hash) || !Number.isInteger(index) || !Number.isInteger(count) || index < 0 || count < 1 || index >= count || count > 400)
            return json(res, 400, { error: 'paramètres invalides' })
          const body = await readBody(req, MAX_PART)
          const dir = join(parts, hash)
          await mkdir(dir, { recursive: true })
          await writeFile(join(dir, `${String(index).padStart(4, '0')}-${count}`), body)
          return json(res, 200, { ok: true })
        }
        if (req.method === 'POST' && route === 'commit') {
          const body = JSON.parse((await readBody(req, MAX_PART)).toString('utf8')) as { files: Record<string, string> }
          return json(res, 200, await commit(body.files))
        }
        json(res, 404, { error: 'route inconnue' })
      }
      run().catch(err => json(res, 500, { error: String((err as Error).message ?? err) }))
      return true
    },
  }
}
