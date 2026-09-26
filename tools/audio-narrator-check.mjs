// Vérifie la lecture du narrateur dans la page dev/audio.html : sous-titre publié (texte,
// couleur, durée), voix jouée sur le bus voix (RMS mesuré), ducking de la musique, puis
// mode « texte seul » et « off ». Capture d'écran du sous-titre.
//   node tools/audio-narrator-check.mjs [--port=8804] [--line=leaderChange1] [--color=3] [--lang=fr]
import { launch, newContext, collectLogs } from './lib/browser.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))
const port = opt.port ?? 8804
const browser = await launch()
const ctx = await newContext(browser, { w: 1600, h: 900 })
const page = await ctx.newPage()
const logs = collectLogs(page)
await page.goto(`http://localhost:${port}/dev/audio.html`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })
await page.waitForTimeout(800)
const result = await page.evaluate(async o => {
  const sys = window.__audio
  const { subtitleEvents, useSettings, playNarratorLine, setAudioScreen, NARRATOR_LINES, lineHasColor } = window.__audioModules
  const seen = []
  subtitleEvents.on(e => seen.push({ ...e, at: performance.now() }))
  const voiceTap = sys.engine.tap('voice')
  const buf = new Float32Array(2048)
  const rms = () => { voiceTap.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return 10 * Math.log10(s / buf.length + 1e-12) }
  setAudioScreen('lobby')
  await new Promise(r => setTimeout(r, 1500))
  const out = {}
  for (const mode of ['voice', 'text', 'off']) {
    useSettings.getState().set('narrator', mode)
    const line = NARRATOR_LINES.find(l => l.id === o.line) ?? NARRATOR_LINES.find(l => lineHasColor(l))
    const colorIndex = lineHasColor(line) ? o.color : undefined
    seen.length = 0
    const duckBefore = sys.engine.duckMusic.gain.value
    const pb = playNarratorLine({ lineId: line.id, colorIndex, lang: o.lang })
    let peak = -120, duckMin = 1
    for (let i = 0; i < 14; i++) {
      await new Promise(r => setTimeout(r, 150))
      peak = Math.max(peak, rms())
      duckMin = Math.min(duckMin, sys.engine.duckMusic.gain.value)
    }
    await pb.done
    await new Promise(r => setTimeout(r, 600))
    out[mode] = { line: line.id, shown: pb.shown, voiced: pb.voiced, duration: +pb.duration.toFixed(2), events: seen.map(e => e.type === 'show' ? { type: 'show', text: e.text, parts: e.parts.length, durationMs: e.durationMs, voiced: e.voiced } : { type: e.type }), voiceRmsPeakDb: +peak.toFixed(1), duckBefore, duckMin: +duckMin.toFixed(3), duckAfter: +sys.engine.duckMusic.gain.value.toFixed(3) }
  }
  useSettings.getState().set('narrator', 'voice')
  playNarratorLine({ lineId: out.voice.line, colorIndex: o.color, lang: o.lang })
  return out
}, { line: opt.line ?? 'firstHit', color: Number(opt.color ?? 3), lang: opt.lang ?? 'fr' })
await page.waitForTimeout(700)
await page.screenshot({ path: 'shots/audio/narrator_subtitle.jpg', type: 'jpeg', quality: 85 })
console.log(JSON.stringify(result, null, 1))
console.log(logs.filter(l => /error|warn/i.test(l)).slice(0, 10).join('\n'))
await browser.close()
