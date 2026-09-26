// Outils du critique « game feel » (polish) : PC piloté au clavier, enregistrement continu
// (screencast CDP) avec rafales d'images autour des événements, journal des événements de la sim.
//   PORT=8822 ; captures dans shots/polish/feel/<scénario>/.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { launch, newContext, collectLogs } from '../../lib/browser.mjs'

export const PORT = Number(process.env.PORT ?? 8822)
export const ORIGIN = `http://localhost:${PORT}`
export const sleep = ms => new Promise(r => setTimeout(r, ms))
export const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
export const flag = k => process.argv.includes(`--${k}`)
export const ROOT = join(import.meta.dirname, '../../..')

export function outDir(name) {
  const dir = join(ROOT, 'shots/polish/feel', name)
  mkdirSync(dir, { recursive: true })
  return dir
}

export async function waitFor(page, fn, a, timeout = 30000, label = '') {
  try {
    await page.waitForFunction(fn, a, { timeout, polling: 100 })
  } catch {
    throw new Error(`timeout (${timeout} ms) : ${label || fn.toString().slice(0, 120)}`)
  }
}

/** PC 1920×1080, réglages persistés, ?debug. */
export async function openPC({ query = '?debug=nosave', settings = {}, w = 1920, h = 1080 } = {}) {
  const browser = await launch()
  const ctx = await newContext(browser, { w, h })
  const pc = await ctx.newPage()
  const logs = collectLogs(pc)
  await pc.addInitScript(p => {
    try {
      const k = 'ombres.settings.v1'
      const s = JSON.parse(localStorage.getItem(k) ?? '{}')
      localStorage.setItem(k, JSON.stringify({ ...s, ...p }))
    } catch {}
  }, { lang: 'fr', ...settings })
  await pc.goto(`${ORIGIN}/${query}`, { waitUntil: 'load' })
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
  const cdp = await ctx.newCDPSession(pc)
  return { browser, ctx, pc, cdp, logs }
}

/** Titre → salon (Entrée, Entrée), comme un joueur. */
export async function toLobby(pc) {
  await sleep(1200)
  await pc.keyboard.press('Enter')
  await sleep(500)
  await pc.keyboard.press('Enter')
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 15000, 'salon')
  await sleep(600)
}

/**
 * Compose le salon : groupes clavier (Espace / AltGr), puis bots explicites
 * (remplace la composition automatique si `bots` est donné).
 */
export async function setupRoster(pc, { groups = [1], bots = null } = {}) {
  for (const g of groups) {
    await pc.keyboard.press(g === 1 ? 'Space' : 'AltRight')
    await sleep(500)
  }
  if (bots) {
    await pc.evaluate(bots => {
      const o = window.__ombres
      const r = o.runner
      for (const p of o.useRoster.getState().slots.filter(s => s.kind === 'bot')) r.removeBot(p.slot)
      for (const b of bots) r.addBot(b.p ?? null, b.lv ?? 1)
    }, bots)
    await sleep(600)
  }
  return pc.evaluate(() =>
    window.__ombres.useRoster.getState().slots.map(s => ({ slot: s.slot, kind: s.kind, color: s.colorIndex, name: s.name, bot: s.bot, group: s.group })),
  )
}

/** Journal des événements de la sim + textes visibles, horodatés en temps réel (Date.now()). */
export async function installTap(pc) {
  await pc.evaluate(() => {
    const o = window.__ombres
    const L = (window.__feel = [])
    const simT = () => o.runner.sim?.state.sun.t ?? null
    o.simEvents.on(e => {
      if (e.type === 'paleOnStrong' || e.type === 'altitude' || e.type === 'flapReady' || e.type === 'stunEnd' || e.type === 'immuneEnd') {
        // fréquents : comptés seulement
        window.__feelCount = window.__feelCount ?? {}
        window.__feelCount[e.type] = (window.__feelCount[e.type] ?? 0) + 1
        return
      }
      L.push({ w: Date.now(), t: simT(), k: 'ev', e: JSON.parse(JSON.stringify(e)) })
    })
    const seen = new Map()
    const txt = sel => [...document.querySelectorAll(sel)].map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)
    let prevScreen = null
    setInterval(() => {
      const sc = o.useUi.getState().screen
      if (sc !== prevScreen) {
        L.push({ w: Date.now(), t: simT(), k: 'screen', v: sc })
        prevScreen = sc
      }
      const now = Date.now()
      for (const [k, sel] of [
        ['sub', '.subtitle-wrap .recitatif'],
        ['banner', '.banner'],
        ['hint', '.hint__text'],
        ['toast', '.toast'],
      ]) {
        for (const t of txt(sel)) {
          const key = `${k}:${t}`
          const last = seen.get(key) ?? 0
          if (now - last > 4000) L.push({ w: now, t: simT(), k, v: t })
          seen.set(key, now)
        }
      }
    }, 150)
  })
}
export const drainTap = pc => pc.evaluate(() => window.__feel.splice(0))

/**
 * Enregistreur continu (CDP screencast) : anneau des dernières images en mémoire, sauvegarde
 * des fenêtres autour des événements marqués et d'une image de survol toutes les `overviewMs`.
 */
