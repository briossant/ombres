// Page de dev des bots : vue de dessus en direct avec les trajectoires récentes de chaque
// oiseau (pour lire les signatures des caractères), leur intention courante, leurs
// piqués, et un tableau par bot. Un oiseau peut être piloté au clavier.
// Paramètres d'URL : ?team=v6|all7|lord|levels|solo|duo|twelve|demo|lobby&level=1&map=parasols&seed=1
//                    &speed=1&t=85&human=1&trail=8&pause=1
// `window.__bots` expose les bots, `window.__sim` la simulation ; `window.__ready` passe à vrai.
import { createSimulation } from '../../sim/simulation.ts'
import { towerShadowHulls } from '../../sim/query.ts'
import { RULES } from '../../sim/rules.ts'
import type { BirdInput, MapId, SimConfig, SimEvent, Simulation } from '../../sim/types.ts'
import { PLAYER_COLORS } from '../../shared/players.ts'
import { BOT_PERSONALITIES, createBot, createLobbyDummy, defaultBots, demoTeam, type Bot, type BotLevel, type BotPersonality } from '../../bots/index.ts'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const params = new URLSearchParams(location.search)
const ui = {
  team: $<HTMLSelectElement>('team'),
  level: $<HTMLSelectElement>('level'),
  map: $<HTMLSelectElement>('map'),
  seed: $<HTMLInputElement>('seed'),
  trail: $<HTMLInputElement>('trail'),
  human: $<HTMLInputElement>('human'),
  speed: $<HTMLSelectElement>('speed'),
}
for (const [k, el] of Object.entries(ui)) {
  const v = params.get(k)
  if (v === null) continue
  if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = v === '1' || v === 'true'
  else el.value = v
}

const NAMES: Record<BotPersonality, string> = { falcon: 'Faucon', ploughman: 'Laboureur', magpie: 'Pie', nomad: 'Nomade', lookout: 'Guetteur', fool: 'Fou', watchmaker: 'Horloger' }
const LEVELS = ['Oisillon', 'Voyageur', 'Seigneur']
const INK = '#2b1d23'

