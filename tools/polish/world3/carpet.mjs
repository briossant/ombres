// Polish 3 (correcteur world-3) : mesure du « tapis » saturé (couchant à 12 joueurs) sur des captures.
// Par image (réduite à 960 × 540, OKLab) :
//   L méd      médiane de L (high-key, bible §7.7 : couchant ≥ 0,50)
//   C p90      90e centile de la chroma des pixels peints (C > 0,045)
//   C>0,12     part de l'image au-dessus du plafond de chroma du couchant (0,12, fix2-world)
//   C moy      chroma moyenne de toute l'image (« charge » de couleur)
//   morcel.    part des pixels dont la teinte change franchement à 3 px (ΔE > 0,06, les deux voisins
//              peints) : densité de coutures de la mosaïque
//   node tools/polish/world3/carpet.mjs a.png b.png …
import { execFileSync } from 'node:child_process'

const s2l = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const LUT = new Float32Array(256).map((_, i) => s2l(i / 255))
const W = 960
const H = 540
for (const f of process.argv.slice(2)) {
  const buf = execFileSync('magick', [f, '-resize', `${W}x${H}!`, '-depth', '8', 'rgb:-'], { maxBuffer: 1 << 26 })
  const n = W * H
  const L = new Float32Array(n)
  const A = new Float32Array(n)
  const B = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const r = LUT[buf[3 * i]], g = LUT[buf[3 * i + 1]], b = LUT[buf[3 * i + 2]]
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    L[i] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
    A[i] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
    B[i] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  }
  const C = new Float32Array(n)
  let csum = 0, over = 0
  const painted = []
  for (let i = 0; i < n; i++) {
    C[i] = Math.hypot(A[i], B[i])
    csum += C[i]
    if (C[i] > 0.12) over++
    if (C[i] > 0.045) painted.push(C[i])
  }
  painted.sort((x, y) => x - y)
  const Ls = Float32Array.from(L).sort()
  let seams = 0, cand = 0
  const d = 3
  for (let y = 0; y < H - d; y++)
    for (let x = 0; x < W - d; x++) {
      const i = y * W + x
      if (C[i] < 0.045) continue
      for (const j of [i + d, i + d * W]) {
        if (C[j] < 0.045) continue
        cand++
        if (Math.hypot(L[i] - L[j], A[i] - A[j], B[i] - B[j]) > 0.06) seams++
      }
    }
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0
  console.log(
    `${f.split('/').slice(-2).join('/').padEnd(34)} L méd ${Ls[n >> 1].toFixed(3)}  L>0,6 ${((100 * Ls.filter(v => v > 0.6).length) / n).toFixed(1)} %  peint ${((100 * painted.length) / n).toFixed(0)} %  C méd ${q(painted, 0.5).toFixed(3)}  C p90 ${q(painted, 0.9).toFixed(3)}  C>0,12 ${((100 * over) / n).toFixed(1)} %  C moy ${(csum / n).toFixed(4)}  morcel. ${((100 * seams) / Math.max(cand, 1)).toFixed(1)} %`,
  )
}
