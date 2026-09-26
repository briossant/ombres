// Page de dev de l'audio : chaque son, chaque événement, écrans et fondus, manche factice avec
// curseur de temps (couches de la partition), mixeur par bus et par couche, vumètres,
// narrateur + sous-titres, et rendu hors ligne mesuré (sonie par section, crêtes, clics).
import { NARRATOR_LINES, lineHasColor } from '../../director/index.ts'
import { RULES } from '../../sim/rules.ts'
import type { SimEvent } from '../../sim/types.ts'
import { simEvents, subtitleEvents } from '../../host/bus.ts'
import { useSettings, type NarratorMode } from '../../host/settings.ts'
import { gameView } from '../../host/view.ts'
import { PLAYER_COLORS, colorName } from '../../shared/players.ts'
import { initAudio, playNarratorLine, playStinger, playUi, preloadAudio, setAudioPaused, setAudioScreen, type AudioScreen, type Stinger, type UiSound } from '../../host/audio/index.ts'
import { measureLoudness } from '../../host/audio/loudness.ts'
import { LAYERS, type LayerName } from '../../host/audio/music/instruments.ts'
import { SOUNDS } from '../../host/audio/sounds.ts'
import { FakeSim } from './fakesim.ts'
import { RealSim } from './realsim.ts'
import { renderRound, toWav, type RenderBus } from './offline.ts'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  n.append(...kids)
  return n
}
const btn = (label: string, fn: () => void, cls = '') => {
  const b = el('button', cls ? { class: cls } : {}, label)
  b.addEventListener('click', fn)
  return b
}
const section = (title: string, cls = '') => {
  const s = el('section', cls ? { class: cls } : {}, el('h2', {}, title))
  $('#main').append(s)
  return s
}

const sys = initAudio()
const engine = sys.engine
;(window as unknown as Record<string, unknown>).__audio = sys
// pour les scripts de vérification (mêmes instances de modules que la page)
;(window as unknown as Record<string, unknown>).__audioModules = { useSettings, subtitleEvents, playNarratorLine, setAudioScreen, NARRATOR_LINES, lineHasColor }

// ─── Chargement ─────────────────────────────────────────────────────────────
void preloadAudio(p => ($('#progress') as HTMLProgressElement).value = p).then(() => {
  ;(window as unknown as { __ready: boolean }).__ready = true
})
$('#unlock').addEventListener('click', () => void (engine.ctx as AudioContext).resume())
engine.onUnlock(() => ($('#unlock').textContent = 'Son actif'))

// ─── Manche factice (le « runner » de la page) ─────────────────────────────
/** Simulation pilotée par la page : factice (rapide, scénarisée) ou vraie (src/sim + bots). */
type DevSim = { state: FakeSim['state']; players: FakeSim['players']; timeScale: number; step(): SimEvent[] }
let fake: DevSim | null = null
let useReal = true
let playing = false
let speed = 1
let acc = 0
let T: number = RULES.roundSunSeconds

function newFake(mode: 'round' | 'lobby' | 'demo', seed = Math.floor(Math.random() * 1e6)): void {
  fake = useReal ? new RealSim({ mode, T, seed, birds: 6 }) : new FakeSim({ mode, T, seed, birds: 6 })
  gameView.sim = fake.state
  gameView.players = fake.players
  acc = 0
}

function seek(t: number): void {
  setAudioScreen('round')
  // on rejoue la simulation (même graine) sans émettre d'événements jusqu'à t
  newFake('round', fake?.state.config.seed)
  const g = fake!
  let guard = 0
  while (g.state.sun.t < t && guard++ < 200000) g.step()
}

let last = performance.now()
function loop(now: number): void {
  requestAnimationFrame(loop)
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (!fake || !playing) return
  const scale = fake.timeScale
  acc += dt * scale * speed * RULES.tickHz
  while (acc >= 1) {
    acc -= 1
    gameView.prevBirds = fake.state.birds.map(b => ({ ...b, shadow: { ...b.shadow } }))
    const evs = fake.step()
    for (const e of evs) {
      simEvents.emit(e)
      logEvent(e)
    }
  }
  gameView.alpha = acc
  gameView.timeScale = scale * speed
  gameView.realTime = now / 1000
  updateTimeline()
}
requestAnimationFrame(loop)

