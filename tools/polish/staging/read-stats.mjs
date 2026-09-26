// Statistiques de lisibilité (comme tools/polish/feel/read-stats.mjs) à partir d'un reads.json de
// tools/polish/staging/match.mjs, avec en plus : part des échantillons où AU MOINS un oiseau est
// sous la bande ou hors cadre, les mêmes chiffres hors punch-in (où seuls des bots peuvent sortir),
// le sable vide sous l'arène et la couverture des tours estimée par la caméra.
//   node tools/polish/staging/read-stats.mjs shots/polish/fix-staging/six/reads.json [slot humain]
import { readFileSync } from 'node:fs'
const f = process.argv[2]
const slot = Number(process.argv[3] ?? 0)
const R = JSON.parse(readFileSync(f, 'utf8'))
const by = {}
for (const r of R) {
  const k = r.ph
  const s = (by[k] ??= { n: 0, spans: [], mine: [], under: 0, out: 0, birds: 0, sUnder: 0, sOut: 0, np: 0, pUnder: 0, pOut: 0, pBirds: 0, psUnder: 0, psOut: 0, gap: [], cover: [], punch: 0, humanOut: 0 })
  s.n++
  const inPunch = (r.cam?.punch ?? 0) > 0.02
  if (inPunch) s.punch++
  else s.np++
  let u = false
  let o = false
  for (const b of r.birds) {
    s.birds++
    s.spans.push(b.span)
    if (b.s === slot) s.mine.push(b.span)
    const top = b.y - 0.9 * b.span // l'ancre est sous l'oiseau
    const isOut = b.x < 0 || b.x > r.W || b.y < 0 || b.y > r.H
    const isUnder = !isOut && r.barBottom && top < r.barBottom + 10
    if (isOut) s.out++
    else if (isUnder) s.under++
    if (isOut && b.s === slot) s.humanOut++
    if (!inPunch) {
      s.pBirds++
      if (isOut) s.pOut++
      else if (isUnder) s.pUnder++
    }
    u ||= !!isUnder
    o ||= isOut
  }
  if (u) s.sUnder++
  if (o) s.sOut++
  if (!inPunch && u) s.psUnder++
  if (!inPunch && o) s.psOut++
  if (r.cam) {
    s.gap.push(1 - r.cam.arena.y1)
    s.cover.push(r.cam.cover)
  }
}
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))] : NaN }
const pc = (a, b) => (b ? `${((100 * a) / b).toFixed(1)} %` : '—')
console.log('| phase | éch. | envergure p10/méd/p90 | mon oiseau méd/min | sous la bande : oiseaux / éch. ≥1 | hors cadre : oiseaux / éch. ≥1 | hors punch-in : sous la bande / hors cadre (éch. ≥1) | éch. en punch-in | mon oiseau hors cadre | sable vide bas méd/p90 | tours méd/p90/max |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|')
for (const k of ['countdown', 'noon', 'afternoon', 'golden', 'sunset', 'greatShadow']) {
  const s = by[k]
  if (!s) continue
  console.log(
    `| ${k} | ${s.n} | ${q(s.spans, 0.1)} / ${q(s.spans, 0.5)} / ${q(s.spans, 0.9)} | ${q(s.mine, 0.5)} / ${Math.min(...s.mine)} | ${pc(s.under, s.birds)} / ${pc(s.sUnder, s.n)} | ${pc(s.out, s.birds)} / ${pc(s.sOut, s.n)} | ${pc(s.psUnder, s.np)} / ${pc(s.psOut, s.np)} | ${s.punch} | ${s.humanOut} | ${(100 * q(s.gap, 0.5)).toFixed(1)} / ${(100 * q(s.gap, 0.9)).toFixed(1)} % | ${(100 * q(s.cover, 0.5)).toFixed(0)} / ${(100 * q(s.cover, 0.9)).toFixed(0)} / ${(100 * Math.max(...s.cover)).toFixed(0)} % |`,
  )
}
