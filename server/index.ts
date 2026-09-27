// Serveur Ombres : sert le jeu (Vite en dev, dist/ en prod) et relaie les
// WebSocket entre le PC hôte et les téléphones. Aucune logique de jeu ici.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { WebSocketServer, type WebSocket } from 'ws'
import { WS_PATH } from '../src/shared/protocol.ts'
import { attachHost, attachPhone, roomStats, sweepRooms } from './rooms.ts'
import { createDeployHandler } from './deploy.ts'

const PROD = process.env.NODE_ENV === 'production'
const PORT = Number(process.env.PORT ?? (PROD ? 80 : 8787))
const HOST = process.env.HOST ?? '0.0.0.0'
const DIST = resolve(process.env.OMBRES_DIST ?? join(import.meta.dirname, PROD ? '../dist' : '../dist'))

function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address
    }
  }
  return null
}

/** Origine que les téléphones doivent ouvrir (encodée dans le QR code). */
function joinOriginFor(req: IncomingMessage): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '')
  const host = req.headers['x-forwarded-host']?.toString() ?? req.headers.host ?? `localhost:${PORT}`
  const proto = req.headers['x-forwarded-proto']?.toString().split(',')[0] ?? 'http'
  if (/^(localhost|127\.|\[::1\])/.test(host)) {
    const lan = lanAddress()
    if (lan) return `${proto}://${lan}:${host.split(':').pop() ?? PORT}`
  }
  return `${proto}://${host}`
}

// ─── Fichiers statiques (production) ───────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.gltf', '.txt'])
const cache = new Map<string, { raw: Buffer; gz: Buffer | null; etag: string }>()

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://x')
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400).end()
    return
  }
  if (path === '/' || path === '') path = '/index.html'
  else if (path === '/play' || path === '/play/') path = '/play.html'
  else if (path === '/m' || path === '/m/') path = '/m.html' // accueil des téléphones (index.html y redirige)
  const file = normalize(join(DIST, path))
  // Strictement sous DIST (pas dans un dossier voisin comme <DIST>.old ou <DIST>.parts).
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    res.writeHead(403).end()
    return
  }
  try {
    const st = await stat(file)
    if (!st.isFile()) throw new Error('not a file')
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('404')
    return
  }
  const ext = extname(file)
  let entry = cache.get(file)
  if (!entry) {
    const raw = await readFile(file)
    entry = {
      raw,
      gz: COMPRESSIBLE.has(ext) && raw.length > 1024 ? gzipSync(raw, { level: 9 }) : null,
      etag: `"${createHash('sha1').update(raw).digest('base64url')}"`,
    }
    cache.set(file, entry)
  }
  // Fichiers hachés par Vite : immuables. Le reste (HTML, audio, polices…) : revalidé par ETag,
  // donc un rafraîchissement du PC ne retélécharge rien qui n'ait changé.
  const headers: Record<string, string> = {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    etag: entry.etag,
    'accept-ranges': 'bytes',
  }
  if (req.headers['if-none-match'] === entry.etag) {
    res.writeHead(304, headers).end()
    return
  }
  // Requêtes partielles (lecture en continu de la musique par l'élément audio).
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range?.toString() ?? '')
  if (range && !entry.gz) {
    const size = entry.raw.length
    let start = range[1] ? Number(range[1]) : size - Number(range[2])
    let end = range[1] && range[2] ? Number(range[2]) : size - 1
    if (!range[1]) end = size - 1
    start = Math.max(0, start)
    end = Math.min(size - 1, end)
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` }).end()
      return
    }
    headers['content-range'] = `bytes ${start}-${end}/${size}`
    res.writeHead(206, headers).end(entry.raw.subarray(start, end + 1))
    return
  }
  const acceptsGz = /\bgzip\b/.test(req.headers['accept-encoding']?.toString() ?? '')
  if (entry.gz && acceptsGz) {
    headers['content-encoding'] = 'gzip'
    headers['vary'] = 'accept-encoding'
    res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : entry.gz)
  } else res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : entry.raw)
}

// ─── Serveur HTTP + Vite (dev) ─────────────────────────────────────────────

const server = createServer()
let handler: (req: IncomingMessage, res: ServerResponse) => void

if (PROD) {
  // Hébergement Magic Deploy : site téléversé dans un volume (voir server/deploy.ts).
  const deploy = createDeployHandler(DIST, () => cache.clear())
  if (deploy) console.log('Téléversement du site activé (/__deploy)')
  handler = (req, res) => {
    if (deploy?.handle(req, res)) return
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(roomStats()))
      return
    }
    serveStatic(req, res).catch(err => {
      console.error(err)
      if (!res.headersSent) res.writeHead(500).end()
    })
  }
} else {
  const { createServer: createVite } = await import('vite')
  const vite = await createVite({
    server: { middlewareMode: true, hmr: { server } },
    appType: 'mpa',
  })
  handler = (req, res) => {
    if (req.url === '/play' || req.url?.startsWith('/play?')) req.url = req.url.replace('/play', '/play.html')
    else if (req.url === '/m' || req.url?.startsWith('/m?') || req.url === '/m/') req.url = req.url.replace(/^\/m\/?/, '/m.html')
    vite.middlewares(req, res)
  }
}
server.on('request', (req, res) => handler(req, res))

// ─── WebSocket ─────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 })
const alive = new WeakSet<WebSocket>()

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (url.pathname !== WS_PATH) return // laisse passer le HMR de Vite
  wss.handleUpgrade(req, socket, head, ws => {
    const role = url.searchParams.get('role')
    const conn = role === 'host' ? attachHost(ws, joinOriginFor(req)) : attachPhone(ws)
    alive.add(ws)
    ws.on('pong', () => alive.add(ws))
    ws.on('message', data => {
      let msg: unknown
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      if (msg && typeof msg === 'object' && 't' in msg) conn.onMessage(msg as never)
    })
    ws.on('close', conn.onClose)
    ws.on('error', () => ws.terminate())
  })
})

// Détection des sockets morts + maintien des proxys.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate()
      continue
    }
    alive.delete(ws)
    ws.ping()
  }
  sweepRooms()
}, 15_000).unref()

server.listen(PORT, HOST, () => {
  const lan = lanAddress()
  console.log(`Ombres ${PROD ? 'prod' : 'dev'} — http://localhost:${PORT}${lan ? `  (LAN : http://${lan}:${PORT})` : ''}`)
})
