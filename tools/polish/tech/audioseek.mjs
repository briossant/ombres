// QA technique : pistes musicales en streaming (<audio>) servies par le serveur de PRODUCTION
// (sans requêtes Range) : le saut d'introduction du podium (currentTime = 4,6 s) tient-il ?
//   node tools/polish/tech/audioseek.mjs --origin=http://localhost:8894
import { launch, newContext } from '../../lib/browser.mjs'
import { sleep, waitFor, presetSettings, lobbyWith, startMatch } from './common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const ORIGIN = arg('origin', 'http://localhost:8894')
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await pc.addInitScript(() => {
  const A = window.Audio
  window.__audios = []
  window.Audio = function (...a) {
    const el = new A(...a)
    window.__audios.push(el)
    return el
  }
  window.Audio.prototype = A.prototype
})
await presetSettings(pc, { lang: 'fr', quality: 'low', narrator: 'off' })
const reqs = []
pc.on('request', r => {
  if (r.url().includes('/audio/music/')) reqs.push(`${r.url().split('/').pop()} range=${r.headers()['range'] ?? '-'}`)
})
await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=8`, { waitUntil: 'load' })
await lobbyWith(pc, 4, { rounds: 1 })
await pc.mouse.click(10, 10) // geste : déverrouille l'audio
await startMatch(pc)
await waitFor(pc, () => window.__ombres.runner.phase === 'matchResults', null, 180000, 'fin de partie')
await sleep(6000)
const st = await pc.evaluate(() =>
  window.__audios.map(el => ({
    src: el.src.split('/').pop(),
    paused: el.paused,
    t: +el.currentTime.toFixed(2),
    seekable: el.seekable.length ? [el.seekable.start(0), +el.seekable.end(0).toFixed(1)] : [],
    buffered: el.buffered.length ? [+el.buffered.start(0).toFixed(1), +el.buffered.end(el.buffered.length - 1).toFixed(1)] : [],
    ready: el.readyState,
    err: el.error?.code ?? null,
  })),
)
console.log(JSON.stringify(st, null, 1))
console.log('requêtes musique :', reqs.join(' | '))
await browser.close()
