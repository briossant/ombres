// Polish vague 2 (tech) : programmes GPU compilés APRÈS l'arrivée du titre (à-coups de première
// impression). Liste renderer.info.programs à l'arrivée du titre puis 5 s plus tard ; compte les
// createProgram de la sonde.
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/titleprograms.mjs [--q=high]
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, presetSettings } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const Q = arg('q', 'high')
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off' }, Q)
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await pc.waitForFunction(() => window.__ombres?.useUi.getState().screen === 'title' && !!window.__ombres.gl, null, { timeout: 120000, polling: 16 })
const snap = () =>
  pc.evaluate(() => ({
    created: window.__probe.glCreated.program,
    names: window.__ombres.gl.info.programs.map(p => `${p.name}#${p.id}`),
    long: window.__probe.longTasks.map(l => Math.round(l[1])),
  }))
const a = await snap()
await sleep(5000)
const b = await snap()
const fresh = b.names.filter(n => !a.names.includes(n))
console.log(`programmes à l'arrivée du titre : ${a.names.length} (createProgram ${a.created}) ; 5 s plus tard : ${b.names.length} (createProgram ${b.created})`)
console.log('nouveaux programmes après le titre :', fresh.length ? fresh.join(', ') : 'aucun')
console.log('longues tâches (depuis le chargement) :', a.long.join(','), '|', b.long.slice(a.long.length).join(','))
await browser.close()