const canvas = $<HTMLCanvasElement>('view')
const ctx = canvas.getContext('2d')!
const cells = document.createElement('canvas')
cells.width = RULES.gridCols
cells.height = RULES.gridRows
const cctx = cells.getContext('2d')!
const img = cctx.createImageData(cells.width, cells.height)
const rgb = (h: string): [number, number, number] => {
  const v = parseInt(h.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
const SAND = rgb('#F1DABE')
const OUT = rgb('#D9C2A2')
const SHADE = rgb('#A18EA1')
const COLORS = PLAYER_COLORS.map((c) => rgb(c.hex))

interface Seat {
  bot: Bot | null
  label: string
}
let sim: Simulation
let seats: Seat[] = []
let events: SimEvent[] = []
let paused = params.get('pause') === '1'
let acc = 0
let last = performance.now()
let botMs = 0
const trails: { x: number; y: number; z: number; dive: boolean }[][] = []
const log: string[] = []
const keys = new Set<string>()
const human: BirdInput = { dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)

function specsFor(team: string, level: BotLevel): { personality: BotPersonality; level: BotLevel }[] {
  switch (team) {
    case 'all7':
      return BOT_PERSONALITIES.map((personality) => ({ personality, level }))
    case 'lord':
      return [{ personality: 'falcon', level: 2 }, ...(['magpie', 'ploughman', 'nomad'] as const).map((personality) => ({ personality, level: 0 as BotLevel }))]
    case 'levels':
      return (['falcon', 'ploughman', 'magpie', 'nomad', 'lookout', 'watchmaker'] as const).map((personality, i) => ({ personality, level: Math.max(personality === 'watchmaker' ? 1 : 0, Math.floor(i / 2)) as BotLevel }))
    case 'solo':
      return defaultBots(1, level)
    case 'duo':
      return defaultBots(2, level)
    case 'twelve':
      return Array.from({ length: 12 }, (_, i) => ({ personality: BOT_PERSONALITIES[i % 7]!, level }))
    case 'demo':
      return demoTeam(6, Number(ui.seed.value) || 0)
    default:
      return BOT_PERSONALITIES.slice(0, 6).map((personality) => ({ personality, level }))
  }
}

function start(): void {
  const team = ui.team.value
  const level = Number(ui.level.value) as BotLevel
  const seed = Number(ui.seed.value) || 1
  const humanSlots = team === 'solo' ? 1 : team === 'duo' ? 2 : ui.human.checked ? 1 : 0
  const lobby = team === 'lobby'
  const specs = lobby ? [] : specsFor(team, level)
  const n = lobby ? 2 : Math.min(12, humanSlots + specs.length)
  const cfg: SimConfig = {
    mode: lobby ? 'lobby' : team === 'demo' ? 'demo' : 'round',
    seed,
    mapId: (lobby ? 'lobby' : ui.map.value) as MapId,
    birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })),
    sunSeconds: team === 'demo' ? RULES.titleDemoSunSeconds : RULES.roundSunSeconds,
    countdown: !lobby && team !== 'demo',
  }
  sim = createSimulation(cfg)
  seats = []
  for (let slot = 0; slot < n; slot++) {
    if (lobby) {
      seats.push(slot === 1 ? { bot: createLobbyDummy(1), label: 'mannequin' } : { bot: null, label: 'clavier' })
      continue
    }
    if (slot < humanSlots) {
      // un seul clavier : les autres « humains » restent des oiseaux neutres
      seats.push({ bot: null, label: slot === 0 ? 'clavier' : 'humain (immobile)' })
      continue
    }
    const s = specs[slot - humanSlots]!
    const bot = createBot({ slot, personality: s.personality, level: s.level, seed: seed * 97 + slot })
    seats.push({ bot, label: `${NAMES[s.personality]} · ${LEVELS[bot.level]}` })
  }
  trails.length = 0
  for (let i = 0; i < n; i++) trails.push([])
  events = []
  log.length = 0
  const w = window as unknown as { __sim: Simulation; __bots: Seat[] }
  w.__sim = sim
  w.__bots = seats
  // saut dans le temps
  const tJump = Number(params.get('t') ?? 0)
  if (tJump > 0) while (sim.state.sun.t < tJump && !sim.state.over) tick()
}

function readKeyboard(): BirdInput {
  let x = 0
  let y = 0
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
  const l = Math.hypot(x, y) || 1
  human.dirX = x / l
  human.dirY = y / l
  human.dive = keys.has('Space')
  return human
}

function tick(): void {
  const st = sim.state
  const t0 = performance.now()
  for (let s = 0; s < seats.length; s++) {
    const seat = seats[s]!
    inputs[s] = seat.bot ? seat.bot.think(st, events) : s === 0 && seat.label === 'clavier' ? readKeyboard() : undefined
  }
  botMs = botMs * 0.95 + (performance.now() - t0) * 0.05
  events = sim.step(inputs)
  const keep = Math.max(1, Math.round(Number(ui.trail.value) * RULES.tickHz))
  for (const b of st.birds) {
    const tr = trails[b.slot]
    if (!tr) continue
    tr.push({ x: b.x, y: b.y, z: b.z, dive: b.dive !== 'none' })
    if (tr.length > keep) tr.splice(0, tr.length - keep)
  }
  for (const e of events) {
    if (e.type === 'territoryReset') for (const tr of trails) tr.length = 0
    const who = (s: number) => seats[s]?.label ?? String(s)
    let line = ''
    if (e.type === 'diveWindup') line = `${who(e.hunter)} prend son élan sur ${who(e.target)}`
    else if (e.type === 'diveHit') line = `TOUCHE : ${who(e.hunter)} → ${who(e.target)} (+${e.stolenCells} cellules)`
    else if (e.type === 'diveMiss') line = `${e.dodged ? 'ESQUIVE' : 'raté'} : ${who(e.hunter)} plante (${who(e.target)})`
    else if (e.type === 'diveCancel') line = `${who(e.hunter)} annule (${e.reason})`
    else if (e.type === 'crown') line = `couronne → ${e.slot >= 0 ? who(e.slot) : 'personne'}`
    else if (e.type === 'phase') line = `— ${e.phase} —`
    if (line) log.unshift(`${st.sun.t.toFixed(1).padStart(5)} ${line}`)
  }
  if (log.length > 80) log.length = 80
}