// ─── Écrans ────────────────────────────────────────────────────────────────
{
  const s = section('Écrans (musique, fondus, ambiance)')
  const row = el('div', { class: 'row' })
  const screens: AudioScreen[] = ['loading', 'title', 'lobby', 'intro', 'round', 'roundResults', 'gameResults', 'credits']
  const buttons: HTMLButtonElement[] = []
  for (const sc of screens) {
    const b = btn(sc, () => {
      setAudioScreen(sc)
      buttons.forEach(x => x.classList.toggle('on', x === b))
      if (sc === 'title') {
        newFake('demo')
        playing = true
      } else if (sc === 'lobby' || sc === 'intro') {
        newFake('lobby')
        playing = true
      } else if (sc === 'round') {
        newFake('round')
        playing = true
      }
    })
    buttons.push(b)
    row.append(b)
  }
  const pause = el('input', { type: 'checkbox' }) as HTMLInputElement
  pause.addEventListener('change', () => {
    setAudioPaused(pause.checked)
    playing = !pause.checked
  })
  row.append(el('label', {}, pause, 'pause'))
  s.append(row)
}

// ─── Manche : curseur de temps ─────────────────────────────────────────────
const timeline = el('input', { type: 'range', id: 'timeline', min: String(-RULES.countdownSeconds), max: String(T + 2), step: '0.1', value: '-3' }) as HTMLInputElement
const tLabel = el('span', { class: 'mono' })
function updateTimeline(): void {
  if (!fake) return
  const sun = fake.state.sun
  if (document.activeElement !== timeline) timeline.value = String(sun.t)
  const r = sys.music.roundMusic
  const map = r?.tempo
  const beat = map ? map.beatAt(Math.max(0, sun.t)) : 0
  const bar = map ? map.barOfBeat(beat) : 0
  const info = map?.info(bar)
  tLabel.textContent = `t = ${sun.t.toFixed(1).padStart(6)} s  ${sun.phase.padEnd(11)} ×${gameView.timeScale.toFixed(2)}  mesure ${bar} (${info?.section ?? '—'})  ${map ? (map.rateAt(sun.t) * 60).toFixed(1) + ' BPM' : ''}`
}
{
  const s = section('Manche factice — le temps de soleil pilote la partition')
  const row = el('div', { class: 'row' })
  row.append(
    btn('▶ manche depuis le compte à rebours', () => {
      setAudioScreen('round')
      newFake('round')
      playing = true
    }),
    btn('pause / reprise', () => (playing = !playing)),
  )
  for (const t of [0, 15, 55, 85, 95, 98, 105]) row.append(btn(`→ ${t} s`, () => (seek(t * (T / RULES.roundSunSeconds)), (playing = true))))
  const sp = el('select') as HTMLSelectElement
  for (const v of [1, 2, 4, 8]) sp.append(el('option', { value: String(v) }, `×${v}`))
  sp.addEventListener('change', () => (speed = Number(sp.value)))
  const tSel = el('select') as HTMLSelectElement
  for (const v of [80, 110, 150]) tSel.append(el('option', v === 110 ? { value: String(v), selected: '' } : { value: String(v) }, `T = ${v} s`))
  tSel.addEventListener('change', () => {
    T = Number(tSel.value)
    timeline.max = String(T + 2)
    newFake('round')
  })
  const real = el('input', { type: 'checkbox', checked: '' }) as HTMLInputElement
  real.addEventListener('change', () => (useReal = real.checked))
  row.append(el('label', {}, 'vitesse', sp), tSel, el('label', {}, real, 'vraie simulation + bots'))
  s.append(row)
  timeline.addEventListener('change', () => seek(Number(timeline.value)))
  s.append(timeline, el('div', { class: 'mono' }, tLabel))
  s.append(el('div', { class: 'row' }, btn('ralenti de touche (0,35×)', () => fake && ((fake as unknown as { slowmoLeft: number }).slowmoLeft = RULES.hitSlowmoSeconds, (fake as unknown as { lastSlowmo: number }).lastSlowmo = fake.state.time))))
}

