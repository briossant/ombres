// Correcteur antialiasing : même image figée (sim ET caméra gelées, comme tools/polish/world3/edges.mjs),
// plusieurs variantes de rendu (preset, ancien/nouveau shader d'encre, réglages SMAA…), captures PNG
// comparables au pixel près (recadrages : tools/polish/aa/crops.mjs).
//   PORT=8891 node --import ./tools/polish/world/nohmr.mjs tools/polish/aa/shots.mjs --name=midi \
//     --n=4 --times=10,95 [--seed=7] [--q=medium] [--w=1920 --h=1080] [--dsf=1] [--settle=2500] \
//     --v='avant-medium=__aa.before("medium")' --v='apres-medium=__aa.after("medium")'
//   --title : écran titre (démo) ; --times = secondes après l'apparition du titre.
//   --burst=10 : en plus, rafale de 10 images EN VOL (sim et caméra vivantes, dernière variante) pour juger
//   la stabilité des traits (scintillement).
//   --pan=10 --pv='avant=js' --pv='apres=js' : pour chaque variante --pv, 10 images, la caméra (figée) glissant
//   de --panpx px d'écran (défaut 0,15) par image vers la droite : scintillement et « rampement » des traits
//   sous un mouvement sous-pixel (<t>-pan-<variante>-<i>.png).
// Variantes : js évalué dans la page ; `__aa.before(q)` = presets et encre d'avant le correcteur AA,
// `__aa.after(q)` = code courant, `__aa.level(q)` = simple changement de preset, `__aa.ssaa(q)` = référence
// SSAA 4× (rendu 2× réduit par le compositeur), `__aa.ssaa(q, false)` pour en sortir.
// Images : shots/polish-aa/<name>/<t>-<variante>.png (HUD masqué).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, sleep, waitFor, presetSettings, lobbyWith, startMatch, collect } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const args = k => process.argv.filter(a => a.startsWith(`--${k}=`)).map(a => a.split('=').slice(1).join('='))
const NAME = arg('name', 'aa')
const N = Number(arg('n', '4'))
const SEED = Number(arg('seed', '7'))
const Q = arg('q', 'medium')
const SETTLE = Number(arg('settle', '2500'))
const TIMES = arg('times', '10').split(',').filter(Boolean)
const BURST = Number(arg('burst', '0'))
const PAN = Number(arg('pan', '0'))
const PANPX = Number(arg('panpx', '0.15'))
const PVARS = args('pv').map(v => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)] })
const W = Number(arg('w', '1920'))
const H = Number(arg('h', '1080'))
const DSF = Number(arg('dsf', '1'))
const VARS = args('v').map(v => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)] })
const dir = join(import.meta.dirname, '../../../shots/polish-aa', NAME)
mkdirSync(dir, { recursive: true })

