// Parties headless de bots scriptés et métriques des critères du GDD §18, comparées
// aux résultats de référence de docs/research/gdd-validation/results.md (§17-F).
//   npx tsx tools/sim-run.ts [--rounds=12] [--suite=all|policies|tension|quick] [--map=parasols]
// Politiques : low, high, mixed, hunter, adapt (portées de validate.mjs, avec un vrai
// coup d'aile au clac : réaction 0,30 ± 0,05 s, 10 % d'oublis).
// Pour brancher d'autres politiques (vrais bots), voir runBatch() dans src/sim/harness.ts.
import { runBatch, type BatchReport, type PolicyName } from '../src/sim/harness.ts'
import type { MapId } from '../src/sim/types.ts'

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const rounds = +(opt.rounds ?? 12)
const suite = opt.suite ?? 'all'
const mapId = (opt.map ?? 'parasols') as MapId

const pct = (v: number, d = 1) => (100 * v).toFixed(d) + ' %'
const row = (cells: (string | number)[]) => '| ' + cells.join(' | ') + ' |'
const header = (cells: string[]) => row(cells) + '\n' + row(cells.map(() => '---'))

// Références de results.md (§ F)
const REF_POLICIES: Record<string, string> = {
  '6 : low, high, mixed, hunter, adapt, mixed': 'parts 11,8 · 16,6 · 16,0 · 11,9 · 10,1 · 16,0 ; victoires 17 · 17 · 33 · 0 · 0 · 33',
  '4 : low, high, mixed, hunter': 'parts 19,7 · 19,2 · 24,3 · 19,6 ; victoires 17 · 8 · 58 · 17',
  '4 : 3 high + 1 low': 'low 37,2 % ; low 100 %',
  '4 : 3 low + 1 high': 'high 27,8 % ; high 75 %',
  '4 : 3 low + 1 hunter': 'hunter 22,3 % ; hunter 67 %',
  'duel low / high': '55,5 / 28,5 ; low 92 %',
  'duel low / mixed': '25,6 / 50,6 ; mixed 100 %',
  'duel high / mixed': '34,5 / 43,9 ; mixed 75 %',
  'duel mixed / hunter': '41,0 / 36,6 ; mixed 67 %',
  'duel low / hunter': '36,3 / 36,7 ; 50 / 50',
}
const REF_TENSION: Record<string, string[]> = {
  // neutre 45 s, meneur 60/90/98, volé GO, écart, changements, >90 s, voisin, piqués, touches, traînée/touche
  '6 (5 mixed + hunter)': ['35 %', '17 / 33 / 50 %', '28,9 %', '3,7 pt', '12,9', '92 %', '40 m', '6,1', '60 %', '1 149 m²'],
  '4 (3 mixed + hunter)': ['38 %', '42 / 42 / 17 %', '22,9 %', '3,5 pt', '11,7', '100 %', '41 m', '5,8', '57 %', '1 359 m²'],
  '2 (mixed / mixed)': ['37 %', '58 / 83 / 58 %', '17,5 %', '10,3 pt', '6,1', '58 %', '54 m', '2,3', '50 %', '1 369 m²'],
  '4 (3 low + hunter)': ['60 %', '42 / 42 / 58 %', '16,8 %', '5,9 pt', '6,4', '67 %', '34 m', '24,6', '65 %', '311 m²'],
  '6, Le Cadran': ['34 %', '17 / 50 / 67 %', '28,3 %', '4,3 pt', '11,2', '75 %', '38 m', '2,8', '52 %', '1 585 m²'],
  '12 (9 mixed + 3 hunter)': ['30 %', '8 / 25 / 50 %', '31,1 %', '3,0 pt', '12,6', '75 %', '35 m', '7,8', '41 %', '1 112 m²'],
}

