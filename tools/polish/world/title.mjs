// Correcteur world (polish) : cinématique du titre, captures régulières (graine fixée pour
// Math.random : mêmes plans d'une passe à l'autre, tant que la démo ne change pas).
//   PORT=8832 node --import ./tools/polish/world/nohmr.mjs tools/polish/world/title.mjs --name=title-a [--seed=3]
//     [--secs=60] [--every=2000] [--nohud] [--burst=0] [--q=high]
// Images : shots/polish/fix-world/<name>/NNN-t<temps>.jpg
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, sleep, waitFor, presetSettings, collect } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const flag = k => process.argv.includes(`--${k}`)
const NAME = arg('name', 'title')
const SEED = Number(arg('seed', '3'))
const SECS = Number(arg('secs', '60'))
const EVERY = Number(arg('every', '2000'))
const BURST = Number(arg('burst', '0'))
const dir = join(import.meta.dirname, '../../../shots/polish/fix-world', NAME)
mkdirSync(dir, { recursive: true })

const browser = await launch()
const ctx = await newContext(browser)
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
await presetSettings(pc, { lang: 'fr', quality: arg('q', 'high'), narrator: 'off' })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
if (flag('nohud')) await pc.addStyleTag({ content: 'body * { visibility: hidden !important } canvas { visibility: visible !important }' })
const t0 = Date.now()
let n = 0
while (Date.now() - t0 < SECS * 1000) {
  const info = await pc.evaluate(() => ({ t: window.__ombres.runner.sim?.state.sun.t?.toFixed(1), pe: window.__ombres.runner.sim?.state.sun.paletteElevDeg?.toFixed(1) }))
  const f = join(dir, `${String(++n).padStart(3, '0')}-${((Date.now() - t0) / 1000).toFixed(0)}s-pe${info.pe}.jpg`)
  await pc.screenshot({ path: f, type: 'jpeg', quality: 88 })
  for (let b = 0; b < BURST; b++) {
    await sleep(34)
    await pc.screenshot({ path: f.replace('.jpg', `-b${b}.jpg`), type: 'jpeg', quality: 88 })
  }
  await sleep(EVERY)
}
const errs = logs.filter(l => /error|pageerror/.test(l))
if (errs.length) console.log(errs.slice(0, 10).join('\n'))
console.log(`${n} images → ${dir}`)
await browser.close()
