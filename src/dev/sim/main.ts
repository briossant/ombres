// Page de dev de la simulation : vue de dessus en direct (territoire, ombres de tours,
// empreintes, chevrons, nuit), bots scriptés, un oiseau au clavier, journal d'événements.
// Paramètres d'URL : ?mode=round|lobby|demo&map=parasols&n=6&seed=1&pol=mix&speed=1&t=85&human=0&hulls=1&mirror=1
// `window.__sim` expose la simulation ; `window.__ready` passe à vrai après la première image.
import { createSimulation } from '../../sim/simulation.ts'
import { makePolicy, type Policy, type PolicyName } from '../../sim/harness.ts'
import { towerShadowHulls, isNightAt } from '../../sim/query.ts'
import { RULES } from '../../sim/rules.ts'
import type { BirdInput, MapId, SimEvent, SimMode, Simulation } from '../../sim/types.ts'
import { PLAYER_COLORS } from '../../shared/players.ts'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const params = new URLSearchParams(location.search)
const ui = {
  mode: $<HTMLSelectElement>('mode'),
  map: $<HTMLSelectElement>('map'),
  mirror: $<HTMLInputElement>('mirror'),
  n: $<HTMLInputElement>('n'),
  pol: $<HTMLSelectElement>('pol'),
  seed: $<HTMLInputElement>('seed'),
  human: $<HTMLInputElement>('human'),
  speed: $<HTMLSelectElement>('speed'),
  hulls: $<HTMLInputElement>('hulls'),
}
for (const [k, el] of Object.entries(ui)) {
  const v = params.get(k)
  if (v === null) continue
  if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = v === '1' || v === 'true'
  else el.value = v
}

const canvas = $<HTMLCanvasElement>('view')
const ctx = canvas.getContext('2d')!
const cells = document.createElement('canvas')
cells.width = RULES.gridCols
cells.height = RULES.gridRows
const cctx = cells.getContext('2d')!
const img = cctx.createImageData(cells.width, cells.height)

const hexRgb = (h: string): [number, number, number] => {
  const v = parseInt(h.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
const SAND = hexRgb('#F1DABE')
const OUT = hexRgb('#D9C2A2')
const SHADE = hexRgb('#A18EA1')
const NIGHT = hexRgb('#575568')
const COLORS = PLAYER_COLORS.map((c) => hexRgb(c.hex))

let sim: Simulation
let policies: (Policy | undefined)[] = []
let paused = false
let acc = 0
let last = performance.now()
let msTick = 0
const log: string[] = []
const keys = new Set<string>()
const human: BirdInput = { dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }

function start(): void {
  const mode = ui.mode.value as SimMode
  const n = Math.max(1, Math.min(12, Number(ui.n.value) || 6))
  const mapId = (mode === 'lobby' ? 'lobby' : ui.map.value) as MapId
  const seed = Number(ui.seed.value) || 1
  sim = createSimulation({
    mode,
    seed,
    mapId,
    mirror: ui.mirror.checked,
    birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })),
    sunSeconds: mode === 'demo' ? RULES.titleDemoSunSeconds : RULES.roundSunSeconds,
    countdown: mode === 'round',
  })
  const mix = ui.pol.value
  policies = Array.from({ length: n }, (_, i) => {
    const name: PolicyName = mix === 'mix' ? (i % 4 === 3 ? 'hunter' : 'mixed') : (mix as PolicyName)
    return makePolicy(name, i, seed * 101 + i)
  })
  log.length = 0
  ;(window as unknown as { __sim: Simulation }).__sim = sim
  const ff = Number(params.get('t') ?? 0)
  if (ff > 0) {
    while (sim.state.sun.t < ff && !sim.state.over) tick()
    params.delete('t')
  }
}

function humanInput(): BirdInput {
  let x = 0
  let y = 0
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1
  const len = Math.hypot(x, y) || 1
  human.dirX = x / len
  human.dirY = y / len
  human.dive = keys.has('Space')
  return human
}

function tick(): void {
  const st = sim.state
  const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
  for (const b of st.birds) inputs[b.slot] = b.slot === 0 && ui.human.checked ? humanInput() : policies[b.slot]?.(st, b.slot)
  const t0 = performance.now()
  const events = sim.step(inputs)
  msTick = msTick * 0.95 + (performance.now() - t0) * 0.05
  for (const e of events) if (e.type !== 'altitude' && e.type !== 'flapReady') log.push(`${st.sun.t.toFixed(2).padStart(7)}  ${describe(e)}`)
  if (log.length > 200) log.splice(0, log.length - 200)
}

