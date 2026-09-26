// Micro-simulation du piqué avec la vraie simulation (GDD §17-E).
//   npx tsx tools/sim-dive.ts [n]
import { diveTrial } from '../src/sim/testkit.ts'

const n = +(process.argv[2] ?? 1000)
const pct = (v: number) => (100 * v).toFixed(1) + ' %'
function batch(opts: Parameters<typeof diveTrial>[1]) {
  let hits = 0, cancelled = 0, dur = 0
  const gaps: number[] = []
  for (let i = 0; i < n; i++) {
    const r = diveTrial(1000 + i, opts)
    if (r.cancelled) cancelled++
    if (r.hit) { hits++; dur += r.duration; if (r.committed) gaps.push(r.commitToContact) }
  }
  gaps.sort((a, b) => a - b)
  return { hit: hits / (n - cancelled), cancelled, dur: dur / Math.max(1, hits), med: gaps[gaps.length >> 1] ?? 0, p10: gaps[Math.floor(gaps.length * 0.1)] ?? 0, p90: gaps[Math.floor(gaps.length * 0.9)] ?? 0 }
}
const base = batch({})
console.log(`Sans réaction : ${pct(base.hit)} de touches (annulés ${base.cancelled}) ; durée moyenne ${base.dur.toFixed(2)} s ; clac→contact médiane ${base.med.toFixed(2)} s (10 % ${base.p10.toFixed(2)}, 90 % ${base.p90.toFixed(2)})`)
const row: string[] = []
for (const rt of [0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5]) row.push(`${rt}s ${pct(batch({ flapAfterCommit: rt }).hit)}`)
console.log('Réaction au clac :', row.join(' | '))
console.log('Crochet permanent :', pct(batch({ jink: true }).hit))
for (const rv of [0.1, 0.2, 0.3]) console.log(`Contre-virage ${rv} s après le clac :`, pct(batch({ jink: true, reverseAfterCommit: rv }).hit))
console.log('Grâce de latence 0,1 s, réaction 0,35 s :', pct(batch({ flapAfterCommit: 0.35, latencyGrace: 0.1 }).hit))