// ─── Mixeur ────────────────────────────────────────────────────────────────
{
  const s = section('Mixeur')
  const grid = el('div', { class: 'mix' })
  const settings = useSettings.getState()
  const vol = (label: string, key: 'volMaster' | 'volMusic' | 'volSfx' | 'volVoice') => {
    const r = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(settings[key]) }) as HTMLInputElement
    const v = el('span', { class: 'v mono' }, String(settings[key]))
    r.addEventListener('input', () => {
      useSettings.getState().set(key, Number(r.value))
      v.textContent = r.value
      playUi('slider', { value: Number(r.value) })
    })
    grid.append(el('span', {}, label), r, v, el('span'), el('span'))
  }
  vol('général', 'volMaster')
  vol('musique', 'volMusic')
  vol('effets', 'volSfx')
  vol('voix', 'volVoice')
  s.append(grid, el('div', { class: 'grp' }, 'Couches de la partition (dB ajoutés, M = muet, S = solo)'))
  const lg = el('div', { class: 'mix' })
  const trims = new Map<LayerName, number>()
  const muted = new Set<LayerName>()
  let solo: LayerName | null = null
  const apply = () => {
    const r = sys.music.roundMusic
    if (!r) return
    for (const l of LAYERS) r.setLayerDb(l, muted.has(l) || (solo && solo !== l) ? -Infinity : (trims.get(l) ?? 0))
  }
  for (const l of LAYERS) {
    const r = el('input', { type: 'range', min: '-24', max: '12', step: '1', value: '0' }) as HTMLInputElement
    const v = el('span', { class: 'v mono' }, '0')
    r.addEventListener('input', () => {
      trims.set(l, Number(r.value))
      v.textContent = r.value
      apply()
    })
    const m = btn('M', () => {
      if (muted.has(l)) muted.delete(l)
      else muted.add(l)
      m.classList.toggle('on')
      apply()
    })
    const so = btn('S', () => {
      solo = solo === l ? null : l
      lg.querySelectorAll('button.solo').forEach(b => b.classList.remove('on'))
      if (solo) so.classList.add('on')
      apply()
    }, 'solo')
    lg.append(el('span', {}, l), r, v, m, so)
  }
  s.append(lg)
}

// ─── Vumètres et spectre ───────────────────────────────────────────────────
{
  const s = section('Vumètres (RMS / crête, dBFS) et spectre du master')
  const meters = el('canvas', { width: '560', height: '130' }) as HTMLCanvasElement
  const spec = el('canvas', { width: '560', height: '140' }) as HTMLCanvasElement
  s.append(meters, spec)
  const names = ['music', 'amb', 'sfx', 'ui', 'voice', 'master'] as const
  const taps = names.map(n => engine.tap(n))
  const buf = new Float32Array(4096)
  const fbuf = new Float32Array(2048)
  const peaks = names.map(() => -90)
  const draw = () => {
    requestAnimationFrame(draw)
    const g = meters.getContext('2d')!
    g.fillStyle = '#1d1417'
    g.fillRect(0, 0, meters.width, meters.height)
    names.forEach((n, i) => {
      taps[i]!.getFloatTimeDomainData(buf)
      let sum = 0, pk = 0
      for (let k = 0; k < buf.length; k++) {
        sum += buf[k]! * buf[k]!
        pk = Math.max(pk, Math.abs(buf[k]!))
      }
      const rms = 10 * Math.log10(sum / buf.length + 1e-12)
      const pdb = 20 * Math.log10(pk + 1e-12)
      peaks[i] = Math.max(pdb, peaks[i]! - 0.5)
      const y = 8 + i * 20
      const x = (db: number) => 70 + ((Math.max(-60, db) + 60) / 60) * (meters.width - 80)
      g.fillStyle = '#e8dcc4'
      g.font = '11px monospace'
      g.fillText(n, 6, y + 10)
      g.fillStyle = '#6a8f6f'
      g.fillRect(70, y, x(rms) - 70, 12)
      g.fillStyle = peaks[i]! > -1 ? '#e04030' : '#d6a44c'
      g.fillRect(x(peaks[i]!) - 2, y, 3, 12)
      g.fillStyle = '#e8dcc4'
      g.fillText(`${rms.toFixed(1)} / ${peaks[i]!.toFixed(1)}`, meters.width - 120, y + 10)
    })
    // spectre
    const a = taps[taps.length - 1]!
    a.getFloatFrequencyData(fbuf)
    const h = spec.getContext('2d')!
    h.fillStyle = '#1d1417'
    h.fillRect(0, 0, spec.width, spec.height)
    h.strokeStyle = '#d6a44c'
    h.beginPath()
    const ny = engine.ctx.sampleRate / 2
    for (let px = 0; px < spec.width; px++) {
      const f = 30 * Math.pow(ny / 30, px / spec.width)
      const bin = Math.min(fbuf.length - 1, Math.round((f / ny) * fbuf.length))
      const db = fbuf[bin]!
      const y = spec.height * (1 - (db + 110) / 100)
      if (px) h.lineTo(px, y)
      else h.moveTo(px, y)
    }
    h.stroke()
  }
  draw()
}