function describe(e: SimEvent): string {
  const rest = Object.entries(e)
    .filter(([k]) => k !== 'type')
    .map(([k, v]) => `${k}=${typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : String(v)}`)
    .join(' ')
  return `${e.type} ${rest}`
}

function draw(): void {
  const st = sim.state
  const g = st.grid
  const d = img.data
  // cellules : ligne 0 = sud → bas de l'image
  for (let j = 0; j < g.rows; j++) {
    const row = (g.rows - 1 - j) * g.cols
    for (let i = 0; i < g.cols; i++) {
      const k = j * g.cols + i
      let c = g.inArena[k] ? SAND : OUT
      let r = c[0]
      let gg = c[1]
      let b = c[2]
      const o = g.owner[k]!
      if (o > 0) {
        c = COLORS[(o - 1) % 12]!
        const t = g.level[k] === RULES.levelStrong ? 0.85 : RULES.palePaintAlpha
        r += (c[0] - r) * t
        gg += (c[1] - gg) * t
        b += (c[2] - b) * t
      }
      if (g.frozen[k]) {
        const night = st.night.active && isNightAt(st.night, g.x0 + (i + 0.5) * g.cellW, g.y0 + (j + 0.5) * g.cellH)
        const s = night ? NIGHT : SHADE
        const t = night ? 0.55 : 0.45
        r += (s[0] - r) * t
        gg += (s[1] - gg) * t
        b += (s[2] - b) * t
      }
      const p = (row + i) * 4
      d[p] = r
      d[p + 1] = gg
      d[p + 2] = b
      d[p + 3] = 255
    }
  }
  cctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(cells, 0, 0, canvas.width, canvas.height)
  const sx = canvas.width / (2 * st.arena.a)
  const sy = canvas.height / (2 * st.arena.b)
  const P = (x: number, y: number): [number, number] => [(x + st.arena.a) * sx, (st.arena.b - y) * sy]
  // arène et Simoun
  ctx.strokeStyle = 'rgba(43,29,35,0.7)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(canvas.width / 2, canvas.height / 2, st.arena.a * sx, st.arena.b * sy, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([6, 6])
  ctx.strokeStyle = 'rgba(43,29,35,0.35)'
  ctx.beginPath()
  ctx.ellipse(canvas.width / 2, canvas.height / 2, st.arena.a * st.arena.stormFrom * sx, st.arena.b * st.arena.stormFrom * sy, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  if (ui.hulls.checked) {
    ctx.strokeStyle = 'rgba(43,29,35,0.3)'
    ctx.lineWidth = 1
    for (const h of towerShadowHulls(st)) {
      for (const [cx, cy, r] of [
        [h.c0x, h.c0y, h.r0],
        [h.c1x, h.c1y, h.r1],
      ] as const) {
        const [px, py] = P(cx, cy)
        ctx.beginPath()
        ctx.ellipse(px, py, Math.max(0.5, r * sx), Math.max(0.5, r * sy), 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }
  // tours
  for (const t of st.towers) {
    const [px, py] = P(t.x, t.y)
    ctx.fillStyle = '#2b1d23'
    ctx.beginPath()
    ctx.ellipse(px, py, t.trunkRadius * sx, t.trunkRadius * sy, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // oiseaux
  const dx = st.sun.shadowDirX
  const dy = st.sun.shadowDirY
  const ang = -Math.atan2(dy, dx)
  for (const b of st.birds) {
    const col = PLAYER_COLORS[b.slot % 12]!.hex
    const fp = b.shadow
    const [fx, fy] = P(fp.cx, fp.cy)
    ctx.save()
    ctx.translate(fx, fy)
    ctx.rotate(ang)
    ctx.strokeStyle = col
    ctx.lineWidth = 2
    ctx.setLineDash(fp.strong ? [] : [5, 4])
    ctx.globalAlpha = b.stun > 0 ? 0.35 : 0.95
    ctx.beginPath()
    ctx.ellipse(0, 0, fp.rAlong * sx, fp.r * sy, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    const [bx, by] = P(b.x, b.y)
    if (Math.hypot(fx - bx, fy - by) > 10) {
      ctx.strokeStyle = 'rgba(43,29,35,0.5)'
      ctx.setLineDash([2, 4])
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(fx, fy)
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (b.lockTarget >= 0) {
      const t = st.bySlot[b.lockTarget]
      if (t) {
        const [tx, ty] = P(t.x, t.y)
        ctx.strokeStyle = b.dive === 'none' ? col : '#c0282d'
        ctx.lineWidth = b.dive === 'committed' ? 3 : 1.5
        ctx.setLineDash(b.dive === 'none' ? [4, 4] : [])
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
    const r = 4 + (b.z / RULES.altHigh) * 5
    ctx.fillStyle = b.stun > 0 ? '#999' : col
    ctx.strokeStyle = '#2b1d23'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(bx, by, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx + Math.cos(b.heading) * (r + 9), by - Math.sin(b.heading) * (r + 9))
    ctx.stroke()
    if (b.crown) {
      ctx.fillStyle = '#FFF2C3'
      ctx.beginPath()
      ctx.arc(bx, by - r - 7, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    if (b.hidden || b.inNight || b.immune > 0) {
      ctx.strokeStyle = b.immune > 0 ? '#fff' : '#2b1d23'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(bx, by, r + 6, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (b.flap > 0) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(bx - (b.flapDirX ?? 0) * 18, by + (b.flapDirY ?? 0) * 18)
      ctx.stroke()
    }
  }
  panels()
}

function panels(): void {
  const st = sim.state
  const s = st.sun
  $('sun').textContent =
    `${st.config.mode} · ${s.phase}  t ${s.t.toFixed(1)} / ${s.T}  u ${s.u.toFixed(2)}\n` +
    `e ${((s.elevation * 180) / Math.PI).toFixed(1)}°  az ${((s.azimuth * 180) / Math.PI).toFixed(0)}°  S ${s.stretch.toFixed(2)}  palette ${s.paletteElevDeg.toFixed(1)}°` +
    (st.night.active ? `\nnuit : front ${st.night.s.toFixed(0)} m` : '') +
    (st.timeScaleHint !== 1 ? `  ×${st.timeScaleHint}` : '')
  $('sun').style.whiteSpace = 'pre'
  const g = st.grid
  const bar = $('bar')
  const order = [...st.birds].sort((p, q) => g.counts[q.slot + 1]! - g.counts[p.slot + 1]!)
  bar.innerHTML = order.map((b) => `<div title="${PLAYER_COLORS[b.slot]!.name.fr}" style="width:${(100 * g.counts[b.slot + 1]!) / g.arenaCells}%;background:${PLAYER_COLORS[b.slot]!.hex}"></div>`).join('')
  $('perf').textContent = `step() ${msTick.toFixed(3)} ms · tick ${st.tick} · version ${g.version}`
  $('birds').innerHTML =
    '<tr><th>oiseau</th><th>%</th><th>z</th><th>v</th><th>état</th><th>T/R/E</th></tr>' +
    st.birds
      .map((b) => {
        const stt = st.stats[b.slot]
        const state = [b.dive !== 'none' ? b.dive : '', b.stun > 0 ? `stun ${b.stunKind}` : '', b.immune > 0 ? 'imm' : '', b.hidden ? 'caché' : '', b.inNight ? 'nuit' : '', b.inStorm ? 'Simoun' : '', b.lockTarget >= 0 ? `→${b.lockTarget}` : ''].filter(Boolean).join(' ')
        return `<tr><td><span class="sw" style="background:${PLAYER_COLORS[b.slot]!.hex}"></span>${b.slot}${b.crown ? ' ♛' : ''}</td><td>${((100 * g.counts[b.slot + 1]!) / g.arenaCells).toFixed(1)}</td><td>${b.z.toFixed(0)}</td><td>${b.speed.toFixed(0)}</td><td>${state}</td><td>${stt ? `${stt.hits}/${stt.gotHit}/${stt.dodges}` : ''}</td></tr>`
      })
      .join('')
  const logEl = $('log')
  logEl.textContent = log.slice(-60).join('\n')
  logEl.scrollTop = logEl.scrollHeight
}

function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000)
  last = now
  if (!paused) {
    acc += dt * Number(ui.speed.value) * (sim.state.timeScaleHint || 1)
    const step = 1 / RULES.tickHz
    let n = 0
    while (acc >= step && n < 64) {
      tick()
      acc -= step
      n++
    }
  }
  draw()
  ;(window as unknown as { __ready: boolean }).__ready = true
  requestAnimationFrame(frame)
}

addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
  if (e.code === 'Space' && !keys.has('Space')) human.divePresses++
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !keys.has(e.code)) human.flapPresses++
  if (e.code === 'KeyP') paused = !paused
  keys.add(e.code)
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
})
addEventListener('keyup', (e) => keys.delete(e.code))
$('restart').addEventListener('click', start)
$('pause').addEventListener('click', () => {
  paused = !paused
  $('pause').classList.toggle('on', paused)
})
$('stepBtn').addEventListener('click', () => {
  tick()
  draw()
})
for (const id of ['mode', 'map', 'mirror', 'n', 'pol', 'seed'] as const) ui[id].addEventListener('change', start)

start()
requestAnimationFrame(frame)