const t0 = Date.now()
if (suite === 'all' || suite === 'policies') {
  console.log(`\n### Politiques (carte ${mapId}, ${rounds} manches par ligne, positions tournantes)\n`)
  console.log(header(['composition', 'part finale moyenne', 'victoires', 'référence validate.mjs']))
  const configs: [string, PolicyName[]][] = [
    ['6 : low, high, mixed, hunter, adapt, mixed', ['low', 'high', 'mixed', 'hunter', 'adapt', 'mixed']],
    ['4 : low, high, mixed, hunter', ['low', 'high', 'mixed', 'hunter']],
    ['4 : 3 high + 1 low', ['high', 'high', 'high', 'low']],
    ['4 : 3 low + 1 high', ['low', 'low', 'low', 'high']],
    ['4 : 3 low + 1 hunter', ['low', 'low', 'low', 'hunter']],
    ['duel low / high', ['low', 'high']],
    ['duel low / mixed', ['low', 'mixed']],
    ['duel high / mixed', ['high', 'mixed']],
    ['duel mixed / hunter', ['mixed', 'hunter']],
    ['duel low / hunter', ['low', 'hunter']],
  ]
  for (const [name, pols] of configs) {
    const r = runBatch(pols, rounds, { mapId })
    console.log(row([name, pols.map((p, i) => `${p} ${pct(r.share[i]!)}`).join(' · '), pols.map((p, i) => `${p} ${pct(r.wins[i]!, 0)}`).join(' · '), REF_POLICIES[name] ?? '']))
  }
}

function tensionRow(name: string, r: BatchReport): string {
  return row([
    name,
    pct(r.neutralAt45, 0),
    `${pct(r.leaderWin[60]!, 0)} / ${pct(r.leaderWin[90]!, 0)} / ${pct(r.leaderWin[98]!, 0)}`,
    pct(r.stolenGreatShadow),
    (100 * r.gapTop2).toFixed(1) + ' pt',
    r.leaderChanges.toFixed(1),
    pct(r.roundsWithLateChange, 0),
    r.nearestNeighbor.toFixed(0) + ' m',
    r.divesPerRound.toFixed(1),
    pct(r.hitRate, 0),
    r.trailPerHit.toFixed(0) + ' m²',
    String(r.maxHitsTaken),
    pct(r.lowTimeFrac, 0),
    pct(r.kept60, 0),
    r.msPerTick.toFixed(2),
  ])
}

if (suite === 'all' || suite === 'tension' || suite === 'quick') {
  const n = suite === 'quick' ? Math.min(rounds, 4) : rounds
  console.log(`\n### Tension, contact, piqués (${n} manches par ligne) — critères du GDD §18\n`)
  console.log(
    header(['configuration', 'neutre à 45 s', 'meneur à 60 / 90 / 98 s vainqueur', 'volé pendant la Grande Ombre', 'écart 1er-2e', 'changements de meneur', 'manches avec changement > 90 s', 'plus proche voisin', 'piqués / manche', 'touches', 'traînée / touche', 'max touches subies', 'temps en bas', 'final déjà à soi à 60 s', 'ms / tick']),
  )
  const sym: [string, PolicyName[], MapId][] = [
    ['6 (5 mixed + hunter)', ['mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'hunter'], mapId],
    ['4 (3 mixed + hunter)', ['mixed', 'mixed', 'mixed', 'hunter'], mapId],
    ['2 (mixed / mixed)', ['mixed', 'mixed'], mapId],
    ['4 (3 low + hunter)', ['low', 'low', 'low', 'hunter'], mapId],
    ['6, Le Cadran', ['mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'hunter'], 'cadran'],
    ['12 (9 mixed + 3 hunter)', Array.from({ length: 12 }, (_, i) => (i % 4 === 3 ? 'hunter' : 'mixed')) as PolicyName[], mapId],
  ]
  const list = suite === 'quick' ? sym.slice(0, 1) : sym
  const refs: string[] = []
  for (const [name, pols, map] of list) {
    const r = runBatch(pols, n, { mapId: map })
    console.log(tensionRow(name, r))
    const ref = REF_TENSION[name]
    if (ref) refs.push(row([`réf. ${name}`, ...ref]))
  }
  console.log('\nRéférences validate.mjs (results.md §F) : neutre 45 s · meneur 60/90/98 · volé GO · écart · changements · > 90 s · voisin · piqués · touches · traînée\n')
  console.log(refs.join('\n'))
}
console.error(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`)
