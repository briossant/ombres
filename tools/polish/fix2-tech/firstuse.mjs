// Polish vague 2 (tech) : quand les programmes GPU sont-ils créés, et quand three les utilise-t-il pour la
// première fois (getProgramParameter LINK_STATUS = attente de la compilation) ? Horodatages relatifs à
// l'arrivée du titre ; durée de chaque attente.
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/firstuse.mjs [--q=high]
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, sleep, presetSettings } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const Q = arg('q', 'high')
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await pc.addInitScript(() => {
  const P = (window.__fu = { created: [], linked: [], screens: [] })
  const proto = WebGL2RenderingContext.prototype
  const cp = proto.createProgram
  const gpp = proto.getProgramParameter
  const ids = new WeakMap()
  proto.createProgram = function () {
    const p = cp.call(this)
    ids.set(p, P.created.length)
    P.created.push(performance.now())
    return p
  }
  proto.getProgramParameter = function (p, pname) {
    const t = performance.now()
    const r = gpp.call(this, p, pname)
    if (pname === this.LINK_STATUS) P.linked.push([ids.get(p), t, performance.now() - t])
    return r
  }
})
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off' }, Q)
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await pc.waitForFunction(() => window.__ombres?.useUi.getState().screen === 'title', null, { timeout: 120000, polling: 16 })
const t0 = await pc.evaluate(() => performance.now())
await sleep(5000)
const r = await pc.evaluate(t0 => {
  const P = window.__fu
  return {
    created: P.created.map(t => +((t - t0) / 1000).toFixed(2)),
    linked: P.linked.map(([id, t, d]) => [id, +((t - t0) / 1000).toFixed(2), +d.toFixed(1)]),
    level: window.__ombres.useRenderQuality.getState().level,
  }
}, t0)
console.log('niveau', r.level)
console.log('programmes créés (s par rapport au titre) :', JSON.stringify(r.created))
console.log('premier usage [id, s, ms d’attente] :', JSON.stringify(r.linked))
await browser.close()