// Ancien shader d'encre (avant le correcteur AA) : source figée à côté de ce script.
const LEGACY_INK = readFileSync(join(import.meta.dirname, 'legacy-ink.glsl'), 'utf8')
// Presets d'avant (quality.ts du 2026-09-26) : seuls les champs qui changent ici.
const BEFORE = {
  low: { targetHeight: 720, gbufferScale: 1, supersample: 1, smaa: null, smaaThreshold: undefined, hatching: false, granulation: false, ripples: false, pebbles: 800, pebbleShadows: false, shadowRes: 1024, farShadowRes: 512, thick: 1.0 },
  medium: { targetHeight: 900, gbufferScale: 1, supersample: 1, smaa: 0, smaaThreshold: undefined, hatching: true, granulation: true, ripples: true, pebbles: 1500, pebbleShadows: true, shadowRes: 2048, farShadowRes: 1024, thick: 1.25 },
  high: { targetHeight: 1080, gbufferScale: 1, supersample: 1, smaa: 0, smaaThreshold: undefined, hatching: true, granulation: true, ripples: true, pebbles: 1500, pebbleShadows: true, shadowRes: 2048, farShadowRes: 1024, thick: 1.5 },
}

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF })
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await pc.addInitScript(seed => {
  let s = seed >>> 0 || 1
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}, SEED)
// devicePixelRatio pilotable (référence SSAA : canevas en 2× affiché en 1× = moyenne 2×2 exacte du compositeur)
await pc.addInitScript(() => {
  const real = window.devicePixelRatio
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => window.__dprOverride ?? real })
})
const TITLE = process.argv.includes('--title')
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off', hints: 'off' })
await pc.goto(`${ORIGIN}/?debug=nosave${TITLE ? '' : ',fast&speed=4'}`, { waitUntil: 'load' })
let tTitle = 0
if (TITLE) {
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
  tTitle = Date.now()
} else {
  const got = await lobbyWith(pc, N, { rounds: 1, length: 'normal' })
  console.log(`oiseaux : ${got}`)
  await startMatch(pc)
}
await pc.addStyleTag({ content: 'body * { visibility: hidden !important } canvas { visibility: visible !important }' })
// outils de variantes dans la page
await pc.evaluate(
  ([legacy, before]) => {
    const store = window.__ombres.useRenderQuality
    const presets = window.__npr.presets
    const realDpr = window.devicePixelRatio
    const saved = {}
    for (const k of Object.keys(presets)) saved[k] = { ...presets[k] }
    let legacyOn = false
    const setInk = on => {
      const ink = window.__npr.ink?.()
      if (!ink) return
      if (ink.__origFS === undefined) ink.__origFS = ink.fragmentShader
      const want = on ? legacy : ink.__origFS
      if (ink.fragmentShader !== want) ink.setFragmentShader(want)
      legacyOn = on
    }
    // re-monte le pipeline avec le preset (nouvel objet → effets de NprPipeline / World rejoués) : un dpr
    // infinitésimalement différent fait re-rendre <WorldCanvas> sans changer de niveau (les oiseaux et les FX,
    // montés par App, gardent leur pose : les recadrages restent comparables au pixel près)
    const remount = q => {
      if (store.getState().level !== q) store.getState().setLevel(q)
      const cur = window.__dprOverride ?? window.devicePixelRatio
      window.__nudge = window.__nudge === 1e-6 ? 2e-6 : 1e-6
      window.__dprOverride = Math.round(cur * 1000) / 1000 + window.__nudge
      window.dispatchEvent(new Event('resize'))
    }
    window.__aa = {
      before(q) {
        presets[q] = { ...saved[q], ...before[q] }
        remount(q)
        setTimeout(() => setInk(true), 600)
        return true
      },
      after(q) {
        presets[q] = { ...saved[q] }
        remount(q)
        setTimeout(() => setInk(false), 600)
        return true
      },
      level(q) {
        store.getState().setLevel(q)
        setTimeout(() => setInk(legacyOn), 600)
        return true
      },
      patch(q, p) {
        presets[q] = { ...presets[q], ...p }
        remount(q)
        return true
      },
      ink: setInk,
      // référence SSAA 4× : rendu natif en 2× (plafond 2160p levé), réduit en 1× par le compositeur
      ssaa(q, on = true) {
        presets[q] = on ? { ...presets[q], targetHeight: 2160, gbufferScale: 1 } : { ...saved[q] }
        window.__dprOverride = on ? 2 * realDpr : realDpr
        remount(q)
        return true
      },
    }
  },
  [LEGACY_INK, BEFORE],
)
// repère la caméra de jeu (celle dont GameCamera appelle updateMatrixWorld à chaque image)
await pc.evaluate(() => {
  const O3 = Object.getPrototypeOf(Object.getPrototypeOf(window.__npr.scene))
  const orig = O3.updateMatrixWorld
  O3.updateMatrixWorld = function (f) {
    if (this.isPerspectiveCamera) window.__cam = this
    return orig.call(this, f)
  }
})
const freezeCam = on =>
  pc.evaluate(on => {
    const c = window.__cam
    if (!c) return false
    if (on) {
      c.position.copy = function () { return this }
      c.quaternion.copy = function () { return this }
    } else {
      delete c.position.copy
      delete c.quaternion.copy
    }
    return true
  }, on)