function draw(): void {
  const st = sim.state
  const g = st.grid
  const d = img.data
  for (let j = 0; j < g.rows; j++) {
    for (let i = 0; i < g.cols; i++) {
      const k = j * g.cols + i
      const p = ((g.rows - 1 - j) * g.cols + i) * 4
      let c: [number, number, number] = g.inArena[k] ? SAND : OUT
      const o = g.owner[k]!
      if (o > 0) {
        const pc = COLORS[(o - 1) % 12]!
        const f = g.level[k] === RULES.levelStrong ? 0.85 : 0.4
        c = [SAND[0] + (pc[0] - SAND[0]) * f, SAND[1] + (pc[1] - SAND[1]) * f, SAND[2] + (pc[2] - SAND[2]) * f]
      }
      if (g.frozen[k]) c = [c[0] * 0.6 + SHADE[0] * 0.4, c[1] * 0.6 + SHADE[1] * 0.4, c[2] * 0.6 + SHADE[2] * 0.4]
      d[p] = c[0]
      d[p + 1] = c[1]
      d[p + 2] = c[2]
      d[p + 3] = 255
    }
  }
  cctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(cells, 0, 0, canvas.width, canvas.height)
  const sx = canvas.width / (g.cols * g.cellW)
  const sy = canvas.height / (g.rows * g.cellH)
  const P = (x: number, y: number): [number, number] => [(x - g.x0) * sx, canvas.height - (y - g.y0) * sy]
  // arène
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(canvas.width / 2, canvas.height / 2, st.arena.a * sx, st.arena.b * sy, 0, 0, Math.PI * 2)
  ctx.stroke()
  // fûts et ombres (contours légers)
  ctx.globalAlpha = 0.25
  for (const h of towerShadowHulls(st)) {
    const [x0, y0] = P(h.c1x, h.c1y)
    ctx.beginPath()
    ctx.arc(x0, y0, h.r1 * sx, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = INK
  for (const t of st.towers) {
    const [x, y] = P(t.x, t.y)
    ctx.beginPath()
    ctx.arc(x, y, Math.max(2, t.trunkRadius * sx), 0, Math.PI * 2)
    ctx.fill()
  }
  // trajectoires : épaisses au ras du sable, rouges en piqué
  for (const b of st.birds) {
    const tr = trails[b.slot]
    if (!tr || tr.length < 2) continue
    const col = PLAYER_COLORS[b.slot % 12]!.hex
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1]!
      const c = tr[i]!
      const [x0, y0] = P(a.x, a.y)
      const [x1, y1] = P(c.x, c.y)
      ctx.globalAlpha = 0.25 + 0.75 * (i / tr.length)
      ctx.strokeStyle = c.dive ? '#C0282D' : c.z <= RULES.strongMaxAlt ? INK : col
      ctx.lineWidth = c.z <= RULES.strongMaxAlt ? 3 : 2
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  // oiseaux, ombres, intentions
  ctx.font = '12px ui-monospace, monospace'
  for (const b of st.birds) {
    const seat = seats[b.slot]
    const col = PLAYER_COLORS[b.slot % 12]!.hex
    const [bx, by] = P(b.x, b.y)
    const [fx, fy] = P(b.shadow.cx, b.shadow.cy)
    ctx.strokeStyle = col
    ctx.lineWidth = b.strong ? 2.5 : 1.5
    ctx.setLineDash(b.strong ? [] : [4, 3])
    const ang = Math.atan2(-st.sun.shadowDirY, st.sun.shadowDirX)
    ctx.beginPath()
    ctx.ellipse(fx, fy, b.shadow.rAlong * sx, b.shadow.r * sy, ang, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    const bot = seat?.bot
    const it = bot?.intent
    if (it && Number.isFinite(it.x)) {
      const [ix, iy] = P(it.x, it.y)
      ctx.strokeStyle = col
      ctx.globalAlpha = 0.6
      ctx.setLineDash([2, 4])
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(ix, iy)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
    if (b.lockTarget >= 0) {
      const t = st.bySlot[b.lockTarget]
      if (t) {
        const [tx, ty] = P(t.x, t.y)
        ctx.strokeStyle = b.dive !== 'none' ? '#C0282D' : col
        ctx.lineWidth = b.dive === 'committed' ? 3 : 1
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(tx, ty)
        ctx.stroke()
      }
    }
    const r = 4 + (b.z / RULES.altHigh) * 4
    ctx.fillStyle = b.stun > 0 ? '#999' : col
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(bx, by, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx + Math.cos(b.heading) * (r + 8), by - Math.sin(b.heading) * (r + 8))
    ctx.stroke()
    if (b.crown) {
      ctx.fillStyle = '#FFF2C3'
      ctx.fillRect(bx - 5, by - r - 10, 10, 5)
    }
    const text = `${seat?.label ?? b.slot}${it ? ' · ' + (it.blunder ? 'erreur:' + it.blunder : it.kind) : ''}`
    ctx.fillStyle = 'rgba(247,240,227,0.8)'
    const w = ctx.measureText(text).width
    ctx.fillRect(bx + 9, by - 21, w + 6, 15)
    ctx.fillStyle = INK
    ctx.fillText(text, bx + 12, by - 10)
  }
  // panneaux
  const s = st.sun
  $('sun').textContent = `t = ${s.t.toFixed(1)} / ${s.T} s   ${s.phase}   élévation ${((s.elevation * 180) / Math.PI).toFixed(1)}°\nbots ${botMs.toFixed(3)} ms / tick   neutre ${((100 * g.counts[0]!) / g.arenaCells).toFixed(1)} %`
  const rows = st.birds
    .map((b) => {
      const seat = seats[b.slot]
      const stt = st.stats[b.slot]
      const share = (100 * g.counts[b.slot + 1]!) / g.arenaCells
      const it = seat?.bot?.intent
      return `<tr><td><span class="sw" style="background:${PLAYER_COLORS[b.slot % 12]!.hex}"></span>${seat?.label ?? b.slot}</td><td>${it ? (it.blunder ? '⚠ ' + it.blunder : it.kind) : ''}</td><td class="num">${share.toFixed(1)}%</td><td class="num">${stt ? `${stt.hits}/${stt.divesStarted}` : ''}</td><td class="num">${stt ? stt.gotHit : ''}</td></tr>`
    })
    .join('')
  $('bots').innerHTML = `<tr><th>oiseau</th><th>intention</th><th class="num">part</th><th class="num">tou/piq</th><th class="num">subi</th></tr>${rows}`
  $('log').textContent = log.join('\n')
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (!paused) {
    acc += dt * Number(ui.speed.value) * (sim.state.timeScaleHint || 1)
    let steps = 0
    while (acc >= 1 / RULES.tickHz && steps < 40) {
      acc -= 1 / RULES.tickHz
      steps++
      if (!sim.state.over) tick()
    }
  }
  draw()
  ;(window as unknown as { __ready: boolean }).__ready = true
  requestAnimationFrame(frame)
}

addEventListener('keydown', (e) => {
  keys.add(e.code)
  if (e.code === 'Space') {
    if (!e.repeat) human.divePresses++
    e.preventDefault()
  }
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) human.flapPresses++
})
addEventListener('keyup', (e) => keys.delete(e.code))
$('restart').addEventListener('click', () => start())
$('pause').addEventListener('click', () => (paused = !paused))
for (const el of [ui.team, ui.level, ui.map, ui.seed, ui.human]) el.addEventListener('change', () => start())
start()
requestAnimationFrame(frame)
