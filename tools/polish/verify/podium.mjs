// Non-régression podium (S5 × B3) : partie accélérée d'une manche à N oiseaux, captures du podium
// pendant et après la poussée d'entrée, en 1080p et en 4K, avec le bas du bandeau du champion
// (DOM) pour juger la place laissée à la couronne. Sorties : shots/polish/verify/podium/.
//   PORT=8841 node --import ./tools/polish/verify/watch.mjs tools/polish/verify/podium.mjs [--n=4] [--only=1920x1080] [--tag=after]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from '../../lib/browser.mjs'
import { ORIGIN, sleep, waitFor, presetSettings, lobbyWith, startMatch, collect } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const N = Number(arg('n', '4'))
const TAG = arg('tag', 'now')
const OUT = join(import.meta.dirname, '../../../shots/polish/verify/podium')
mkdirSync(OUT, { recursive: true })
const FORMATS = [
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '3840x2160', w: 3840, h: 2160 },
  { name: '1280x720', w: 1280, h: 720 },
].filter(f => (arg('only') ? arg('only').split(',').includes(f.name) : f.name !== '1280x720'))
const browser = await launch()
for (const f of FORMATS) {
  const ctx = await browser.newContext({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 })
  const pc = await ctx.newPage()
  const logs = collect(pc, f.name)
  await presetSettings(pc, { lang: 'fr', quality: 'high', narrator: 'text' })
  await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=6`, { waitUntil: 'load' })
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
  await sleep(1500)
  await lobbyWith(pc, N, { rounds: 1 })
  await startMatch(pc)
  await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'roundResults', null, 240000, 'résultats de manche')
  await sleep(4500)
  await pc.screenshot({ path: `${OUT}/${TAG}-n${N}-${f.name}-results.jpg`, type: 'jpeg', quality: 85 })
  await waitFor(pc, () => window.__ombres.runner.phase === 'matchResults', null, 240000, 'podium')
  const t0 = Date.now()
  for (const at of [2000, 4700, 6500, 9000, 13000]) {
    await sleep(Math.max(0, at - (Date.now() - t0)))
    const head = await pc.evaluate(() => {
      const el = document.querySelector('.champion')
      return el ? Math.round(el.getBoundingClientRect().bottom) : -1
    })
    const file = `${OUT}/${TAG}-n${N}-${f.name}-${String(at).padStart(5, '0')}.jpg`
    await pc.screenshot({ path: file, type: 'jpeg', quality: 85 })
    console.log(f.name, at, 'bas du bandeau', head, file)
  }
  // diagnostic : bandeau à demi transparent, pour voir la couronne derrière
  await pc.addStyleTag({ content: '.match-res__top { opacity: 0.35 !important }' })
  await sleep(200)
  await pc.screenshot({ path: `${OUT}/${TAG}-n${N}-${f.name}-ghost.jpg`, type: 'jpeg', quality: 85 })
  console.log(f.name, 'console', logs.slice(0, 5).join(' | ') || 'propre')
  await ctx.close()
}
await browser.close()
