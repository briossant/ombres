// Statistiques de lisibilité à partir de reads.json (sonde installReadProbe) : envergure à l'écran,
// oiseaux sous la bande de sable / hors cadre, par phase.
import { readFileSync } from 'node:fs'
const f = process.argv[2]
const slot = Number(process.argv[3] ?? 0)
const R = JSON.parse(readFileSync(f, 'utf8'))
const by = {}
for (const r of R) {
  const k = r.ph
  const s = (by[k] ??= { n: 0, spans: [], mine: [], under: 0, out: 0, birds: 0, topY: [], spreadY: [] })
  s.n++
  const ys = []
  for (const b of r.birds) {
    s.birds++
    s.spans.push(b.span)
    if (b.s === slot) s.mine.push(b.span)
    const top = b.y - 0.9 * b.span // l'ancre est sous l'oiseau
    if (b.x < 0 || b.x > r.W || b.y < 0 || b.y > r.H) s.out++
    else if (r.barBottom && top < r.barBottom + 10) s.under++
    ys.push(b.y)
  }
  s.topY.push(Math.min(...ys))
  s.spreadY.push(Math.max(...ys) - Math.min(...ys))
}
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))] }
console.log('| phase | échantillons | envergure px (p10 / médiane / p90) | mon oiseau (médiane / min) | oiseaux sous la bande de sable | hors cadre | écart vertical médian |')
console.log('|---|---|---|---|---|---|---|')
for (const k of ['countdown', 'noon', 'afternoon', 'golden', 'sunset', 'greatShadow']) {
  const s = by[k]
  if (!s) continue
  console.log(`| ${k} | ${s.n} | ${q(s.spans, 0.1)} / ${q(s.spans, 0.5)} / ${q(s.spans, 0.9)} | ${q(s.mine, 0.5)} / ${Math.min(...s.mine)} | ${(100 * s.under / s.birds).toFixed(1)} % | ${(100 * s.out / s.birds).toFixed(1)} % | ${q(s.spreadY, 0.5)} px |`)
}
