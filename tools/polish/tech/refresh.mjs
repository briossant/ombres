// QA technique : rafraîchissement du PC à CHAQUE écran (titre, crédits, salon + réglages ouverts,
// cartes, compte à rebours, manche, pause, résultats de manche, arrivée du podium, podium), avec un
// vrai téléphone émulé (Pixel 7) : chronologie des écrans du téléphone pendant le rechargement du PC.
//   PORT=8824 node tools/polish/tech/refresh.mjs [--speed=3]
import { launch, newContext } from '../../lib/browser.mjs'
import { newPhone, joinPhone, tap } from '../../e2e/qa/lib.mjs'
import { ORIGIN, SHOTS, sleep, waitFor, presetSettings, collect } from './common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const SPEED = Number(arg('speed', '3'))
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await presetSettings(pc, { lang: 'fr', quality: 'medium', narrator: 'text' })
const URL = `${ORIGIN}/?debug=fast&speed=${SPEED}`
await pc.goto(URL, { waitUntil: 'load' })
const S = () =>
  pc.evaluate(() => {
    const o = window.__ombres
    if (!o) return null
    const r = o.runner
    return { phase: r.phase, screen: o.useUi.getState().screen, overlay: o.useUi.getState().overlay, paused: r.paused, round: r.roundIndex, t: r.sim?.state.sun.t?.toFixed(1), kind: r.simKind, n: r.roster.size, hold: r.realTime < r.holdUntil }
  })

// téléphone : chronologie de data-screen
const ph = await newPhone(browser, 'Pixel 7', 'pixel')
const phLogs = ph.logs
let timeline = []
let recording = false
const recorder = (async () => {
  let last = ''
  for (;;) {
    if (ph.dead) return
    if (recording) {
      const s = await ph.page.evaluate(() => `${document.querySelector('.app')?.dataset.screen ?? '-'}${document.querySelector('.overlay--dim[role=alert]') ? '+reco' : ''}${document.querySelector('.overlay--dim:not([role])') ? '+pause' : ''}`).catch(() => '?')
      if (s !== last) {
        timeline.push(`${((Date.now() - recStart) / 1000).toFixed(1)}s:${s}`)
        last = s
      }
    }
    await sleep(100)
  }
})()
let recStart = 0
let phoneJoined = false

async function refresh(label, expect) {
  const before = await S()
  timeline = []
  recStart = Date.now()
  recording = true
  const t0 = Date.now()
  await pc.reload({ waitUntil: 'load' })
  if (phoneJoined) {
    await sleep(700)
    await ph.page.screenshot({ path: `${SHOTS}/refresh-${label}-phone-during.jpg`, type: 'jpeg', quality: 75 })
  }
  let after = null
  try {
    await waitFor(pc, () => window.__ombres && window.__ombres.runner.phase !== 'boot', null, 60000, 'fin du chargement')
    after = await S()
  } catch (e) {
    after = { err: e.message }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  await sleep(1500)
  const after2 = await S()
  recording = false
  await pc.screenshot({ path: `${SHOTS}/refresh-${label}.jpg`, type: 'jpeg', quality: 75 })
  const ok = expect ? expect(before, after2) : true
  log(`${ok ? 'OK ' : 'KO '} ${label.padEnd(14)} avant ${JSON.stringify(before)} → après ${dt} s ${JSON.stringify(after2)} | téléphone : ${timeline.join(' ')}`)
}

await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(1500)
await refresh('title', (b, a) => a.phase === 'title')

// crédits
await pc.evaluate(() => window.__ombres.runner.enterCredits())
await sleep(1500)
await refresh('credits', (b, a) => a.phase === 'title' || a.phase === 'credits')

// salon avec le téléphone + réglages ouverts
const url = await pc.evaluate(() => window.__ombres.useLobby.getState().joinUrl)
const phoneUrl = url.replace(/^https?:\/\/[^/]+/, ORIGIN)
await joinPhone(ph, phoneUrl, 'Refresh', 3)
phoneJoined = true
await waitFor(pc, () => window.__ombres.runner.phase === 'lobby', null, 10000, 'salon')
await sleep(1000)
await pc.evaluate(() => window.__ombres.useUi.setState({ overlay: 'settings' }))
await sleep(800)
await refresh('lobby-settings', (b, a) => a.phase === 'lobby')

// cartes des règles
await pc.evaluate(() => window.__ombres.runner.setMatchSetting('rounds', 3))
await pc.evaluate(() => window.__ombres.runner.startMatch())
await waitFor(pc, () => window.__ombres.runner.phase === 'rules', null, 10000, 'cartes')
await sleep(800)
await refresh('rules', (b, a) => a.phase === 'rules' || a.phase === 'round')

// compte à rebours
await pc.keyboard.press('Enter')
await tap(ph, '.intro button, .screen--band button').catch(() => {})
await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 20000, 'manche')
await sleep(300)
await refresh('countdown', (b, a) => a.phase === 'round')

// manche en cours
await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? -1) > 12, null, 60000, 'manche avancée')
await refresh('round', (b, a) => a.phase === 'round' && a.round === b.round)

// pause
await sleep(3500)
await pc.evaluate(() => window.__ombres.runner.pause())
await sleep(800)
await refresh('paused', (b, a) => a.phase === 'round' && a.paused)
await pc.evaluate(() => window.__ombres.runner.resume())

// résultats de manche
await waitFor(pc, () => window.__ombres.runner.phase === 'roundResults', null, 120000, 'résultats')
await sleep(1500)
await refresh('roundResults', (b, a) => a.phase === 'roundResults')

// manches suivantes jusqu'à la fin de partie
for (let i = 0; i < 4; i++) {
  const p = await S()
  if (p.phase === 'matchResults') break
  if (p.phase === 'roundResults') {
    await pc.evaluate(() => window.__ombres.runner.continueResults())
    await sleep(500)
  }
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres.runner.phase), null, 150000, 'fin de manche')
  await sleep(300)
}
// arrivée du podium (écran cinématique, avant le panneau)
const ph0 = await S()
log('fin de partie :', JSON.stringify(ph0))
if (ph0.screen === 'cinematic') await refresh('podium-arrival', (b, a) => a.phase === 'matchResults')
await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'matchResults', null, 20000, 'podium')
await sleep(1500)
await refresh('podium', (b, a) => a.phase === 'matchResults' && a.screen === 'matchResults')
await ph.page.screenshot({ path: `${SHOTS}/refresh-phone-end.jpg`, type: 'jpeg', quality: 75 })

ph.dead = true
console.log('--- console ---\n' + [...logs, ...phLogs.filter(l => /error|warn|http 4/.test(l))].slice(0, 40).join('\n'))
await browser.close()
