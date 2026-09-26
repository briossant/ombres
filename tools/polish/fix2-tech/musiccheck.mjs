// Polish vague 2 (tech, ordre 5) : après la réserve de lecteurs de flux (tracks.ts), la musique des
// écrans hors manche joue toujours, change de piste à chaque écran, et le nombre d'<audio> créés reste
// borné. Titre → crédits → titre → salon → partie (1 manche) → podium → revanche → podium → salon.
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/musiccheck.mjs
import { launch, newContext } from '../../lib/browser.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { ORIGIN, sleep, waitFor, presetSettings, lobbyWith, startMatch, kbSlot, collect } from '../tech/common.mjs'

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const ok = (cond, what) => {
  log(cond ? 'OK  ' : 'ÉCHEC', what)
  if (!cond) process.exitCode = 1
}
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await pc.addInitScript(() => {
  const A = window.Audio
  window.__audioCount = 0
  window.Audio = function (...a) {
    window.__audioCount++
    return new A(...a)
  }
  window.Audio.prototype = A.prototype
})
await presetSettings(pc, { lang: 'fr', quality: 'low', narrator: 'text' }, 'low')
await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=8`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await pc.keyboard.press('Enter') // geste : son déverrouillé

const music = async label => {
  await sleep(2500)
  const a = await pc.evaluate(() => {
    const t = window.__ombresAudio.system.music.track
    const el = t?.els?.[t.active]
    return { id: t?.id ?? null, src: el?.src?.split('/').pop() ?? null, paused: el?.paused ?? null, time: el?.currentTime ?? null, created: window.__audioCount }
  })
  await sleep(1000)
  const b = await pc.evaluate(() => {
    const t = window.__ombresAudio.system.music.track
    const el = t?.els?.[t.active]
    return el?.currentTime ?? null
  })
  const r = { label, ...a, advancing: a.time !== null && b !== null && b > a.time + 0.5 }
  log(label.padEnd(14), JSON.stringify(r))
  return r
}
const rows = []
rows.push(await music('titre'))
await pc.evaluate(() => window.__ombres.runner.enterCredits())
rows.push(await music('crédits'))
await pc.keyboard.press('Escape')
rows.push(await music('titre 2'))
await lobbyWith(pc, 4, { rounds: 1 })
rows.push(await music('salon'))
await pc.mouse.click(5, 5)
const slot = await kbSlot(pc)
const pilot = new KeyboardPilot(pc, 1, () => slot, 17)
for (let m = 1; m <= 2; m++) {
  if (m === 1) await startMatch(pc)
  else {
    await pc.keyboard.press('Enter')
    await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 30000, 'revanche')
  }
  await pilot.start()
  await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'matchResults', null, 300000, 'podium')
  await pilot.stop()
  rows.push(await music(`podium ${m}`))
}
await pc.keyboard.press('Escape')
await waitFor(pc, () => window.__ombres.runner.phase === 'lobby', null, 20000, 'salon')
rows.push(await music('salon 2'))
await pc.evaluate(() => window.__ombres.runner.enterTitle())
rows.push(await music('titre 3'))
for (const r of rows.filter(r => r.id && !/lobby/.test(r.id))) ok(r.paused === false && r.advancing && r.src, `${r.label} : ${r.id} joue (${r.src})`)
const created = rows.at(-1).created
ok(created <= 8, `<audio> créés sur toute la session : ${created} (réserve réutilisée ; avant : 2 par piste jouée)`)
log('console :', logs.length ? logs.slice(0, 10).join('\n') : 'propre')
await browser.close()