// ─── Sons ──────────────────────────────────────────────────────────────────
{
  const s = section('Chaque son (table sounds.ts)', 'full')
  const row = el('div', { class: 'row' })
  for (const name of Object.keys(SOUNDS)) row.append(btn(name, () => sys.sfx.play(name as keyof typeof SOUNDS, { pan: (Math.random() - 0.5) * 1.2 })))
  s.append(row)
  const ui = el('div', { class: 'row' }, el('span', { class: 'grp' }, 'Interface (playUi)'))
  const uiNames: UiSound[] = ['hover', 'click', 'confirm', 'back', 'error', 'toggle', 'open', 'close', 'slider', 'join', 'leave', 'botAdd', 'botRemove', 'ready', 'unready', 'launch', 'count', 'sun']
  for (const n of uiNames) {
    const b = btn(n, () => playUi(n, { colorIndex: Math.floor(Math.random() * 12), value: Math.random() }))
    if (n === 'hover') b.addEventListener('mouseenter', () => playUi('hover'))
    ui.append(b)
  }
  s.append(ui)
  const st = el('div', { class: 'row' }, el('span', { class: 'grp' }, 'Ponctuations (playStinger)'))
  for (const n of ['roundWin', 'gameWin', 'lastRound', 'pause', 'resume', 'rematch'] as Stinger[]) st.append(btn(n, () => playStinger(n, { colorIndex: Math.floor(Math.random() * 12) })))
  s.append(st)
  const notes = el('div', { class: 'row' }, el('span', { class: 'grp' }, 'Note de chaque couleur (rejoindre)'))
  PLAYER_COLORS.forEach((c, i) => {
    const b = btn(colorName(i, 'fr'), () => playUi('join', { colorIndex: i }))
    b.style.borderLeft = `8px solid ${c.hex}`
    notes.append(b)
  })
  s.append(notes)
}

