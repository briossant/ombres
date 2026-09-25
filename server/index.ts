// Serveur Ombres : sert le jeu (Vite en dev, dist/ en prod) et relaie les
// WebSocket entre le PC hôte et les téléphones. Aucune logique de jeu ici.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { WebSocketServer, type WebSocket } from 'ws'
import { WS_PATH } from '../src/shared/protocol.ts'
import { attachHost, attachPhone, roomStats, sweepRooms } from './rooms.ts'

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
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.gltf', '.txt'])
const cache = new Map<string, { raw: Buffer; gz: Buffer | null }>()

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://x')
  let path = decodeURIComponent(url.pathname)
  if (path === '/' || path === '') path = '/index.html'
  else if (path === '/play' || path === '/play/') path = '/play.html'
  const file = normalize(join(DIST, path))
  if (!file.startsWith(DIST)) {
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
    entry = { raw, gz: COMPRESSIBLE.has(ext) && raw.length > 1024 ? gzipSync(raw, { level: 9 }) : null }
    cache.set(file, entry)
  }
  const headers: Record<string, string> = {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  }
  const acceptsGz = /\bgzip\b/.test(req.headers['accept-encoding']?.toString() ?? '')
  if (entry.gz && acceptsGz) {
    headers['content-encoding'] = 'gzip'
    headers['vary'] = 'accept-encoding'
    res.writeHead(200, headers).end(entry.gz)
  } else res.writeHead(200, headers).end(entry.raw)
}

// ─── Serveur HTTP + Vite (dev) ─────────────────────────────────────────────

const server = createServer()
let handler: (req: IncomingMessage, res: ServerResponse) => void

if (PROD) {
  handler = (req, res) => {
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
