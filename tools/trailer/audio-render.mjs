// Rend la bande-son de la manche filmée (tools/trailer/audio-entry.ts) : une piste par bus (musique,
// bruitages, ambiance), 48 kHz, + journal (événements à l'instant réel, correspondance temps réel → soleil).
//   node tools/trailer/audio-render.mjs --seed=227 [--buses=music,sfx,amb] [--noslow]
// Sorties : marketing/work/audio/round<seed>[c]-<bus>.wav, round<seed>[c].json (c : sans ralenti de touche)
//   node tools/trailer/audio-render.mjs --cues=liste.json --seconds=8 --out=cues-x.wav [--screen=lobby]
//        → sons ponctuels du jeu (interface, ponctuations, bruitages nommés) aux instants demandés
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'
import { browser, closeBrowser, ORIGIN, WORK } from './lib/stage.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const seed = Number(opt.seed ?? 27)
const buses = (opt.buses ?? 'music,sfx,amb').split(',')
const noSlowmo = opt.noslow === 'true'
const tag = `round${seed}${noSlowmo ? 'c' : ''}`
const out = join(WORK, 'audio')
mkdirSync(out, { recursive: true })

const bundle = await build({
  entryPoints: [join(import.meta.dirname, 'audio-entry.ts')], bundle: true, format: 'iife', write: false, target: 'es2022',
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env': '{"BASE_URL":"/"}' }, logLevel: 'error',
})
const b = await browser()
const ctx = await b.newContext({ viewport: { width: 800, height: 600 } })
const page = await ctx.newPage()
const logs = []
page.on('console', m => /error|warn/.test(m.type()) && logs.push(m.text().slice(0, 200)))
page.on('pageerror', e => logs.push(e.message))
await page.route(`${ORIGIN}/__trailer_audio__.html`, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>bande-son</body></html>' }))
await page.route(`${ORIGIN}/__trailer_audio__.js`, r => r.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text }))
await page.goto(`${ORIGIN}/__trailer_audio__.html`)
await page.addScriptTag({ url: `${ORIGIN}/__trailer_audio__.js` })
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })
if (opt.cues) {
  // sons ponctuels : --cues=fichier.json ([{ at, ui|stinger|sound, … }]) --seconds=N --out=nom.wav
  const cues = JSON.parse((await import('node:fs')).readFileSync(opt.cues, 'utf8'))
  const res = await page.evaluate(async ([cues, seconds, screen]) => {
    const r = await window.__trailerAudio.renderCues(cues, seconds, screen)
    const blob = window.__trailerAudio.toWav(r.buffer)
    return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob) })
  }, [cues, Number(opt.seconds ?? 10), opt.screen ?? 'lobby'])
  writeFileSync(join(out, opt.out ?? 'cues.wav'), Buffer.from(res, 'base64'))
  console.log(`sons ponctuels : ${cues.length} → ${opt.out ?? 'cues.wav'}`)
  if (logs.length) console.log(logs.slice(0, 10).join('\n'))
  await closeBrowser()
  process.exit(0)
}
let meta = null
for (const bus of buses) {
  const t0 = Date.now()
  const res = await page.evaluate(async o => {
    const r = await window.__trailerAudio.renderTrailerAudio(o)
    const blob = window.__trailerAudio.toWav(r.buffer)
    const b64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob) })
    const l = window.__trailerAudio.measureLoudness(r.buffer)
    return { b64, events: r.events, timeline: r.timeline, nightReal: r.nightReal, seconds: r.seconds, lufs: l.integrated, peak: l.peakDb }
  }, { seed, buses: [bus], noSlowmo })
  writeFileSync(join(out, `${tag}-${bus}.wav`), Buffer.from(res.b64, 'base64'))
  console.log(`${bus} : ${res.seconds.toFixed(1)} s, ${res.lufs.toFixed(1)} LUFS, crête ${res.peak.toFixed(1)} dB (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  meta ??= { seed, nightReal: res.nightReal, seconds: res.seconds, events: res.events, timeline: res.timeline }
}
writeFileSync(join(out, `${tag}.json`), JSON.stringify(meta, null, 1))
if (logs.length) console.log(logs.slice(0, 10).join('\n'))
await closeBrowser()
