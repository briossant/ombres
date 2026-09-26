// Revue DA : ΔE OKLab entre le lavis PÂLE de chaque couleur et le sol plat.
//   node tools/polish/art/pale-vs-ground.mjs [#aaaaaa:#bbbbbb …]
// (1) valeurs de la bible (§2.2, §3.3), pour mémoire ; (2) lavis TEL QUE RENDU EN JEU (même formule que
// src/host/render/world/groundMaterial.ts : garde pâle / sol du polish world W8, plafond de chroma de
// l'heure dorée W12), pour les 12 couleurs à toutes les keyframes. Porte : minimum ≥ 0,05 (code 1 sinon).
import palette from '../../../src/shared/palette.json' with { type: 'json' }

const s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lab = h => {
  const r = s2l(parseInt(h.slice(1, 3), 16)), g = s2l(parseInt(h.slice(3, 5), 16)), b = s2l(parseInt(h.slice(5, 7), 16))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s]
}
const dist = (A, B) => Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
const de = (a, b) => dist(lab(a), lab(b)).toFixed(3)

// (1) valeurs de la bible (avant le polish : sans garde)
const kf = { KF16: '#EAB377', KF10: '#D29E90', KF3: '#82788B', KF1: '#797286' }
const pale = { Corail: { KF16: '#DFA693', KF10: '#CD937F', KF3: '#A76C57' }, Carmin: { KF16: '#E0A3A9', KF10: '#CE8F96', KF3: '#9E5F67' }, Rose: { KF16: '#D7A6B3', KF10: '#C593A0', KF3: '#B07B89' }, Safran: { KF16: '#C8B480', KF10: '#B6A16B', KF3: '#A0894F' }, Prune: { KF16: '#C8A9CC', KF10: '#B696BA', KF3: '#8E6E93' }, Lilas: { KF16: '#B4AEE1', KF10: '#A29BD0', KF3: '#8A82BA' } }
console.log('— bible (sans garde) —')
for (const [n, p] of Object.entries(pale)) console.log(n, Object.entries(p).map(([k, h]) => `${k} ${h} vs ${kf[k]} dE=${de(h, kf[k])}`).join(' | '))
for (const a of process.argv.slice(2)) { const [x, y] = a.split(':'); console.log(a, de(x, y)) }

// (2) en jeu (groundMaterial.ts washLab, q = 0)
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const PALE_DE = 0.06
const PAINT_C_GOLDEN_MAX = 0.125
function paleWash(t, G, paintC, cmax) {
  const Lg = G[0]
  let Ls = 0.5 * Lg + 0.35 + t.dL
  Ls = Ls + (Math.min(Ls, Lg - 0.05) - Ls) * sst(0.66, 0.8, Lg)
  let Lp = Lg < 0.66 ? Lg + (Ls - Lg) * 0.45 : Lg - 0.03
  const h = (t.h * Math.PI) / 180, dir = [Math.cos(h), Math.sin(h)]
  const C0 = Math.min(paintC * t.cs, cmax)
  let Cp = 0.55 * C0
  let dl = Lp - Lg
  const dab = [dir[0] * Cp - G[1], dir[1] * Cp - G[2]], dd = dab[0] ** 2 + dab[1] ** 2
  if (dl * dl + dd < PALE_DE ** 2) {
    const s = Math.abs(Ls - Lg) > 0.01 ? Math.sign(Ls - Lg) : -1, adl = Math.abs(dl)
    dl = s * Math.min(Math.max(Math.sqrt(Math.max(PALE_DE ** 2 - dd, 0)), adl), Math.max(adl, 0.05))
    const rem2 = PALE_DE ** 2 - dl * dl
    if (rem2 > dd) { const pd = dir[0] * G[1] + dir[1] * G[2], gg = G[1] ** 2 + G[2] ** 2; Cp = Math.min(Math.max(Cp, pd + Math.sqrt(Math.max(pd * pd - gg + rem2, 0))), 0.85 * C0) }
    Lp = Lg + dl
  }
  return [Lp, dir[0] * Cp, dir[1] * Cp]
}
console.log('— en jeu (garde pâle / sol ≥ 0,06) —')
let worst = { v: 9, who: '' }
for (const k of palette.keyframes) {
  const G = lab(k.hex.groundFlat), pe = k.paletteElevDeg
  const cmax = PAINT_C_GOLDEN_MAX + (1 - sst(34, 25, pe) * sst(5, 9, pe)) * (1 - PAINT_C_GOLDEN_MAX)
  const row = palette.players.map(p => ({ n: p.fr, v: dist(paleWash(p.terr, G, k.derived.paintChroma, cmax), G) }))
  const m = row.reduce((a, b) => (b.v < a.v ? b : a))
  if (m.v < worst.v) worst = { v: m.v, who: `${k.id} ${m.n}` }
  console.log(k.id.padEnd(6), row.map(r => `${r.n.slice(0, 4)} ${r.v.toFixed(3)}`).join(' '), `| min ${m.v.toFixed(3)} (${m.n})`)
}
const ok = worst.v >= 0.05
console.log(`PORTE pâle contre sol ≥ 0,05 : ${ok ? 'OK' : 'ÉCHEC'} (minimum ${worst.v.toFixed(3)}, ${worst.who})`)
if (!ok) process.exitCode = 1