// ─── Événements de simulation ──────────────────────────────────────────────
const eventLog = el('div', { class: 'mono', style: 'height:120px;overflow:auto;font-size:11px;background:#f0e6d2;padding:4px' })
function logEvent(e: SimEvent): void {
  if (e.type === 'paleOnStrong' || e.type === 'altitude' || e.type === 'flapReady') return
  eventLog.prepend(el('div', {}, `${(fake?.state.sun.t ?? 0).toFixed(1)} ${JSON.stringify(e)}`))
  while (eventLog.childElementCount > 60) eventLog.lastChild?.remove()
}
{
  const s = section('Événements de simulation (sur des oiseaux factices)')
  const row = el('div', { class: 'row' })
  const ensure = () => {
    if (!fake) newFake('round')
    return fake!
  }
  const fire = (make: (f: DevSim) => SimEvent[]) => () => {
    const f = ensure()
    for (const e of make(f)) {
      simEvents.emit(e)
      logEvent(e)
    }
  }
  const b = (f: DevSim, i: number) => f.state.birds[i % f.state.birds.length]!
  const evs: [string, (f: DevSim) => SimEvent[]][] = [
    ['countdown 3', () => [{ type: 'countdown', n: 3 }]],
    ['countdown 0 (Envol)', () => [{ type: 'countdown', n: 0 }]],
    ['phase afternoon', () => [{ type: 'phase', phase: 'afternoon' }]],
    ['phase greatShadow', () => [{ type: 'phase', phase: 'greatShadow' }]],
    ['tenSeconds', () => [{ type: 'tenSeconds' }]],
    ['lastSeconds 5', () => [{ type: 'lastSeconds', n: 5 }]],
    ['lastSeconds 1', () => [{ type: 'lastSeconds', n: 1 }]],
    ['night', () => [{ type: 'night' }]],
    ['altitude → bas', f => [{ type: 'altitude', slot: 0, strong: true }].map(e => (void f, e as SimEvent))],
    ['lock', () => [{ type: 'lock', hunter: 1, target: 0 }]],
    ['diveWindup', () => [{ type: 'diveWindup', hunter: 1, target: 0 }]],
    ['diveCommit (clac)', () => [{ type: 'diveCommit', hunter: 1, target: 0 }]],
    ['diveHit', f => [{ type: 'diveHit', hunter: 1, target: 0, x: b(f, 0).x, y: b(f, 0).y, z: 5, stolenCells: 500, crown: false }]],
    ['diveHit couronne', f => [{ type: 'diveHit', hunter: 1, target: 0, x: b(f, 0).x, y: b(f, 0).y, z: 5, stolenCells: 900, crown: true }]],
    ['diveMiss', f => [{ type: 'diveMiss', hunter: 1, target: 0, dodged: false, x: b(f, 1).x, y: b(f, 1).y }]],
    ['diveMiss esquive', f => [{ type: 'diveMiss', hunter: 1, target: 0, dodged: true, x: b(f, 1).x, y: b(f, 1).y }]],
    ['diveCancel feinte', () => [{ type: 'diveCancel', hunter: 1, target: 0, reason: 'feint' }]],
    ['flap', () => [{ type: 'flap', slot: 0 }]],
    ['flapReady', () => [{ type: 'flapReady', slot: 0 }]],
    ['bump', f => [{ type: 'bump', a: 0, b: 1, x: b(f, 0).x, y: b(f, 0).y, z: 10 }]],
    ['towerBump', () => [{ type: 'towerBump', slot: 2, tower: 0 }]],
    ['paleOnStrong (tsk)', f => [{ type: 'paleOnStrong', slot: 0, x: b(f, 0).x, y: b(f, 0).y }]],
    ['hidden', () => [{ type: 'hidden', slot: 0, hidden: true }]],
    ['storm', () => [{ type: 'storm', slot: 3, inside: true }]],
    ['crown', () => [{ type: 'crown', slot: 2, prev: 0 }]],
    ['bigSteal', () => [{ type: 'bigSteal', slot: 2, frac: 0.05, victim: 1 }]],
    ['territoryReset', () => [{ type: 'territoryReset' }]],
  ]
  for (const [label, make] of evs) row.append(btn(label, fire(make)))
  s.append(row, eventLog)
}

