// Podium aux formats d'écran (polish S5) : partie accélérée d'une manche à 4 ou 12 oiseaux, deux
// captures du podium à 3 s d'écart (image jamais figée), en 1080p et en 4K (dpr 1).
// Dérivé de tools/polish/tech/aspects.mjs ; sorties dans shots/polish/fix-staging/aspects/.
//   PORT=8831 node --import ./tools/polish/staging/nohmr.mjs tools/polish/staging/aspects-podium.mjs [--n=4] [--only=1920x1080,3840x2160]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from '../../lib/browser.mjs'
import { ORIGIN, sleep, waitFor, presetSettings, lobbyWith, startMatch, collect } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const N = Number(arg('n', '4'))
const OUT = join(import.meta.dirname, '../../../shots/polish/fix-staging/aspects')
mkdirSync(OUT, { recursive: true })
const FORMATS = [
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '3840x2160', w: 3840, h: 2160 },
].filter(f => !arg('only') || arg('only').split(',').includes(f.name))
const browser = await launch()
for (const f of FORMATS) {
  const ctx = await browser.newContext({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 })
  const pc = await ctx.newPage()
  const logs = collect(pc, f.name)
  await presetSettings(pc, { lang: 'fr', quality: 'high', narrator: 'text' })
  await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=5`, { waitUntil: 'load' })
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
  await sleep(2000)
  await lobbyWith(pc, N, { rounds: 1 })
  await startMatch(pc)
  await waitFor(pc, () => window.__ombres.runner.phase === 'matchResults', null, 240000, 'podium')
  for (const [ms, label] of [[1000, 'a-1s'], [3000, 'b-4s'], [3000, 'c-7s'], [3000, 'd-10s']]) {
    await sleep(ms)
    await pc.screenshot({ path: `${OUT}/podium-n${N}-${f.name}-${label}.jpg`, type: 'jpeg', quality: 80 })
  }
  console.log(f.name, 'ok', logs.filter(l => /error|pageerror/i.test(l)).slice(0, 3).join(' | '))
  await ctx.close()
}
await browser.close()
