// Vérificateur antialiasing : captures d'une VRAIE partie (pas d'image figée préparée) dans un preset donné :
// titre (après le banc auto), salon, manche (midi, heure dorée, Grande Ombre : image figée + rafale en vol),
// résultats, podium. PNG plein cadre + cibles de recadrage (JSON) ; planches : verify-sheets.mjs.
//   PORT=8892 node --import ./tools/polish/world/nohmr.mjs tools/polish/aa/verify-shots.mjs \
//     --q=auto|low|medium|high|ultra [--w=1920 --h=1080] [--n=12] [--speed=3] [--burst=10] [--out=DIR]
//   --q=auto : aucun banc mémorisé, le banc du titre choisit le niveau (relevé dans info.json).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from '../../lib/browser.mjs'
import { ORIGIN, sleep, waitFor, presetSettings, lobbyWith, startMatch, collect } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const Q = arg('q', 'auto')
const W = Number(arg('w', '1920'))
const H = Number(arg('h', '1080'))
const N = Number(arg('n', '12'))
const SPEED = Number(arg('speed', '3'))
const BURST = Number(arg('burst', '10'))
const OUT = arg('out', join(import.meta.dirname, '../../../shots/verify-aa', `${Q}-${H}p`))
mkdirSync(OUT, { recursive: true })

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const pc = await ctx.newPage()
const logs = collect(pc, Q)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off', hints: 'off' })
await pc.goto(`${ORIGIN}/?debug=nosave,fast&speed=${SPEED}`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 180000, 'titre')
const info = { q: Q, w: W, h: H, shots: [] }
if (Q === 'auto') {
  await waitFor(pc, () => window.__ombres.useRenderQuality.getState().benchLevel !== null, null, 60000, 'banc')
  info.bench = await pc.evaluate(() => window.__ombres.useRenderQuality.getState().benchLevel)
  console.log(`banc : ${info.bench}`)
}
await sleep(3000)

const state = () =>
  pc.evaluate(() => {
    const c = document.querySelector('canvas')
    const s = window.__ombres.runner.sim?.state
    return { level: window.__ombres.useRenderQuality.getState().level, canvas: `${c?.width}x${c?.height}`, screen: window.__ombres.useUi.getState().screen, sun: s?.sun.phase, pe: s ? +s.sun.paletteElevDeg.toFixed(1) : null }
  })
// cibles de recadrage (px du viewport), comme tools/polish/aa/shots.mjs : tour à disque (chapeau, fût), oiseau le
// plus proche (+ icônes au-dessus), bord du Simoun
const targets = () =>
  pc.evaluate(() => {
    const c = window.__cam
    const s = window.__ombres.runner.sim?.state
    if (!c || !s) return null
    const V = c.position.constructor
    const W = innerWidth, H = innerHeight
    const k = H / 1080
    const proj = (x, y, z) => {
      const v = new V(x, y, z).project(c)
      return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, ok: v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.85 }
    }
    const box = (p, w, h, dy = 0) => ({ x: Math.round(Math.min(W - w * k, Math.max(0, p.x - (w * k) / 2))), y: Math.round(Math.min(H - h * k, Math.max(0, p.y - (h * k) / 2 + dy * k))), w: Math.round(w * k), h: Math.round(h * k) })
    const cp = c.position
    const towers = (s.towers ?? []).filter(t => !t.outside).map(t => ({ t, d: Math.hypot(t.x - cp.x, t.height - cp.y, -t.y - cp.z) - (t.archetype === 'parasol' ? 1e4 : 0) })).sort((a, b) => a.d - b.d)
    const out = {}
    for (const { t } of towers) {
      const top = proj(t.x, t.height, -t.y), mid = proj(t.x, t.height * 0.45, -t.y)
      if (top.ok && mid.ok) { out.chapeau = box(top, 230, 140, 20); out.fut = box(mid, 110, 150); break }
    }
    const birds = (s.birds ?? []).map(b => ({ b, d: Math.hypot(b.x - cp.x, b.z - cp.y, -b.y - cp.z) })).sort((a, b) => a.d - b.d)
    for (const { b } of birds) {
      const p = proj(b.x, b.z, -b.y)
      if (p.ok) { out.oiseau = box(p, 120, 90); out.icones = box(p, 120, 110, -55); break }
    }
    if (s.arena) {
      let best = null
      for (let i = 0; i < 360; i++) {
        const a = (i / 360) * Math.PI * 2
        const p = proj(Math.cos(a) * s.arena.a * 1.02, 2, -Math.sin(a) * s.arena.b * 1.02)
        if (p.ok && (!best || p.x > best.x)) best = p
      }
      if (best) out.simoun = box(best, 170, 110, 0)
    }
    return out
  })
// repère la caméra de jeu (comme shots.mjs)
await pc.evaluate(() => {
  const O3 = Object.getPrototypeOf(Object.getPrototypeOf(window.__npr?.scene ?? window.__ombres.scene ?? {}))
  if (!O3?.updateMatrixWorld) return
  const orig = O3.updateMatrixWorld
  O3.updateMatrixWorld = function (f) {
    if (this.isPerspectiveCamera) window.__cam = this
    return orig.call(this, f)
  }
})
const snap = async (label, withTargets = false) => {
  const st = await state()
  const f = join(OUT, `${label}.png`)
  await pc.screenshot({ path: f })
  const tg = withTargets ? await targets() : null
  if (tg) writeFileSync(join(OUT, `${label}-targets.json`), JSON.stringify(tg))
  info.shots.push({ label, ...st })
  console.log(`${label} ${JSON.stringify(st)}`)
}
const freeze = on => pc.evaluate(on => { if (on) window.__ombres.runner.timeScale = () => 0; else delete window.__ombres.runner.timeScale }, on)

await snap('1-titre')
await lobbyWith(pc, N, { rounds: 1, length: 'normal' })
await sleep(2500)
await snap('2-salon')
await startMatch(pc)
const want = [
  ['noon', '3-midi'],
  ['golden', '4-heure-doree'],
  ['greatShadow', '5-grande-ombre'],
]
for (const [phase, label] of want) {
  await waitFor(pc, ph => { const s = window.__ombres.runner.sim?.state; return window.__ombres.runner.phase !== 'round' || (s?.sun.phase === ph && s.sun.t > 0) }, phase, 600000, phase)
  await sleep(phase === 'noon' ? 5000 / SPEED + 1500 : 2500 / SPEED + 600)
  await freeze(true)
  await sleep(900)
  await snap(label, true)
  if (BURST > 0 && phase !== 'noon') {
    // rafale en vol : sim et caméra vivantes à vitesse RÉELLE (timeScale × SIM_SPEED = 1)
    await pc.evaluate(sp => { window.__ombres.runner.timeScale = () => 1 / sp }, SPEED)
    await sleep(500)
    const tg = await targets()
    if (tg) writeFileSync(join(OUT, `${label}-burst-targets.json`), JSON.stringify(tg))
    for (let i = 0; i < BURST; i++) await pc.screenshot({ path: join(OUT, `${label}-burst${String(i).padStart(2, '0')}.png`) })
    console.log(`${label} : rafale de ${BURST} images`)
  }
  await freeze(false)
}
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'roundResults', null, 300000, 'résultats')
await sleep(3000)
await snap('6-resultats')
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'matchResults', null, 60000, 'podium')
await sleep(2500)
await snap('7-podium-a')
await sleep(4000)
await snap('7-podium-b')
info.logs = logs
writeFileSync(join(OUT, 'info.json'), JSON.stringify(info, null, 1))
console.log(logs.length ? logs.slice(0, 12).join('\n') : 'console propre')
await browser.close()