export class Recorder {
  constructor(cdp, dir, { quality = 62, keepMs = 2500, overviewMs = 2000, maxWidth = 1920, maxHeight = 1080 } = {}) {
    this.cdp = cdp
    this.dir = dir
    this.quality = quality
    this.keepMs = keepMs
    this.overviewMs = overviewMs
    this.maxWidth = maxWidth
    this.maxHeight = maxHeight
    this.ring = []
    this.windows = [] // { name, from, to, saved:Set }
    this.lastOverview = 0
    this.nOverview = 0
    this.frames = 0
    this.frameTimes = []
    this.tag = 'x'
  }
  async start() {
    this.cdp.on('Page.screencastFrame', f => this.onFrame(f))
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: this.quality, maxWidth: this.maxWidth, maxHeight: this.maxHeight, everyNthFrame: 1 })
  }
  async stop() {
    await this.cdp.send('Page.stopScreencast').catch(() => {})
  }
  onFrame(f) {
    this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
    const t = Math.round((f.metadata.timestamp ?? Date.now() / 1000) * 1000)
    const fr = { t, data: f.data }
    this.frames++
    this.frameTimes.push(t)
    this.ring.push(fr)
    while (this.ring.length && t - this.ring[0].t > this.keepMs) this.ring.shift()
    for (const w of this.windows) if (t >= w.from && t <= w.to) this.save(w, fr)
    this.windows = this.windows.filter(w => t <= w.to)
    if (this.overviewMs > 0 && t - this.lastOverview >= this.overviewMs) {
      this.lastOverview = t
      const f2 = join(this.dir, `ov-${this.tag}-${String(++this.nOverview).padStart(4, '0')}.jpg`)
      writeFileSync(f2, Buffer.from(fr.data, 'base64'))
    }
  }
  save(w, fr) {
    if (w.saved.has(fr.t)) return
    w.saved.add(fr.t)
    const rel = fr.t - w.at
    const lab = `${String(fr.t - w.from).padStart(5, '0')}_${rel < 0 ? 'm' : 'p'}${(Math.abs(rel) / 1000).toFixed(2)}`
    writeFileSync(join(this.dir, `${w.name}_${lab}.jpg`), Buffer.from(fr.data, 'base64'))
  }
  /** Marque une fenêtre [at − pre, at + post] (ms, temps réel) à sauvegarder. */
  mark(name, at, pre = 800, post = 1800) {
    const w = { name, at, from: at - pre, to: at + post, saved: new Set() }
    for (const fr of this.ring) if (fr.t >= w.from && fr.t <= w.to) this.save(w, fr)
    this.windows.push(w)
    return w
  }
  fps() {
    const ts = this.frameTimes
    if (ts.length < 2) return 0
    return ((ts.length - 1) * 1000) / (ts[ts.length - 1] - ts[0])
  }
}

/** Planche contact (ImageMagick) : fichiers → une image. */
export function sheet(files, out, { tile = '4x', geometry = '640x360+2+2', label = true } = {}) {
  if (!files.length) return null
  const args = []
  if (label) args.push('-label', '%t')
  args.push(...files, '-tile', tile, '-geometry', geometry, '-pointsize', '14', '-background', '#222', '-fill', '#eee', out)
  execFileSync('montage', args)
  return out
}

/** Instantané de l'état (joueur, positions, parts). */
export function snap(pc) {
  return pc.evaluate(() => {
    const o = window.__ombres
    const r = o.runner
    const st = r.sim?.state
    if (!st) return null
    const g = st.grid
    const share = [...g.counts].map(c => +(c / g.arenaCells * 100).toFixed(1))
    return {
      phase: r.phase,
      screen: o.useUi.getState().screen,
      t: +st.sun.t.toFixed(2),
      sunPhase: st.sun.phase,
      crown: st.crownSlot,
      share,
      birds: st.birds.map(b => ({ s: b.slot, x: +b.x.toFixed(1), y: +b.y.toFixed(1), z: +b.z.toFixed(1), dive: b.dive, stun: +b.stun.toFixed(2), hid: b.hidden, night: b.inNight, storm: b.inStorm })),
    }
  })
}

/**
 * Sonde de lisibilité (serveur de dev seulement : importe les modules de l'app par leur chemin Vite) :
 * toutes les 250 ms, position écran (hudAnchors) et envergure à l'écran (birdAnchors.spanPx, px 1080p)
 * de chaque oiseau, phase du soleil, rectangle de la bande de sable.
 */
export async function installReadProbe(pc) {
  await pc.evaluate(async () => {
    const vm = await import('/src/host/ui/viewModel.ts')
    const an = await import('/src/host/render/bird/anchors.ts')
    const o = window.__ombres
    const S = (window.__feelRead = [])
    setInterval(() => {
      const r = o.runner
      const st = r.sim?.state
      if (!st || r.phase !== 'round' || o.useUi.getState().screen !== 'game') return
      const bar = document.querySelector('.sandbar, .sand-bar, [class*="sandbar"]')?.getBoundingClientRect()
      const birds = st.birds.map(b => {
        const a = vm.hudAnchors.birds[b.slot]
        return { s: b.slot, x: Math.round(a.x), y: Math.round(a.y), span: Math.round(an.birdAnchors.spanPx[b.slot]), hid: a.hidden, z: +b.z.toFixed(1) }
      })
      S.push({ t: +st.sun.t.toFixed(2), ph: st.sun.phase, W: innerWidth, H: innerHeight, barBottom: bar ? Math.round(bar.bottom) : null, birds })
    }, 250)
  })
}
export const drainRead = pc => pc.evaluate(() => window.__feelRead.splice(0))