// ─── Narrateur ─────────────────────────────────────────────────────────────
{
  const s = section('Narrateur (lecture + sous-titres)')
  const lineSel = el('select') as HTMLSelectElement
  for (const l of NARRATOR_LINES) lineSel.append(el('option', { value: l.id }, `${l.id}${lineHasColor(l) ? ' {color}' : ''}`))
  const colSel = el('select') as HTMLSelectElement
  PLAYER_COLORS.forEach((_, i) => colSel.append(el('option', { value: String(i) }, colorName(i, 'fr'))))
  const langSel = el('select') as HTMLSelectElement
  for (const l of ['fr', 'en']) langSel.append(el('option', { value: l }, l))
  const modeSel = el('select') as HTMLSelectElement
  for (const m of ['voice', 'text', 'off']) modeSel.append(el('option', { value: m }, m))
  modeSel.value = useSettings.getState().narrator
  modeSel.addEventListener('change', () => useSettings.getState().set('narrator', modeSel.value as NarratorMode))
  const play = () => {
    const line = NARRATOR_LINES.find(l => l.id === lineSel.value)
    playNarratorLine({ lineId: lineSel.value, colorIndex: line && lineHasColor(line) ? Number(colSel.value) : undefined, lang: langSel.value as 'fr' | 'en' })
  }
  s.append(el('div', { class: 'row' }, lineSel, colSel, langSel, el('label', {}, 'mode', modeSel), btn('▶ dire', play), btn('au hasard', () => {
    lineSel.selectedIndex = Math.floor(Math.random() * lineSel.options.length)
    colSel.selectedIndex = Math.floor(Math.random() * 12)
    play()
  })))
  const sub = $('#subtitle')
  subtitleEvents.on(e => {
    if (e.type === 'hide') {
      if (sub.dataset.id === String(e.id)) sub.style.display = 'none'
      return
    }
    sub.dataset.id = String(e.id)
    sub.replaceChildren(...e.parts.map(p => (p.colorIndex !== undefined ? el('b', { style: `box-shadow: inset 0 -6px 0 ${PLAYER_COLORS[p.colorIndex]!.hex}` }, p.text) : p.text)))
    sub.append(el('div', { class: 'mono', style: 'font-size:10px;color:#7c6a5c' }, `${e.voiced ? 'voix' : 'texte seul'} · ${e.durationMs} ms`))
    sub.style.display = 'block'
  })
}

// ─── Rendu hors ligne ──────────────────────────────────────────────────────
{
  const s = section('Rendu hors ligne d\'une manche (mesure objective)', 'full')
  const out = el('div')
  const checks = (['music', 'amb', 'sfx'] as RenderBus[]).map(b => {
    const c = el('input', { type: 'checkbox', checked: '' }) as HTMLInputElement
    return [b, c] as const
  })
  const go = async () => {
    out.textContent = 'rendu en cours…'
    const t0 = performance.now()
    const res = await renderRound({ T, real: useReal, buses: checks.filter(([, c]) => c.checked).map(([b]) => b) })
    const dt = ((performance.now() - t0) / 1000).toFixed(1)
    const rows: HTMLElement[] = []
    const whole = measureLoudness(res.buffer)
    rows.push(el('tr', {}, el('th', {}, 'tout'), el('td', {}, whole.integrated.toFixed(1)), el('td', {}, whole.momentaryMax.toFixed(1)), el('td', {}, whole.peakDb.toFixed(2))))
    const marks = [{ name: 'countdown', at: 0 }, ...res.markers]
    marks.forEach((m, i) => {
      const end = marks[i + 1]?.at ?? res.buffer.duration
      const l = measureLoudness(res.buffer, m.at, end)
      rows.push(el('tr', {}, el('td', {}, `${m.name} (${m.at.toFixed(1)} s)`), el('td', {}, l.integrated.toFixed(1)), el('td', {}, l.momentaryMax.toFixed(1)), el('td', {}, l.peakDb.toFixed(2))))
    })
    const a = el('a', { href: URL.createObjectURL(toWav(res.buffer)), download: 'ombres-manche.wav' }, 'télécharger le WAV')
    out.replaceChildren(el('div', {}, `rendu en ${dt} s`), el('table', {}, el('tr', {}, el('th', {}, 'section'), el('th', {}, 'LUFS int.'), el('th', {}, 'LUFS mom. max'), el('th', {}, 'crête dBFS')), ...rows), a)
    return res
  }
  s.append(el('div', { class: 'row' }, ...checks.map(([b, c]) => el('label', {}, c, b)), btn('Rendre la manche', () => void go())), out)
  ;(window as unknown as Record<string, unknown>).__audioDev = { renderRound, toWav, measureLoudness }
}

// état
setInterval(() => {
  $('#status').textContent = `${(engine.ctx as AudioContext).state} · ${engine.ctx.sampleRate} Hz · latence ${(((engine.ctx as AudioContext).baseLatency ?? 0) * 1000).toFixed(0)} ms`
}, 500)
