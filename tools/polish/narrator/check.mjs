// Contrôle des voix du narrateur dans Chrome (polish vague 2, correcteur narrator).
//   PORT=8856 node tools/polish/narrator/check.mjs [--lines=fr:firstCrown:1,en:doubleHit:3,…] [--out=shots/polish2/narrator]
// 1. décode les 722 MP3 du manifest avec Web Audio (ce que fait le jeu) : durée = manifest ± 80 ms, octets ;
// 2. page dev/narrator.html (FR Lagon, EN Saffron) : liste des répliques avec les transcriptions ASR ;
// 3. page dev/audio.html : joue des répliques par le vrai lecteur (playNarratorLine, mode « voix ») et relève
//    sous-titre publié, voix entendue (RMS du bus voix), ducking ; capture du récitatif.
import { launch, newContext, collectLogs } from '../../lib/browser.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))
const port = process.env.PORT ?? opt.port ?? '8856'
const base = `http://localhost:${port}`
const out = opt.out ?? 'shots/polish2/narrator'
const lines = String(opt.lines ?? 'fr:firstCrown:1,fr:golden1:,fr:greatShadow1:,fr:miss:9,fr:matchWin:3,en:doubleHit:3,en:matchWin:8')
  .split(',').map(s => { const [lang, lineId, c] = s.split(':'); return { lang, lineId, colorIndex: c === '' || c === undefined ? undefined : Number(c) } })

const browser = await launch()
const ctx = await newContext(browser, { w: 1600, h: 1000 })
const page = await ctx.newPage()
const logs = collectLogs(page)
const failed = []
page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })

// 1 + 2 : page du narrateur
const shots = []
for (const [lang, color] of [['fr', 1], ['en', 3]]) {
  await page.goto(`${base}/dev/narrator.html?lang=${lang}&color=${color}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })
  await page.waitForTimeout(800)
  const f = `${out}/dev-narrator-${lang}.jpg`
  await page.screenshot({ path: f, type: 'jpeg', quality: 85 })
  shots.push(f)
}
const decode = await page.evaluate(async () => {
  const m = await (await fetch('/audio/narrator/manifest.json', { cache: 'no-store' })).json()
  const ac = new OfflineAudioContext(1, 24000, 24000)
  const bad = []
  let n = 0, maxDiff = 0, bytes = 0
  for (const l of m.lines) {
    try {
      const buf = await (await fetch(`/audio/narrator/${l.file}`, { cache: 'no-store' })).arrayBuffer()
      bytes += buf.byteLength
      const a = await ac.decodeAudioData(buf)
      const d = Math.abs(a.duration - l.duration_s)
      maxDiff = Math.max(maxDiff, d)
      if (d > 0.08) bad.push(`${l.file}: ${a.duration.toFixed(3)} ≠ ${l.duration_s}`)
      n++
    } catch (e) { bad.push(`${l.file}: ${e}`) }
  }
  return { format: m.format, decoded: n, total: m.lines.length, maxDiffS: +maxDiff.toFixed(3), megabytes: +(bytes / 1e6).toFixed(2), bad: bad.slice(0, 20) }
})

// 3 : lecture par le vrai lecteur du jeu
await page.goto(`${base}/dev/audio.html`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })
await page.waitForTimeout(800)
const played = []
for (const l of lines) {
  const r = await page.evaluate(async o => {
    const sys = window.__audio
    const { subtitleEvents, useSettings, playNarratorLine, setAudioScreen } = window.__audioModules
    useSettings.getState().set('narrator', 'voice')
    setAudioScreen('lobby')
    const seen = []
    const off = subtitleEvents.on(e => seen.push(e))
    const tap = sys.engine.tap('voice')
    const buf = new Float32Array(2048)
    const rms = () => { tap.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return 10 * Math.log10(s / buf.length + 1e-12) }
    const pb = playNarratorLine({ lineId: o.lineId, colorIndex: o.colorIndex, lang: o.lang })
    let peak = -120, duck = 1
    for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 120)); peak = Math.max(peak, rms()); duck = Math.min(duck, sys.engine.duckMusic.gain.value) }
    const show = seen.find(e => e.type === 'show')
    await pb.done
    if (typeof off === 'function') off()
    return { ...o, voiced: pb.voiced, duration: +pb.duration.toFixed(2), subtitle: show?.text ?? null, voiceRmsPeakDb: +peak.toFixed(1), duckMin: +duck.toFixed(2) }
  }, l)
  played.push(r)
}
// récitatif à l'écran pendant une réplique
await page.evaluate(o => window.__audioModules.playNarratorLine(o), lines[0])
await page.waitForTimeout(700)
const f = `${out}/recitatif-${lines[0].lang}-${lines[0].lineId}.jpg`
await page.screenshot({ path: f, type: 'jpeg', quality: 85 })
shots.push(f)
console.log(JSON.stringify({ failed, decode, played, shots, logs: logs.filter(l => /error|warn/i.test(l)).slice(0, 10) }, null, 1))
await browser.close()
