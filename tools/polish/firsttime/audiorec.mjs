// Écoute instrumentée : enregistre le mixage réel du PC (tout ce qui atteint ctx.destination,
// via un MediaStreamDestination branché en parallèle) pendant titre → salon → 1 manche →
// résultats → podium, avec le journal horodaté des sous-titres du narrateur.
// Sortie : shots/polish/firsttime/audio/<lang>-mix.webm + <lang>-subs.json
//   PORT=8823 node tools/polish/firsttime/audiorec.mjs [--lang=fr]
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGIN, launch, pcContext, makeShots, sleep, waitFor, state } from './ft.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const LANG = arg('lang', 'fr')
const { log, dir } = makeShots('audio')
mkdirSync(dir, { recursive: true })
const browser = await launch()
const ctx = await pcContext(browser, LANG === 'fr' ? 'fr-FR' : 'en-US')
const pc = await ctx.newPage()
await pc.addInitScript(() => {
  const orig = AudioNode.prototype.connect
  const taps = new WeakMap()
  const R = (window.__rec = { chunks: [], rec: null, tap: null, t0: 0, subs: [] })
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = orig.call(this, dest, ...rest)
    if (dest instanceof AudioDestinationNode) {
      let tap = taps.get(this.context)
      if (!tap) {
        tap = this.context.createMediaStreamDestination()
        taps.set(this.context, tap)
        R.tap = tap
      }
      orig.call(this, tap)
    }
    return r
  }
  R.start = () => {
    const rec = new MediaRecorder(R.tap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 })
    R.chunks = []
    rec.ondataavailable = e => R.chunks.push(e.data)
    rec.start(1000)
    R.rec = rec
    R.t0 = performance.now()
    // sous-titres et écrans horodatés depuis le début de l'enregistrement
    let prevSub = ''
    let prevScreen = ''
    let prevPhase = ''
    setInterval(() => {
      const t = (performance.now() - R.t0) / 1000
      const s = document.querySelector('.subtitle-wrap .recitatif')?.innerText.replace(/\s+/g, ' ').trim() ?? ''
      if (s && s !== prevSub) R.subs.push({ t, kind: 'sub', text: s })
      prevSub = s
      const o = window.__ombres
      const sc = o?.useUi.getState().screen ?? ''
      if (sc !== prevScreen) R.subs.push({ t, kind: 'screen', text: sc })
      prevScreen = sc
      const ph = o?.runner.sim?.state.sun.phase ?? ''
      if (o?.runner.phase === 'round' && ph !== prevPhase) R.subs.push({ t, kind: 'phase', text: ph })
      prevPhase = ph
    }, 100)
  }
  R.stop = () =>
    new Promise(res => {
      R.rec.onstop = async () => {
        const u8 = new Uint8Array(await new Blob(R.chunks, { type: 'audio/webm' }).arrayBuffer())
        let s = ''
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
        res(btoa(s))
      }
      R.rec.stop()
    })
})
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await pc.mouse.click(960, 900) // premier geste : déverrouille le son (et ouvre le menu)
await sleep(500)
await pc.evaluate(() => window.__rec.start())
log('enregistrement démarré (titre)')
await sleep(12000)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 15000, 'salon')
await pc.evaluate(() => window.__ombres.runner.setMatchSetting('rounds', 1))
await sleep(1500)
await pc.keyboard.press('Space')
await sleep(1000)
const kb = (await state(pc)).roster.find(r => r.kind === 'keyboard')?.slot ?? -1
const pilot = new KeyboardPilot(pc, 1, () => kb, 21)
await pilot.start()
await sleep(9000)
await pilot.stop()
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
await sleep(2500)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.runner.phase === 'round', null, 15000, 'manche')
await pilot.start()
while ((await state(pc)).phase === 'round') await sleep(1000)
await pilot.stop()
await waitFor(pc, () => window.__ombres?.runner.phase === 'matchResults', null, 60000, 'podium')
await sleep(16000)
const b64 = await pc.evaluate(() => window.__rec.stop())
const subs = await pc.evaluate(() => window.__rec.subs)
writeFileSync(join(dir, `${LANG}-mix.webm`), Buffer.from(b64, 'base64'))
writeFileSync(join(dir, `${LANG}-subs.json`), JSON.stringify(subs, null, 1))
log(`écrit ${LANG}-mix.webm (${(b64.length * 0.75 / 1e6).toFixed(1)} Mo), ${subs.length} marques`)
await browser.close()
