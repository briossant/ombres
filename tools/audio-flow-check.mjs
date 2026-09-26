// Parcours complet en TEMPS RÉEL (page autonome, sans HMR) : titre → lobby → manche (depuis le
// compte à rebours, en accéléré sur une partie) → résultats → podium → crédits. Mesure le niveau
// (RMS, crête) de chaque bus à chaque écran : chaque musique doit sonner, les fondus doivent
// se faire, rien ne doit saturer.
//   node tools/audio-flow-check.mjs [--port=8804]
import { build } from 'esbuild'
import { launch, newContext, collectLogs } from './lib/browser.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))
const port = opt.port ?? 8804
const bundle = await build({
  entryPoints: ['src/dev/audio/realtime-entry.ts'], bundle: true, format: 'iife', write: false, target: 'es2022',
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env': '{"BASE_URL":"/"}' }, logLevel: 'error',
})
const browser = await launch()
const page = await (await newContext(browser)).newPage()
const logs = collectLogs(page)
const host = `http://localhost:${port}`
await page.route(`${host}/__audio_flow__.html`, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }))
await page.route(`${host}/__audio_flow__.js`, r => r.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text }))
await page.goto(`${host}/__audio_flow__.html`)
await page.addScriptTag({ url: `${host}/__audio_flow__.js` })
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })
await page.evaluate(() => {
  const e = window.__rt.sys.engine
  window.__meters = ['music', 'amb', 'sfx', 'ui', 'voice', 'master'].map(n => [n, e.tap(n)])
})
const meter = () => page.evaluate(() => {
  const out = {}
  const buf = new Float32Array(4096)
  for (const [n, a] of window.__meters) {
    a.getFloatTimeDomainData(buf)
    let s = 0, p = 0
    for (const v of buf) { s += v * v; p = Math.max(p, Math.abs(v)) }
    out[n] = [Math.round(10 * Math.log10(s / buf.length + 1e-12)), Math.round(20 * Math.log10(p + 1e-12))]
  }
  return out
})
const steps = [['title', null, 12], ['lobby', null, 8], ['round', -3, 6], ['round', 58, 5], ['round', 99, 5], ['roundResults', null, 12], ['gameResults', null, 12], ['credits', null, 12]]
for (const [screen, t, secs] of steps) {
  await page.evaluate(([s, tt]) => window.__rt.go(s, tt ?? undefined), [screen, t])
  const samples = []
  for (let i = 0; i < secs * 2; i++) {
    await page.waitForTimeout(500)
    samples.push(await meter())
  }
  // RMS moyen (dB) et crête max par bus sur la 2e moitié (après les fondus)
  const half = samples.slice(Math.floor(samples.length * 0.6))
  const agg = {}
  for (const k of Object.keys(half[0])) {
    const rms = 10 * Math.log10(half.reduce((a, s) => a + Math.pow(10, s[k][0] / 10), 0) / half.length)
    agg[k] = `${rms.toFixed(0).padStart(4)}/${Math.max(...half.map(s => s[k][1])).toString().padStart(4)}`
  }
  console.log(`${(screen + (t !== null ? '@' + t : '')).padEnd(14)} ` + Object.entries(agg).map(([k, v]) => `${k} ${v}`).join('  '))
}
console.log(logs.filter(l => /error|warn/i.test(l)).slice(0, 10).join('\n'))
await browser.close()
