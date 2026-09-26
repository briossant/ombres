// Rend une manche complète hors ligne dans Chrome (page dev/audio.html) et enregistre le WAV,
// puis l'analyse avec tools/audio-analyze.py report (si --analyze).
//   node tools/audio-render.mjs [--port=8804] [--T=110] [--seed=7] [--buses=music,amb,sfx]
//                               [--mute=layer,…] [--out=shots/audio/round.wav] [--analyze]
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'
import { launch, newContext, collectLogs } from './lib/browser.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))
const port = opt.port ?? 8804
const out = opt.out ?? 'shots/audio/round.wav'
const T = Number(opt.T ?? 110)
const browser = await launch()
const ctx = await newContext(browser, { w: 1280, h: 800 })
const page = await ctx.newPage()
const logs = collectLogs(page)
// Rendu hors Vite : le code est empaqueté par esbuild et injecté dans une page sans client HMR
// (les modifications des autres agents ne rechargent donc pas la page en plein rendu).
const bundle = await build({
  entryPoints: ['src/dev/audio/offline-entry.ts'], bundle: true, format: 'iife', write: false, target: 'es2022',
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env': '{"BASE_URL":"/"}' }, logLevel: 'error',
})
const host = `http://localhost:${port}`
await page.route(`${host}/__audio_render__.html`, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>rendu audio</body></html>' }))
await page.route(`${host}/__audio_render__.js`, r => r.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text }))
await page.goto(`${host}/__audio_render__.html`)
await page.addScriptTag({ url: `${host}/__audio_render__.js` })
await page.waitForFunction(() => window.__ready === true && window.__audioDev, null, { timeout: 60000 })
if (opt.proc) {
  // exporte les sons générés (tsk, clac, grains) en WAV dans shots/audio/proc_*.wav
  const all = await page.evaluate(async () => {
    const out = {}
    for (const [k, blob] of Object.entries(window.__audioDev.procWavs())) {
      out[k] = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob) })
    }
    return out
  })
  mkdirSync('shots/audio', { recursive: true })
  for (const [k, b64] of Object.entries(all)) writeFileSync(`shots/audio/proc_${k}.wav`, Buffer.from(b64, 'base64'))
  console.log('écrit', Object.keys(all).map(k => `shots/audio/proc_${k}.wav`).join(' '))
  await browser.close()
  process.exit(0)
}
if (opt.calibrate) {
  console.log(JSON.stringify(await page.evaluate(() => window.__audioBench.calibrateProc()), null, 1))
  await browser.close()
  process.exit(0)
}
if (opt.bench) {
  // coût CPU des briques de la partition (rendu hors ligne de 10 s de chaque)
  const r = await page.evaluate(async names => window.__audioBench.bench(names), opt.bench === true ? await page.evaluate(() => window.__audioBench.BENCH_NAMES) : String(opt.bench).split(','))
  console.log(JSON.stringify(r, null, 1))
  await browser.close()
  process.exit(0)
}
const t0 = Date.now()
const res = await render()
async function render() { return page.evaluate(async o => {
  const r = await window.__audioDev.renderRound(o)
  const blob = window.__audioDev.toWav(r.buffer)
  const b64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob) })
  const whole = window.__audioDev.measureLoudness(r.buffer)
  return { b64, markers: r.markers, events: r.events, plays: r.plays, trace: r.trace, integrated: whole.integrated, peak: whole.peakDb, duration: r.buffer.duration, timings: r.timings }
}, {
  T, seed: Number(opt.seed ?? 7), birds: Number(opt.birds ?? 6),
  buses: opt.buses ? String(opt.buses).split(',') : undefined,
  muteLayers: opt.mute ? String(opt.mute).split(',') : [],
  activity: Number(opt.activity ?? 1),
  from: opt.from !== undefined ? Number(opt.from) : undefined,
  real: !!opt.real,
  seconds: opt.seconds !== undefined ? Number(opt.seconds) : undefined,
}) }
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(res.b64, 'base64'))
const markers = [{ name: 'countdown', at: 0 }, ...res.markers]
writeFileSync(out.replace(/\.wav$/, '.markers.json'), JSON.stringify({ markers, events: res.events, plays: res.plays, trace: res.trace }, null, 1))
console.log(JSON.stringify({ out, seconds: ((Date.now() - t0) / 1000).toFixed(1), timings: res.timings, duration: res.duration, integrated: res.integrated.toFixed(1), peak: res.peak.toFixed(2), markers, warnings: logs.filter(l => /warn|error/i.test(l)).slice(0, 20) }, null, 1))
await browser.close()
if (opt.analyze) {
  const sections = markers.map(m => `${m.at.toFixed(2)}:${m.name}`).join(',')
  const nx = `python3 tools/audio-analyze.py report ${out} ${out.replace(/\.wav$/, '')} --sections "${sections}"`
  execFileSync('nix-shell', ['-p', 'python3.withPackages(p:[p.numpy p.scipy p.soundfile p.matplotlib])', 'ffmpeg', '--run', nx], { stdio: 'inherit' })
}