for (const t of TIMES) {
  if (TITLE) await sleep(Math.max(0, tTitle + Number(t) * 1000 - Date.now()))
  else
    await waitFor(
      pc,
      t => {
        const s = window.__ombres.runner.sim?.state
        if (window.__ombres.runner.phase !== 'round') return true
        if (!s || s.sun.t <= 0) return false
        return t.startsWith('pe') ? s.sun.paletteElevDeg <= Number(t.slice(2)) : s.sun.t >= (Number(t) * s.sun.T) / 110
      },
      t,
      400000,
      `cible ${t}`,
    )
  await pc.evaluate(() => { window.__ombres.runner.timeScale = () => 0 })
  await sleep(1200)
  if (!(await freezeCam(true))) console.log('!! caméra introuvable')
  await sleep(200)
  // cibles de recadrage (px du viewport) : tour la plus proche (chapeau, fût), oiseau le plus proche (+ icônes
  // au-dessus), bord du Simoun (point de l'ellipse de l'arène le plus à droite dans l'image)
  const targets = await pc.evaluate(() => {
    const c = window.__cam
    const s = window.__ombres.runner.sim?.state
    if (!c || !s) return null
    const V = c.position.constructor
    const W = innerWidth, H = innerHeight
    const k = H / 1080
    const proj = (x, y, z) => {
      const v = new V(x, y, z).project(c)
      return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, ok: v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.9 }
    }
    const box = (p, w, h, dy = 0) => ({ x: Math.round(Math.min(W - w * k, Math.max(0, p.x - (w * k) / 2))), y: Math.round(Math.min(H - h * k, Math.max(0, p.y - (h * k) / 2 + dy * k))), w: Math.round(w * k), h: Math.round(h * k) })
    const cp = c.position
    // tours à disque (parasol) d'abord : silhouettes des disques ; puis la plus proche (chapeau hors cadre exclu)
    const towers = s.towers.filter(t => !t.outside).map(t => ({ t, d: Math.hypot(t.x - cp.x, t.height - cp.y, -t.y - cp.z) - (t.archetype === 'parasol' ? 1e4 : 0) })).sort((a, b) => a.d - b.d)
    const out = {}
    for (const { t } of towers) {
      const top = proj(t.x, t.height, -t.y), mid = proj(t.x, t.height * 0.45, -t.y)
      if (top.ok && mid.ok) { out.chapeau = box(top, 230, 140, 20); out.fut = box(mid, 110, 150); break }
    }
    const birds = s.birds.map(b => ({ b, d: Math.hypot(b.x - cp.x, b.z - cp.y, -b.y - cp.z) })).sort((a, b) => a.d - b.d)
    for (const { b } of birds) {
      const p = proj(b.x, b.z, -b.y)
      if (p.ok) { out.oiseau = box(p, 120, 90); out.icones = box(p, 120, 110, -55); break }
    }
    let best = null
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2
      const p = proj(Math.cos(a) * s.arena.a * 1.02, 2, -Math.sin(a) * s.arena.b * 1.02)
      if (p.ok && (!best || p.x > best.x)) best = p
    }
    if (best) out.simoun = box(best, 170, 110, 0)
    return out
  })
  if (targets) writeFileSync(join(dir, `${t.replace('.', '_')}-targets.json`), JSON.stringify(targets))
  const info = await pc.evaluate(() => {
    const s = window.__ombres.runner.sim?.state
    const c = document.querySelector('canvas')
    return { t: s?.sun.t.toFixed(2), phase: s?.sun.phase, pe: s?.sun.paletteElevDeg.toFixed(2), canvas: `${c?.width}x${c?.height}` }
  })
  for (const [name, js] of VARS) {
    await pc.evaluate(js)
    await sleep(SETTLE)
    const cv = await pc.evaluate(() => { const c = document.querySelector('canvas'); return `${c?.width}x${c?.height} ${window.__ombres.useRenderQuality.getState().level}` })
    const f = join(dir, `${t.replace('.', '_')}-${name}.png`)
    await pc.screenshot({ path: f })
    console.log(`t=${t} ${name} ${JSON.stringify(info)} canvas ${cv} → ${f}`)
  }
  if (PAN > 0) {
    // glissement sous-pixel de la caméra figée : la sim reste gelée, seule la vue bouge
    const pos0 = await pc.evaluate(() => window.__cam.position.toArray())
    for (const [name, js] of PVARS) {
      await pc.evaluate(js)
      await sleep(SETTLE)
      for (let i = 0; i < PAN; i++) {
        await pc.evaluate(
          ([pos0, i, px]) => {
            const c = window.__cam
            const e = c.matrixWorld.elements
            const H = window.__npr.gl.domElement.height
            const d = c.position.length() || 1
            // taille d'un px à la distance du centre de l'arène (≈ distance caméra-origine)
            const m = (2 * d * Math.tan((c.fov * Math.PI) / 360)) / H
            c.position.fromArray(pos0)
            c.position.x += e[0] * m * px * i
            c.position.y += e[1] * m * px * i
            c.position.z += e[2] * m * px * i
          },
          [pos0, i, PANPX],
        )
        await sleep(250)
        await pc.screenshot({ path: join(dir, `${t.replace('.', '_')}-pan-${name}-${String(i).padStart(2, '0')}.png`) })
      }
      await pc.evaluate(pos0 => window.__cam.position.fromArray(pos0), pos0)
      console.log(`t=${t} glissement ${name} : ${PAN} images`)
    }
  }
  await freezeCam(false)
  await pc.evaluate(() => { delete window.__ombres.runner.timeScale })
  if (BURST > 0) {
    // rafale en vol : images successives (≈ 1 par capture), sim et caméra vivantes à vitesse normale
    await pc.evaluate(() => { window.__ombres.runner.timeScale = () => 0.25 })
    await sleep(600)
    for (let i = 0; i < BURST; i++) {
      const f = join(dir, `${t.replace('.', '_')}-burst${String(i).padStart(2, '0')}.png`)
      await pc.screenshot({ path: f })
    }
    await pc.evaluate(() => { delete window.__ombres.runner.timeScale })
    console.log(`t=${t} rafale de ${BURST} images`)
  }
}
const errs = logs.filter(l => /error|pageerror/i.test(l))
if (errs.length) console.log(errs.slice(0, 10).join('\n'))
await browser.close()
