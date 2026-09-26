// Regard final (verify-eyes) : partie SOLO au clavier (bots par défaut), 3 manches, en anglais,
// qualité High forcée. Salon clavier (H9), cartes EN (H7), manches à instants fixes, pause +
// réglages, résultats, podium EN.
//   PORT=8843 node --import ./tools/polish/staging/nohmr.mjs tools/polish/verify-eyes/solo.mjs [--lang=en] [--q=high]
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGIN, launch, collectLogs, sleep, waitFor, state, problems, arg, rawKeys } from '../../e2e/qa/lib.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { installProbe, drainLog, frameStats } from '../../e2e/qa/probe.mjs'

const LANG = arg('lang', 'en')
const Q = arg('q', 'high')
const NAME = arg('name', `solo-${LANG}`)
const dir = join(import.meta.dirname, '../../../shots/polish/verify-eyes', NAME)
mkdirSync(dir, { recursive: true })
const logFile = join(dir, '_log.txt')
writeFileSync(logFile, '')
const t0 = Date.now()
const log = m => {
  const l = `[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`
  console.log(l)
  appendFileSync(logFile, l + '\n')
}
let n = 0
const shot = async (page, label) => {
  const f = join(dir, `${String(++n).padStart(3, '0')}-${label}.jpg`)
  try {
    await page.screenshot({ path: f, type: 'jpeg', quality: 82 })
  } catch (e) {
    log(`shot FAILED ${label}: ${e.message}`)
  }
  return f
}
const text = page => page.evaluate(() => document.body.innerText.split('\n').map(x => x.trim()).filter(Boolean).join(' | '))

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: LANG === 'fr' ? 'fr-FR' : 'en-US' })
const pc = await ctx.newPage()
await pc.addInitScript(
  ([lang, q]) => {
    try {
      const k = 'ombres.settings.v1'
      const s = JSON.parse(localStorage.getItem(k) ?? '{}')
      localStorage.setItem(k, JSON.stringify({ ...s, lang, quality: q }))
    } catch {}
  },
  [LANG, Q],
)
const logs = collectLogs(pc, 'pc')
await pc.goto(`${ORIGIN}/?debug`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
log(`qualité ${await pc.evaluate(() => JSON.stringify(window.__ombres.useRenderQuality?.getState?.() ?? null))}`)
await installProbe(pc)
for (let i = 0; i < 8; i++) {
  await sleep(2000)
  await shot(pc, `title-${i}`)
}
await pc.keyboard.press('Space')
await sleep(700)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 15000, 'salon')
await sleep(1500)
await shot(pc, 'lobby')
await pc.keyboard.press('Space')
await sleep(1500)
await shot(pc, 'lobby-kb-joined')
log(`salon : ${await text(pc)}`)
globalThis.__kb = (await state(pc)).roster.find(r => r.kind === 'keyboard')?.slot ?? -1
const pilot = new KeyboardPilot(pc, 1, () => globalThis.__kb, 5)
await pilot.start()
await sleep(6000)
await shot(pc, 'lobby-kb-flying')
await sleep(6000)
await shot(pc, 'lobby-kb-late')
await pilot.stop()
log(`roster : ${JSON.stringify((await state(pc)).roster.map(r => [r.kind, r.name || r.bot?.personality, r.bot?.level, r.goals]))}`)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
for (let i = 0; i < 3; i++) {
  await sleep(1500)
  await shot(pc, `rules-${i}`)
}
log(`cartes : ${await text(pc)}`)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 15000, 'manche')
const TIMES = [-1.5, 0.3, 6, 25, 45, 56, 72, 88, 99, 103, 107.5, 109.5]
let pausedDone = false
for (let r = 1; r <= 3; r++) {
  globalThis.__kb = (await state(pc)).roster.find(r => r.kind === 'keyboard')?.slot ?? -1
  await frameStats(pc)
  await pilot.start()
  let ti = 0
  log(`— manche ${r} — oiseaux ${(await state(pc)).birds}`)
  while (true) {
    const s = await state(pc)
    if (s.phase !== 'round' || s.sunT === null || s.over) break
    if (r === 1 && !pausedDone && s.sunT > 35) {
      pausedDone = true
      await pilot.stop()
      await pc.keyboard.press('Escape')
      await sleep(900)
      await shot(pc, 'pause')
      await pc.keyboard.press('ArrowDown')
      await sleep(250)
      await pc.keyboard.press('Enter')
      await sleep(900)
      await shot(pc, 'pause-settings')
      await pc.keyboard.press('Escape')
      await sleep(500)
      await pc.keyboard.press('Escape')
      await sleep(900)
      if ((await state(pc)).paused) {
        await pc.keyboard.press('Enter')
        await sleep(600)
      }
      await shot(pc, 'resume-countdown')
      await pilot.start()
      continue
    }
    while (ti < TIMES.length && s.sunT >= TIMES[ti]) {
      if (s.sunT - TIMES[ti] < 1.2) await shot(pc, `r${r}-t${TIMES[ti]}-${s.phaseSun}`)
      ti++
    }
    for (const l of await drainLog(pc)) log(`   ${l}`)
    await sleep(80)
  }
  log(`images manche ${r} : ${JSON.stringify(await frameStats(pc))}`)
  await pilot.stop()
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres?.useUi.getState().screen), null, 30000, 'résultats')
  if ((await state(pc)).phase === 'matchResults') break
  await sleep(1200)
  await shot(pc, `r${r}-results-a`)
  await sleep(3500)
  await shot(pc, `r${r}-results-b`)
  log(`résultats r${r} : ${await text(pc)}`)
  await pc.keyboard.press('Enter')
  await waitFor(pc, () => ['round', 'matchResults'].includes(window.__ombres?.runner.phase), null, 30000, 'suite')
}
for (const l of await drainLog(pc)) log(`   ${l}`)
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'matchResults', null, 40000, 'podium')
for (const ms of [800, 2400, 3400, 6000, 10000]) {
  await sleep(ms === 800 ? 800 : { 2400: 1600, 3400: 1000, 6000: 2600, 10000: 4000 }[ms])
  await shot(pc, `podium-${ms}`)
}
log(`podium : ${await text(pc)}`)
log(`raw keys : ${JSON.stringify(await rawKeys(pc))}`)
const p = problems(logs)
log(p.length ? `PROBLÈMES : ${[...new Set(p)].slice(0, 20).join(' | ')}` : 'console propre')
await browser.close()
log('fin')
