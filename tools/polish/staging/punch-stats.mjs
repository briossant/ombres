// Punch-ins (polish S6) d'une partie enregistrée par tools/polish/staging/match.mjs : pour chaque
// touche qui compte (couronne, humain) et chaque punch-in, envergure moyenne de la paire à l'écran
// juste avant (0,75 s) et au plus fort (1,6 s après), écart entre punch-ins.
//   node tools/polish/staging/punch-stats.mjs shots/polish/fix-staging/twelve [slot humain]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const dir = process.argv[2]
const human = Number(process.argv[3] ?? 0)
const reads = JSON.parse(readFileSync(join(dir, 'reads.json'), 'utf8'))
const punches = JSON.parse(readFileSync(join(dir, 'punches.json'), 'utf8'))
const ev = JSON.parse(readFileSync(join(dir, 'events.json'), 'utf8')).events.filter(e => e.k === 'ev' && e.e.type === 'diveHit')
const pairSpan = (r, a, b) => {
  const A = r.birds.find(x => x.s === a)
  const B = r.birds.find(x => x.s === b)
  return A && B ? (A.span + B.span) / 2 : null
}
const window = (t0, t1, a, b) => reads.filter(r => r.t >= t0 && r.t <= t1).map(r => pairSpan(r, a, b)).filter(x => x != null)
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
console.log('| t | touche | punch-in | envergure avant → pic | gain |')
console.log('|---|---|---|---|---|')
for (const h of ev) {
  const e = h.e
  const important = e.crown || e.hunter === human || e.target === human
  const p = punches.find(q => Math.abs(q.t - h.t) < 0.2 && q.hunter === e.hunter)
  if (!important && !p) continue
  const before = mean(window(h.t - 0.75, h.t, e.hunter, e.target))
  const peak = Math.max(...window(h.t, h.t + 1.6, e.hunter, e.target))
  console.log(`| ${h.t.toFixed(1)} | ${e.hunter}→${e.target}${e.crown ? ' couronne' : ''}${e.hunter === human || e.target === human ? ' humain' : ''} | ${p ? 'oui' : 'non'} | ${before.toFixed(0)} → ${peak.toFixed(0)} px | × ${(peak / before).toFixed(2)} |`)
}
const ts = punches.map(p => p.t).sort((a, b) => a - b)
let gap = Infinity
for (let i = 1; i < ts.length; i++) gap = Math.min(gap, ts[i] - ts[i - 1])
console.log(`punch-ins : ${ts.length} ; écart minimal ${Number.isFinite(gap) ? gap.toFixed(1) + ' s' : '—'}`)
