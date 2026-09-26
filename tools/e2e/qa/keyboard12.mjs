// QA : 100 % clavier, 2 joueurs (WASD + IJKL) et 10 bots = 12 oiseaux, une manche à vitesse réelle.
// Mesure des images (rAF) et de la charge GPU ; réglages en cours de manche : langue EN,
// daltonien, qualité basse puis haute, narrateur texte puis muet, volumes.
//   node tools/e2e/qa/keyboard12.mjs [--speed=1] [--q=auto]
import { readFileSync } from 'node:fs'
import { ORIGIN, launch, newContext, collectLogs, makeShots, sleep, waitFor, state, problems, arg, rawKeys, presetSettings } from './lib.mjs'
import { KeyboardPilot } from './pilot.mjs'
import { installProbe, drainLog, frameStats } from './probe.mjs'

const SPEED = Number(arg('speed', '1'))
const { shot, log } = makeShots(arg('name', 'keyboard12'))
const gpu = () => {
  try {
    return Number(readFileSync('/sys/class/drm/card1/device/gpu_busy_percent', 'utf8'))
  } catch {
    return -1
  }
}
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collectLogs(pc)
await presetSettings(pc, { lang: 'fr', quality: arg('q', 'high') })
await pc.goto(`${ORIGIN}/${SPEED > 1 ? `?debug=fast&speed=${SPEED}` : '?debug'}`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await installProbe(pc)
await sleep(1500)
await pc.keyboard.press('Enter')
await sleep(500)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 15000, 'salon')
await sleep(800)
await pc.keyboard.press('Space')
await sleep(600)
await pc.keyboard.press('AltRight')
await sleep(600)
// 10 bots : via l'action UI (souris) jusqu'à 12 oiseaux
for (let i = 0; i < 12; i++) {
  const n = (await state(pc)).roster.length
  if (n >= 12) break
  await pc.locator('.roster__add').first().click()
  await sleep(250)
}
await sleep(1500)
let s = await state(pc)
log(`salon : ${s.roster.length} oiseaux : ${s.roster.map(r => `${r.kind}:${r.color}`).join(' ')}`)
await shot(pc, 'lobby-12')
const kb = g => () => globalThis.__r?.find(r => r.kind === 'keyboard' && r.name === '' && r.slot === globalThis.__kb?.[g])?.slot ?? globalThis.__kb?.[g] ?? -1
globalThis.__kb = {}
for (const r of s.roster) if (r.kind === 'keyboard') globalThis.__kb[Object.keys(globalThis.__kb).length + 1] = r.slot
const p1 = new KeyboardPilot(pc, 1, () => globalThis.__kb[1], 5)
const p2 = new KeyboardPilot(pc, 2, () => globalThis.__kb[2], 8)
await pc.keyboard.press('Enter') // lancer
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
await sleep(1200)
await shot(pc, 'rules')
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 8000, 'manche')
await Promise.all([p1.start(), p2.start()])
await frameStats(pc)
const setS = patch => pc.evaluate(p => { for (const [k, v] of Object.entries(p)) window.__ombres.useSettings.getState().set(k, v) }, patch)
const steps = [
  [
    12,
    'lang-en-ui',
    async () => {
      // par l'interface : Échap (pause) → Réglages → English → Échap → Échap (reprise)
      await pc.keyboard.press('Escape')
      await sleep(600)
      await pc.locator('.pause__menu button').nth(1).click()
      await sleep(600)
      await shot(pc, 'settings-in-pause')
      await pc.locator('.seg__opt', { hasText: 'English' }).click()
      await sleep(500)
      await shot(pc, 'settings-en')
      await pc.keyboard.press('Escape')
      await sleep(400)
      await shot(pc, 'pause-after-settings')
      await pc.keyboard.press('Escape')
    },
  ],
  [20, 'colorblind', async () => setS({ colorblind: true })],
  [30, 'quality-low', async () => setS({ quality: 'low' })],
  [45, 'quality-high', async () => setS({ quality: 'high' })],
  [55, 'narrator-text', async () => setS({ narrator: 'text', colorblind: false })],
  [80, 'narrator-off', async () => setS({ narrator: 'off', lang: 'fr' })],
]
let next = 0
let nextShot = 0
const per = {}
let phaseKey = 'x'
while ((s = await state(pc)).phase === 'round') {
  const t = s.sunT ?? 0
  if (next < steps.length && t >= steps[next][0]) {
    const [, label, fn] = steps[next++]
    per[phaseKey] = await frameStats(pc)
    await fn().catch(e => log(`${label}: ${e.message}`))
    phaseKey = label
    await sleep(1500)
    await shot(pc, `r1-${label}`)
    const cfg = await pc.evaluate(() => {
      const o = window.__ombres
      const st = o.useSettings.getState()
      return { lang: st.lang, cb: st.colorblind, q: st.quality, level: o.useRenderQuality.getState().level, narr: st.narrator, paused: o.useUi.getState().paused }
    })
    log(`${label} ; ${JSON.stringify(cfg)} ; raw keys ${JSON.stringify(await rawKeys(pc))}`)
  } else if (Date.now() > nextShot) {
    nextShot = Date.now() + 8000
    await shot(pc, `r1-t${Math.round(t)}`)
  }
  per.__gpu = per.__gpu ?? []
  per.__gpu.push(gpu())
  for (const l of await drainLog(pc)) console.log('   ', l)
  await sleep(400)
}
per[phaseKey] = await frameStats(pc)
const g = per.__gpu.filter(x => x >= 0)
delete per.__gpu
for (const [k, v] of Object.entries(per)) log(`images ${k} : ${JSON.stringify(v)}`)
log(`gpu_busy moy ${(g.reduce((a, b) => a + b, 0) / g.length).toFixed(0)} % (max ${Math.max(...g)})`)
await Promise.all([p1.stop(), p2.stop()])
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'roundResults', null, 20000, 'résultats')
await sleep(4500)
await shot(pc, 'results-12')
const r = await pc.evaluate(() => {
  const o = window.__ombres
  return { stats: o.runner.match?.results[0]?.slots.length, draw: o.runner.sim?.state.birds.length }
})
log(JSON.stringify(r))
for (const l of await drainLog(pc)) console.log('   ', l)
const p = problems(logs)
console.log(p.length ? `PROBLÈMES :\n  ${[...new Set(p)].join('\n  ')}` : 'console propre')
await browser.close()
