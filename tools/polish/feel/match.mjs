// Partie jouée au clavier par un (ou deux) pilote(s) « appliqué(s) » contre des bots, à vitesse réelle,
// enregistrée en continu : image de survol toutes les 2 s, rafales autour des piqués, touches,
// couronnes, gros vols, phases, dernières secondes, nuit, résultats, podium.
//   PORT=8822 node tools/polish/feel/match.mjs --name=solo --groups=1 [--bots='[{"p":"falcon","lv":1}]']
//        [--rounds=3] [--q=high] [--speed=1] [--hunt=1] [--stopAfterRound=1]
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openPC, toLobby, setupRoster, installTap, drainTap, Recorder, outDir, sleep, waitFor, arg, snap, installReadProbe, drainRead } from './lib.mjs'
import { installBrain, SmartKeyboardPilot } from './pilot.mjs'

const name = arg('name', 'solo')
const groups = arg('groups', '1').split(',').filter(Boolean).map(Number)
const bots = arg('bots', null) ? JSON.parse(arg('bots')) : null
const rounds = Number(arg('rounds', '3'))
const speed = Number(arg('speed', '1'))
const stopAfter = Number(arg('stopAfterRound', '99'))
const hunt = arg('hunt', '1') === '1'
const dir = outDir(name)
const t0 = Date.now()
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`)

const query = speed > 1 ? `?debug=fast,nosave&speed=${speed}` : '?debug=nosave'
const { browser, pc, cdp, logs } = await openPC({ query, settings: { quality: arg('q', 'high'), hints: 'always' } })
await toLobby(pc)
const roster = await setupRoster(pc, { groups, bots })
log(`salon : ${JSON.stringify(roster)}`)
await pc.evaluate(n => window.__ombres.runner.setMatchSetting('rounds', n), rounds).catch(e => log(`rounds: ${e.message}`))
await sleep(1500)
await pc.screenshot({ path: join(dir, 'lobby.jpg'), type: 'jpeg', quality: 80 })
await installTap(pc)
await installBrain(pc)
await installReadProbe(pc)
const reads = []

const rec = new Recorder(cdp, dir, { overviewMs: Number(arg('ov', '2000')) })
await rec.start()
const kbSlots = roster.filter(r => r.kind === 'keyboard').map(r => r.slot)
const pilots = kbSlots.map((s, i) => new SmartKeyboardPilot(pc, groups[i], () => s, { hunt, huntEvery: i === 0 ? 12 : 18 }))

await pc.keyboard.press('Enter')
await waitFor(pc, () => ['rules', 'game'].includes(window.__ombres?.useUi.getState().screen), null, 10000, 'cartes')
rec.tag = 'rules'
await sleep(2500)
if ((await pc.evaluate(() => window.__ombres.useUi.getState().screen)) === 'rules') await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 15000, 'manche')
for (const p of pilots) await p.start()

const events = []
const snaps = []
let nWin = 0
const seenDive = new Set()
const markEv = (e, w) => {
  const E = e.e
  const pad = s => String(++nWin).padStart(3, '0') + '-' + s
  if (!E) return
  switch (E.type) {
    case 'diveWindup':
      rec.mark(pad(`windup-h${E.hunter}-t${E.target}`), w, 300, 1900)
      break
    case 'diveHit':
      rec.mark(pad(`hit-h${E.hunter}-t${E.target}${E.crown ? '-crown' : ''}`), w, 700, 2200)
      break
    case 'diveMiss':
      rec.mark(pad(`miss-h${E.hunter}-t${E.target}${E.dodged ? '-dodged' : ''}`), w, 500, 1600)
      break
    case 'crown':
      rec.mark(pad(`crown-${E.slot}`), w, 300, 1500)
      break
    case 'bigSteal':
      if (E.frac >= 0.045 || kbSlots.includes(E.slot) || kbSlots.includes(E.victim)) rec.mark(pad(`bigsteal-${E.slot}`), w, 1000, 1000)
      break
    case 'phase':
      rec.mark(pad(`phase-${E.phase}`), w, 500, 3500)
      break
    case 'tenSeconds':
      rec.mark(pad('ten'), w, 200, 1500)
      break
    case 'lastSeconds':
      if (E.n === 1 || E.n === 3) rec.mark(pad(`last${E.n}`), w, 200, 1500)
      break
    case 'night':
      rec.mark(pad('night'), w, 1500, 6000)
      break
    case 'countdown':
      if (E.n === 3) rec.mark(pad('countdown'), w, 300, 4500)
      break
  }
}

let round = 0
let lastSnap = 0
let done = false
while (!done) {
  const tap = await drainTap(pc).catch(() => [])
  for (const e of tap) {
    events.push({ ...e, rel: +((e.w - t0) / 1000).toFixed(2), round })
    if (e.k === 'ev') markEv(e, e.w)
    if (e.k === 'screen') {
      log(`écran ${e.v}`)
      rec.tag = `${e.v}-r${round}`
      if (e.v === 'roundResults') {
        rec.mark(String(++nWin).padStart(3, '0') + `-results-r${round}`, e.w, 200, 9000)
      }
      if (e.v === 'game') round++
      if (e.v === 'matchResults') rec.mark(String(++nWin).padStart(3, '0') + '-podium', e.w, 500, 12000)
    }
    if (e.k !== 'ev') log(`${e.k} ${e.v}`)
    else if (!['lock', 'unlock', 'flap', 'hidden', 'storm', 'bump', 'towerBump', 'countdown'].includes(e.e.type)) log(`ev t=${e.t?.toFixed?.(1)} ${JSON.stringify(e.e)}`)
  }
  for (const r of await drainRead(pc).catch(() => [])) reads.push({ round, ...r })
  if (Date.now() - lastSnap > 1000) {
    lastSnap = Date.now()
    const s = await snap(pc).catch(() => null)
    if (s) snaps.push({ w: Date.now(), round, ...s })
  }
  const st = await pc.evaluate(() => ({ screen: window.__ombres.useUi.getState().screen, phase: window.__ombres.runner.phase, round: window.__ombres.runner.roundIndex })).catch(() => null)
  if (st?.screen === 'roundResults' && round >= stopAfter) {
    await sleep(Number(arg('tail', '9500')))
    done = true
  }
  if (st?.screen === 'matchResults') {
    await sleep(14000)
    done = true
  }
  await sleep(120)
}
for (const p of pilots) await p.stop()
await rec.stop()
const results = await pc.evaluate(() => {
  const o = window.__ombres
  const m = o.runner.match
  return {
    results: m?.results?.map(r => r.slots?.map(s => ({ slot: s.slot, share: s.share ?? s.cells, rank: s.rank, points: s.points })) ?? r),
    matchRes: o.useMatchResults?.getState?.() ?? null,
    counts: window.__feelCount,
  }
})
writeFileSync(join(dir, 'reads.json'), JSON.stringify(reads))
writeFileSync(join(dir, 'events.json'), JSON.stringify({ roster, events, snaps, results, pilots: pilots.map(p => p.stats), fps: rec.fps(), frames: rec.frames }, null, 1))
log(`screencast ${rec.frames} images, ${rec.fps().toFixed(1)} i/s ; pilotes ${JSON.stringify(pilots.map(p => p.stats))}`)
const pb = logs.filter(l => /^\[(error|warning|pageerror)\]/.test(l))
log(pb.length ? `console : ${[...new Set(pb)].slice(0, 10).join(' | ')}` : 'console propre')
await browser.close()
