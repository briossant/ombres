// Vue de dessus d'un SimState (débogage visuel de la simulation, sans navigateur).
// Nord en haut, est à droite ; 2 px par cellule de grille.
import { Image, hex, mix, type RGB } from './sim-image.ts'
import type { SimState } from '../src/sim/types.ts'
import { PLAYER_COLORS } from '../src/shared/players.ts'
import { towerShadowHulls } from '../src/sim/query.ts'

const SAND = hex('#F1DABE')
const OUTSIDE = hex('#D9C2A2')
const SHADOW = hex('#A18EA1')
const NIGHT = hex('#575568')
const INK = hex('#2B1D23')
const CROWN = hex('#FFF2C3')

export function drawState(st: SimState, opts: { scale?: number; label?: string; hulls?: boolean } = {}): Image {
  const g = st.grid
  const S = opts.scale ?? 2
  const img = new Image(g.cols * S, g.rows * S + 28)
  img.fill(hex('#F7F0E3'))
  const colors: RGB[] = PLAYER_COLORS.map((c) => hex(c.hex))
  const toPx = (x: number, y: number): [number, number] => [((x - g.x0) / g.cellW) * S, 28 + (g.rows - (y - g.y0) / g.cellH) * S]
  // cellules
  for (let j = 0; j < g.rows; j++) {
    for (let i = 0; i < g.cols; i++) {
      const k = j * g.cols + i
      let c: RGB = g.inArena[k] ? SAND : OUTSIDE
      const o = g.owner[k]!
      if (o > 0) {
        const pc = colors[(o - 1) % colors.length]!
        c = mix(SAND, pc, g.level[k] === 2 ? 0.85 : 0.4)
      }
      if (g.frozen[k]) {
        const nightCell = st.night.active && isNight(st, g.x0 + (i + 0.5) * g.cellW, g.y0 + (j + 0.5) * g.cellH)
        c = mix(c, nightCell ? NIGHT : SHADOW, nightCell ? 0.55 : 0.45)
      }
      const py = 28 + (g.rows - 1 - j) * S
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) img.set(i * S + dx, py + dy, c)
    }
  }
  // contour de l'arène et bande du Simoun
  const { a, b, stormFrom } = st.arena
  for (let q = 0; q < 720; q++) {
    const t0 = (q / 720) * Math.PI * 2
    const t1 = ((q + 1) / 720) * Math.PI * 2
    const [x0, y0] = toPx(a * Math.cos(t0), b * Math.sin(t0))
    const [x1, y1] = toPx(a * Math.cos(t1), b * Math.sin(t1))
    img.line(x0, y0, x1, y1, INK, 1, 0.7)
    const [u0, v0] = toPx(a * stormFrom * Math.cos(t0), b * stormFrom * Math.sin(t0))
    const [u1, v1] = toPx(a * stormFrom * Math.cos(t1), b * stormFrom * Math.sin(t1))
    if (q % 4 < 2) img.line(u0, v0, u1, v1, INK, 1, 0.35)
  }
  // enveloppes d'ombres de tours (contour)
  if (opts.hulls) {
    for (const h of towerShadowHulls(st)) {
      const [c0x, c0y] = toPx(h.c0x, h.c0y)
      const [c1x, c1y] = toPx(h.c1x, h.c1y)
      img.circle(c0x, c0y, (h.r0 / g.cellW) * S, INK, 1, 0.25)
      img.circle(c1x, c1y, (h.r1 / g.cellW) * S, INK, 1, 0.25)
    }
  }
  // tours : pied et silhouette du plus grand disque
  for (const t of st.towers) {
    const [px, py] = toPx(t.x, t.y)
    let rMax = 0
    for (const s of t.segments) rMax = Math.max(rMax, s.r0, s.r1)
    img.circle(px, py, (rMax / g.cellW) * S, INK, 1, 0.25)
    img.disc(px, py, (t.trunkRadius / g.cellW) * S, INK, 0.9)
  }
  // oiseaux : empreinte, fil d'ombre, corps, cap
  for (const bird of st.birds) {
    const c = colors[bird.slot % colors.length]!
    const fp = bird.shadow
    const dx = st.sun.shadowDirX
    const dy = st.sun.shadowDirY
    const n = 96
    for (let q = 0; q < n; q++) {
      if (!fp.strong && q % 2) continue
      const t0 = (q / n) * Math.PI * 2
      const t1 = ((q + 1) / n) * Math.PI * 2
      const p = (t: number): [number, number] => toPx(fp.cx + Math.cos(t) * fp.rAlong * dx - Math.sin(t) * fp.r * dy, fp.cy + Math.cos(t) * fp.rAlong * dy + Math.sin(t) * fp.r * dx)
      const [x0, y0] = p(t0)
      const [x1, y1] = p(t1)
      img.line(x0, y0, x1, y1, mix(c, INK, 0.3), 2, bird.stun > 0 ? 0.3 : 0.9)
    }
    const [bx, by] = toPx(bird.x, bird.y)
    const [sx, sy] = toPx(fp.cx, fp.cy)
    if (Math.hypot(sx - bx, sy - by) > 8) img.line(bx, by, sx, sy, mix(c, INK, 0.5), 1, 0.6, 3)
    const r = 3 + (bird.z / 18) * 4
    img.disc(bx, by, r + 1.5, INK)
    img.disc(bx, by, r, bird.stun > 0 ? mix(c, hex('#888888'), 0.6) : c)
    img.line(bx, by, bx + Math.cos(bird.heading) * (r + 8), by - Math.sin(bird.heading) * (r + 8), INK, 2)
    if (bird.crown) img.disc(bx, by - r - 6, 4, CROWN)
    if (bird.hidden) img.circle(bx, by, r + 5, INK, 1, 0.8)
    if (bird.immune > 0) img.circle(bx, by, r + 7, hex('#FFFFFF'), 2, 0.9)
    if (bird.lockTarget >= 0) {
      const t = st.bySlot[bird.lockTarget]
      if (t) {
        const [tx, ty] = toPx(t.x, t.y)
        img.line(bx, by, tx, ty, bird.dive !== 'none' ? hex('#C0282D') : mix(c, INK, 0.3), bird.dive === 'committed' ? 3 : 1, 0.9, bird.dive === 'none' ? 4 : 0)
      }
    }
  }
  // bandeau
  const T = st.sun.T
  const counts = st.birds.map((b) => `${(100 * g.counts[b.slot + 1]! / g.arenaCells).toFixed(1)}`).join(' ')
  img.text(8, 7, `${opts.label ?? ''} T=${st.sun.t.toFixed(1)}/${T} E=${((st.sun.elevation * 180) / Math.PI).toFixed(1)} ${st.sun.phase}  ${counts}`, INK, 2)
  return img
}

function isNight(st: SimState, x: number, y: number): boolean {
  const n = st.night
  const along = x * n.dirX + y * n.dirY
  const q = -x * n.dirY + y * n.dirX
  const f = ((q + n.jagSpan) / (2 * n.jagSpan)) * (n.jag.length - 1)
  const i = Math.max(0, Math.min(n.jag.length - 2, Math.floor(f)))
  const jag = n.jag[i]! + (n.jag[i + 1]! - n.jag[i]!) * Math.max(0, Math.min(1, f - i))
  return along < n.s + jag
}
