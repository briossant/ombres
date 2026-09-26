// Correcteur world (polish) : captures reproductibles d'une manche en jeu, figée à des instants de
// soleil précis. Math.random est remplacé par un PRNG à graine (graine de manche et bots identiques
// d'une passe à l'autre) : les images AVANT / APRÈS montrent la même scène.
//   PORT=8832 node tools/polish/world/cap.mjs --name=golden4 --n=4 --times=55,68,89 [--speed=4] [--q=high]
//     [--seed=7] [--nohud] [--burst=0] [--settle=900] [--w=1920] [--h=1080] [--round=1] [--gpu]
//     [--eval="js exécuté juste avant chaque capture"] [--results] [--gpu] [--ab] [--passes]
//     [--before] (polish 2 : ajoute <t>-avant.png, même scène avec worldView.lookPolish2 = false)
// Images : shots/polish/fix-world/<name>/<t>.jpg
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings, lobbyWith, startMatch, frameStats, pageNow, collect } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const flag = k => process.argv.includes(`--${k}`)
const NAME = arg('name', 'cap')
const N = Number(arg('n', '4'))
const SPEED = Number(arg('speed', '4'))
const Q = arg('q', 'high')
const SEED = Number(arg('seed', '7'))
// cibles : « pe21 » (horloge de palette ≤ 21°) ou « 104 » (secondes d'une manche normale de 110 s,
// ramenées à la durée réelle : la Grande Ombre commence à 98)
const TIMES = arg('times', 'pe21,pe3.5').split(',').filter(Boolean)
const SETTLE = Number(arg('settle', '900'))
const BURST = Number(arg('burst', '0'))
const ROUND = Number(arg('round', '1'))
const EVAL = arg('eval', '')
// --out=<dossier> (relatif au dépôt) : sinon shots/polish/fix-world/<name>
const dir = arg('out', '') ? join(import.meta.dirname, '../../..', arg('out', ''), NAME) : join(import.meta.dirname, '../../../shots/polish/fix-world', NAME)
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
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off', hints: 'off' })
const fast = SPEED > 1 ? `,fast&speed=${SPEED}` : ''
await pc.goto(`${ORIGIN}/?debug=nosave${flag('passes') ? ',perf' : ''}${fast}`, { waitUntil: 'load' })
const got = await lobbyWith(pc, N, { rounds: Math.max(ROUND, flag('podium') ? 1 : ROUND), length: 'normal' })
console.log(`oiseaux : ${got}`)
await startMatch(pc)
if (flag('nohud')) await pc.addStyleTag({ content: 'body * { visibility: hidden !important } canvas { visibility: visible !important }' })
// gel de la sim sans surcouche : l'échelle de temps du runner est forcée à 0 (la caméra continue)
const freeze = on =>
  pc.evaluate(on => {
    const r = window.__ombres.runner
    if (on) r.timeScale = () => 0
    else delete r.timeScale
  }, on)
const roundIndex = () => pc.evaluate(() => window.__ombres.runner.match?.round?.index ?? window.__ombres.runner.match?.roundIndex ?? 0)
for (let r = 1; r < ROUND; r++) {
  await waitFor(pc, () => window.__ombres.runner.phase === 'roundResults', null, 400000, 'résultats')
  await sleep(500)
  await pc.evaluate(() => window.__ombres.runner.continueResults())
  await waitFor(pc, () => window.__ombres.runner.phase === 'round' && (window.__ombres.runner.sim?.state.sun.t ?? 99) < 1, null, 60000, 'manche suivante')
}
void roundIndex
for (const t of TIMES) {
  // t exprimé en secondes d'une manche normale (110 s) : ramené à la durée réelle (manche courte en ?debug=fast)
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
  await freeze(true)
  await sleep(SETTLE)
  if (EVAL) await pc.evaluate(EVAL)
  const info = await pc.evaluate(() => {
    const s = window.__ombres.runner.sim?.state
    return { t: s?.sun.t.toFixed(2), phase: s?.sun.phase, pe: s?.sun.paletteElevDeg.toFixed(2), level: window.__ombres.useRenderQuality.getState().level }
  })
  const f = join(dir, `${t.replace('.', '_')}.png`)
  await pc.screenshot({ path: f })
  console.log(`t=${t} ${JSON.stringify(info)} → ${f}`)
  if (arg('alt', '')) {
    // variante quelconque de la même scène : --alt="js" (puis --altReset="js") → <t>-alt.png
    await pc.evaluate(arg('alt', ''))
    await sleep(300)
    await pc.screenshot({ path: join(dir, `${t.replace('.', '_')}-alt.png`) })
    if (arg('altReset', '')) await pc.evaluate(arg('altReset', ''))
    await sleep(250)
  }
  if (flag('before')) {
    // polish 2 : même image avec le rendu d'avant (worldView.lookPolish2 = false), puis retour
    await pc.evaluate(() => { window.__ombres.worldView.lookPolish2 = false })
    await sleep(250)
    await pc.screenshot({ path: join(dir, `${t.replace('.', '_')}-avant.png`) })
    await pc.evaluate(() => { window.__ombres.worldView.lookPolish2 = true })
    await sleep(250)
  }
  for (let b = 0; b < BURST; b++) {
    await sleep(34)
    await pc.screenshot({ path: join(dir, `${t.replace('.', '_')}-b${b}.png`) })
  }
  const gpu = async label => {
    await pc.evaluate(() => (window.__probeGpu = true))
    const t0 = await pageNow(pc)
    await sleep(2500)
    const fs = await frameStats(pc, t0)
    await pc.evaluate(() => (window.__probeGpu = false))
    console.log(`   GPU figé ${label} p10 ${fs?.gpuP10} p50 ${fs?.gpuP50} p90 ${fs?.gpuP90}`)
  }
  if (flag('gpu')) await gpu('')
  if (flag('passes')) {
    // ?debug=perf : médianes GPU par passe (timer queries du pipeline) sur ~2 s de scène figée
    await sleep(3000)
    const t = await pc.evaluate(() => ({ ...(window.__timings ?? {}) }))
    console.log(`   passes total ${t.total} [ombres ${t.shadow} G-buffer ${t.gbuffer} encre ${t.ink} SMAA ${t.smaa ?? '-'}] CPU ${t.cpu}`)
  }
  if (flag('ab')) {
    // A/B W5 : cascade focus de manche et lissage des ombres (leviers de mesure de worldView)
    const setWv = (focus, smooth) => pc.evaluate(([f, sm]) => { window.__ombres.worldView.roundFocus = f; window.__ombres.worldView.shadowSmooth = sm }, [focus, smooth])
    for (let rep = 0; rep < 2; rep++) {
      await setWv(true, true)
      await gpu('focus+lissage')
      await setWv(false, true)
      await gpu('lissage seul  ')
      await setWv(false, false)
      await gpu('ni l’un ni l’autre')
    }
    await setWv(true, true)
  }
  await freeze(false)
}
if (flag('results')) {
  await waitFor(pc, () => window.__ombres.runner.phase === 'roundResults', null, 120000, 'résultats')
  for (let k = 0; k < 6; k++) {
    await sleep(700)
    await pc.screenshot({ path: join(dir, `results-${k}.png`) })
  }
}
const errs = logs.filter(l => /error|pageerror/.test(l))
if (errs.length) console.log(errs.slice(0, 10).join('\n'))
await browser.close()
