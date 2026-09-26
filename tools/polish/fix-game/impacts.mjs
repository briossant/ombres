// Vérification G3 + G4 (correcteur game) : une manche à vitesse réelle, pilote clavier
// « appliqué » (feel/pilot.mjs) contre des bots. Journal (?debug) :
//   - flashs « planche » et ralentis (runner.impactLog), chacun avec sa raison ;
//   - bulles d'indication émises par le directeur (instant en temps de soleil).
// Critères : à 12 oiseaux, au plus 4 flashs par manche, chacun justifié ; aucune bulle
// individuelle après 98 s ; ralenti d'esquive (0,6×) visible quand un humain esquive.
//   PORT=8836 node tools/polish/fix-game/impacts.mjs [--bots=11] [--name=twelve]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openPC, toLobby, setupRoster, sleep, waitFor, arg } from '../feel/lib.mjs'
import { installBrain, SmartKeyboardPilot } from '../feel/pilot.mjs'

const NAME = arg('name', 'twelve')
const NBOTS = Number(arg('bots', '11'))
const SHOTS = join(import.meta.dirname, '../../../shots/polish/fix-game', `g34-${NAME}`)
mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const MIX = ['falcon', 'ploughman', 'magpie', 'nomad', 'lookout', 'fool', 'watchmaker']
const bots = Array.from({ length: NBOTS }, (_, i) => ({ p: MIX[i % MIX.length], lv: i % 3 === 2 ? 2 : 1 }))
const { browser, pc } = await openPC({ query: '?debug=nosave', settings: { quality: 'low', hints: 'always', narrator: 'text' } })
await toLobby(pc)
const roster = await setupRoster(pc, { groups: [1], bots: NBOTS > 0 ? bots : null })
log('salon :', roster.map(r => `${r.slot}:${r.kind}${r.bot ? '/' + r.bot.personality : ''}`).join(' '))
await pc.evaluate(() => window.__ombres.runner.setMatchSetting('rounds', 1))
await installBrain(pc)
// journal des bulles (sortie du directeur des indications) et des événements de piqué
await pc.evaluate(() => {
  const r = window.__ombres.runner
  const H = (window.__hintLog = [])
  const orig = r.hints.update.bind(r.hints)
  r.hints.update = (st, ev, inp) => {
    const cues = orig(st, ev, inp)
    for (const c of cues) H.push({ t: +st.sun.t.toFixed(2), id: c.hintId, display: c.display, slot: c.slot })
    return cues
  }
  const D = (window.__diveLog = [])
  window.__ombres.simEvents.on(e => {
    if (e.type === 'diveHit' || (e.type === 'diveMiss' && e.dodged)) D.push({ t: +(r.sim?.state.sun.t ?? 0).toFixed(2), type: e.type, hunter: e.hunter, target: e.target, stolen: e.stolenCells ?? 0, crown: !!e.crown })
  })
})
const kb = roster.find(r => r.kind === 'keyboard')
const pilot = new SmartKeyboardPilot(pc, 1, () => kb.slot, { hunt: true, huntEvery: 12 })
await pc.keyboard.press('Enter')
await sleep(2500)
if ((await pc.evaluate(() => window.__ombres.useUi.getState().screen)) === 'rules') await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.runner.phase === 'round', null, 20000, 'manche')
await pilot.start()
// capture pendant chaque ralenti d'esquive
let shots = 0
let seenImpacts = 0
while ((await pc.evaluate(() => window.__ombres.runner.phase)) === 'round' && !(await pc.evaluate(() => window.__ombres.runner.sim?.state.sun.phase === 'night'))) {
  const imp = await pc.evaluate(() => window.__ombres.runner.impactLog.length)
  if (imp > seenImpacts) {
    const last = await pc.evaluate(() => window.__ombres.runner.impactLog.at(-1))
    seenImpacts = imp
    if (shots < 6) await pc.screenshot({ path: join(SHOTS, `${String(++shots).padStart(2, '0')}-${last.kind}-t${Math.round(last.t)}.jpg`), type: 'jpeg', quality: 80 })
  }
  await sleep(120)
}
await pilot.stop()
const out = await pc.evaluate(() => ({ impacts: window.__ombres.runner.impactLog, hints: window.__hintLog, dives: window.__diveLog, arena: window.__ombres.runner.sim.state.grid.arenaCells, T: window.__ombres.runner.sim.state.sun.T }))
writeFileSync(join(SHOTS, 'journal.json'), JSON.stringify(out, null, 1))
const flashes = out.impacts.filter(i => i.kind === 'flash')
log(`touches : ${out.dives.filter(d => d.type === 'diveHit').length}, esquives : ${out.dives.filter(d => d.type === 'diveMiss').length}`)
for (const d of out.dives) log(`   ${d.t} s ${d.type} h${d.hunter}→t${d.target}${d.type === 'diveHit' ? ` vol ${((100 * d.stolen) / out.arena).toFixed(2)} %${d.crown ? ' couronne' : ''}` : ''}`)
log(`flashs : ${flashes.length}`)
for (const f of flashes) log(`   ${f.t.toFixed(1)} s — ${f.why}`)
log(`ralentis : ${out.impacts.filter(i => i.kind !== 'flash').map(i => `${i.kind} ${i.t.toFixed(1)} s (${i.why})`).join(' ; ') || 'aucun'}`)
const late = out.hints.filter(h => h.display === 'bubble' && h.t >= (98 * out.T) / 110)
log(`bulles : ${out.hints.map(h => `${h.t.toFixed(1)} s ${h.id}`).join(', ') || 'aucune'} | après 98 s : ${late.length}`)
await browser.close()
