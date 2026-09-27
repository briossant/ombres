// Plateau de tournage de la bande-annonce : Chrome headless (GPU), horloge virtuelle, HMR coupé,
// Math.random à graine, réglages du jeu imposés, capture image par image vers ffmpeg (mezzanine).
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium, devices } from 'playwright-core'
import { CHROME, GPU_ARGS } from '../../lib/browser.mjs'
import { VCLOCK, SEEDED_RANDOM } from './vclock.mjs'

export const ROOT = join(import.meta.dirname, '../../..')
export const WORK = join(ROOT, 'marketing/work')
export const CLIPS = join(WORK, 'clips')
export const PORT = Number(process.env.PORT ?? 8902)
export const ORIGIN = `http://localhost:${PORT}`
export const sleep = ms => new Promise(r => setTimeout(r, ms))

/** ffmpeg : $FFMPEG, sinon celui du PATH (nix shell nixpkgs#ffmpeg-full -c …). */
export const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
export const FFPROBE = process.env.FFPROBE ?? FFMPEG.replace(/ffmpeg$/, 'ffprobe')

/** Coupe le client HMR de Vite (les autres agents éditent le code pendant la capture). */
export function NOHMR() {
  const WS = window.WebSocket
  const isHmr = p => p === 'vite-hmr' || p === 'vite-ping' || (Array.isArray(p) && (p.includes('vite-hmr') || p.includes('vite-ping')))
  function Patched(url, protocols) {
    if (isHmr(protocols)) {
      const fake = new EventTarget()
      Object.assign(fake, { readyState: 0, send() {}, close() {}, url: String(url), protocol: '', binaryType: 'blob', bufferedAmount: 0 })
      return fake
    }
    return protocols === undefined ? new WS(url) : new WS(url, protocols)
  }
  Patched.prototype = WS.prototype
  Object.assign(Patched, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
  window.WebSocket = Patched
}

let browserP = null
export async function browser() {
  browserP ??= chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [...GPU_ARGS, '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--force-color-profile=srgb', ...(process.env.TRAILER_CHROME_ARGS ?? '').split(' ').filter(Boolean)],
  })
  return browserP
}
export async function closeBrowser() {
  if (browserP) await (await browserP).close()
  browserP = null
}

/**
 * Ouvre une page de tournage.
 * @param {{ path: string, w?: number, h?: number, seed?: number, settings?: object, mobile?: string,
 *           landscape?: boolean, init?: (Function | [Function, unknown])[], storage?: Record<string,string>, vclock?: boolean }} o
 */
export async function openPage(o) {
  const b = await browser()
  let ctxOpts = { viewport: { width: o.w ?? 1920, height: o.h ?? 1080 }, deviceScaleFactor: 1 }
  if (o.mobile) {
    const { defaultBrowserType: _i, ...d } = devices[o.mobile]
    ctxOpts = { ...d }
    if (o.landscape) ctxOpts.viewport = { width: d.viewport.height, height: d.viewport.width }
  }
  const ctx = await b.newContext(ctxOpts)
  await ctx.addInitScript(NOHMR)
  if (o.vclock !== false) await ctx.addInitScript(VCLOCK)
  await ctx.addInitScript(SEEDED_RANDOM, o.seed ?? 7)
  const storage = { ...(o.storage ?? {}) }
  if (o.settings) storage['ombres.settings.v1'] = JSON.stringify(o.settings)
  await ctx.addInitScript(s => {
    try {
      for (const [k, v] of Object.entries(s)) if (localStorage.getItem(k) === null || k === 'ombres.settings.v1') localStorage.setItem(k, v)
    } catch {}
  }, storage)
  for (const f of o.init ?? []) await (Array.isArray(f) ? ctx.addInitScript(f[0], f[1]) : ctx.addInitScript(f))
  const page = await ctx.newPage()
  const logs = []
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`)
  })
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`))
  page.__logs = logs
  await page.goto(`${ORIGIN}${o.path}`, { waitUntil: 'load' })
  return page
}

export async function waitFor(page, fn, arg, timeout = 60000, label = '') {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 })
  } catch {
    throw new Error(`timeout ${timeout} ms : ${label || fn.toString().slice(0, 100)}\n${(page.__logs ?? []).slice(-8).join('\n')}`)
  }
}

