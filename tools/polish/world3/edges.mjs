// Polish 3 (correcteur world-3) : même image, plusieurs variantes de rendu, CAMÉRA FIGÉE (la sim est
// gelée comme dans tools/polish/world/cap.mjs, et la pose de la caméra de jeu est bloquée) : les
// captures avant / après sont comparables au pixel près (recadrages, différences).
//   PORT=8872 node --import ./tools/polish/world/nohmr.mjs tools/polish/world3/edges.mjs --name=gs4 \
//     --n=4 --times=101,104 [--seed=7] [--q=high] [--settle=1200] \
//     --v='avant=window.__npr.NPR.uSmoothAniso.value=1e9' --v='apres=window.__npr.NPR.uSmoothAniso.value=1.5'
//   --title : écran titre (démo) au lieu d'une manche ; --times = secondes après l'apparition du titre.
// Images : shots/polish3/world/<name>/<t>-<variante>.png (HUD masqué).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, sleep, waitFor, presetSettings, lobbyWith, startMatch, collect } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const args = k => process.argv.filter(a => a.startsWith(`--${k}=`)).map(a => a.split('=').slice(1).join('='))
const NAME = arg('name', 'edges')
const N = Number(arg('n', '4'))
const SEED = Number(arg('seed', '7'))
const Q = arg('q', 'high')
const SETTLE = Number(arg('settle', '1200'))
const TIMES = arg('times', '104').split(',').filter(Boolean)
const VARS = args('v').map(v => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)] })
const dir = join(import.meta.dirname, '../../../shots/polish3/world', NAME)
mkdirSync(dir, { recursive: true })

const browser = await launch()
const ctx = await newContext(browser, { w: Number(arg('w', '1920')), h: Number(arg('h', '1080')) })
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
  else await waitFor(
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
  await sleep(SETTLE)
  if (!(await freezeCam(true))) console.log('!! caméra introuvable')
  await sleep(200)
  const info = await pc.evaluate(() => {
    const s = window.__ombres.runner.sim?.state
    return { t: s?.sun.t.toFixed(2), phase: s?.sun.phase, pe: s?.sun.paletteElevDeg.toFixed(2) }
  })
  for (const [name, js] of VARS) {
    await pc.evaluate(js)
    await sleep(350)
    const f = join(dir, `${t.replace('.', '_')}-${name}.png`)
    await pc.screenshot({ path: f })
    console.log(`t=${t} ${name} ${JSON.stringify(info)} → ${f}`)
  }
  if (VARS.length) await pc.evaluate(VARS[VARS.length - 1][1])
  await freezeCam(false)
  await pc.evaluate(() => { delete window.__ombres.runner.timeScale })
}
const errs = logs.filter(l => /error|pageerror/i.test(l))
if (errs.length) console.log(errs.slice(0, 10).join('\n'))
await browser.close()