/** Avance le temps virtuel sans capturer (mise en place). */
export async function advance(page, seconds, fps = 60) {
  return page.evaluate(([s, f]) => window.__vt.advance(s * 1000, 1000 / f), [seconds, fps])
}

/** Flux ffmpeg : images JPEG sur l'entrée standard → mezzanine H.264 4:4:4 CRF 10 (aucune image sur le disque). */
export function encoder(out, fps, size = null) {
  mkdirSync(dirname(out), { recursive: true })
  // size : [w, h] imposée (les images peuvent changer de taille en cours de route, ex. passage en 4K)
  const vf = size ? ['-vf', `scale=${size[0]}:${size[1]}:flags=lanczos`] : []
  const ff = spawn(
    FFMPEG,
    ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', ...vf,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '10', '-pix_fmt', 'yuv444p', '-g', '30', '-r', String(fps), out],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  )
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg ${c} (${out})`)))))
  let n = 0
  return {
    out,
    get frames() {
      return n
    },
    async write(buf) {
      n++
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
    },
    async close() {
      ff.stdin.end()
      await done
    },
  }
}

/** Capture JPEG (qualité 92) de la page via CDP. */
export async function grab(cdp, clip) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })
  return Buffer.from(data, 'base64')
}

/** Classe `clean` sur <html> : l'UI DOM disparaît, seul le canvas reste (voir CLEAN_CSS). */
export function CLEAN_CSS() {
  const add = () => {
    const st = document.createElement('style')
    st.textContent = 'html.clean body *{visibility:hidden!important} html.clean canvas{visibility:visible!important}'
    document.head.appendChild(st)
  }
  if (document.head) add()
  else document.addEventListener('DOMContentLoaded', add)
}
export const setClean = (page, on) => page.evaluate(on => document.documentElement.classList.toggle('clean', on), on)

/**
 * Tourne un plan : une image après chaque pas de temps virtuel `dt(i)` secondes (1/60 : temps réel lu
 * à 60 i/s ; 1/240 : ralenti × 4). `variants` : plusieurs versions de la même image (ex. avec et sans
 * UI), chacune dans son propre fichier. `until(i)` (facultatif) arrête le plan ; `before(i)` / `after(i)`
 * pilotent la scène et journalisent.
 * @returns {Promise<{ frames: number, outs: string[] }>}
 */
export async function shoot(page, { name, frames = Infinity, dt = 1 / 60, fps = 60, before, after, until, variants = [{ suffix: '', clean: null }], keep = [], size = null }) {
  const dtOf = typeof dt === 'function' ? dt : () => dt
  const encs = variants.map(v => ({ v, enc: encoder(join(CLIPS, `${name}${v.suffix}.mp4`), fps, size) }))
  let lastBuf = null
  const cdp = await page.context().newCDPSession(page)
  const t0 = Date.now()
  let clean = null
  let i = 0
  for (; i < frames; i++) {
    if (until && (await until(i))) break
    if (before) await before(i)
    await page.evaluate(ms => window.__vt.step(ms), dtOf(i) * 1000)
    for (const { v, enc } of encs) {
      if (v.when && !v.when(i)) continue
      if (v.clean !== null && v.clean !== clean) {
        await setClean(page, v.clean)
        clean = v.clean
      }
      const buf = await grab(cdp)
      lastBuf = buf
      await enc.write(buf)
      if (keep.includes(i)) {
        const d = join(WORK, 'stills', name + v.suffix)
        mkdirSync(d, { recursive: true })
        writeFileSync(join(d, `${String(i).padStart(5, '0')}.jpg`), buf)
      }
    }
    if (after) await after(i, lastBuf)
    if (i % 300 === 299) process.stdout.write(`  ${name} ${i + 1} (${((Date.now() - t0) / (i + 1)).toFixed(0)} ms/img)\n`)
  }
  for (const { enc } of encs) await enc.close()
  await cdp.detach().catch(() => {})
  return { frames: i, outs: encs.map(e => e.enc.out) }
}

export function probeDuration(file) {
  return Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())
}

export function fileMB(f) {
  return existsSync(f) ? +(statSync(f).size / 1048576).toFixed(2) : 0
}

export function ensureDir(f) {
  mkdirSync(dirname(f), { recursive: true })
}
