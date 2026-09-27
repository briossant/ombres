// Découpage de la bande-annonce (plan par plan) et bande-son. Toutes les images viennent du jeu tourné par
// session.mjs (journaux *.json à côté des clips) ; la musique est la partition générative du jeu pour CETTE
// manche (audio-render.mjs --noslow), coupée sur les temps forts : midi (4 mesures) → heure dorée (4) →
// couchant (4) → Grande Ombre jusqu'à la nuit (continue, synchrone avec l'image) → gong → résultats.
// Voir docs/launch/trailer.md.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { CLIPS, WORK, ROOT } from './lib/stage.mjs'

const FPS = 60
const J = f => JSON.parse(readFileSync(f, 'utf8'))
const SFX = f => join(ROOT, 'public/audio/sfx', `${f}.ogg`)
const VOICE = id => join(ROOT, 'public/audio/narrator/en', `${id}.mp3`)
const MUSIC = f => join(ROOT, 'public/audio/music', `${f}.ogg`)

/** Plans de la démo du titre (images de title-demo.mp4), à revoir après chaque tournage (planche). */
export const TITLE_SHOTS = JSON.parse(readFileSync(join(import.meta.dirname, 'title-shots.json'), 'utf8'))

export function buildEdl(variant = 'A') {
  const round = J(join(CLIPS, 'round.json'))
  const results = J(join(CLIPS, 'results.json'))
  const phonejoin = J(join(CLIPS, 'phonejoin.json'))
  const seed = Number(process.env.TRAILER_SEED ?? 227)
  const audioC = J(join(WORK, 'audio', `round${seed}c.json`))
  const T = TITLE_SHOTS

  // ─── correspondances ───
  const frames = round.frames // [image, soleil, instant réel, ralenti]
  const atSun = t => frames.find(f => f[1] >= t - 1e-6)[0]
  const evFrame = (type, pred = () => true) => {
    // événement de la sim → image du clip de la manche (compteur vclock décalé)
    const e0 = round.events.find(e => e.type === 'countdown')
    const off = e0.f - frames.find(f => f[1] >= e0.t - 1e-6)[0]
    const e = round.events.find(x => x.type === type && pred(x))
    return e.f - off
  }
  // rendu audio sans ralenti : instant réel d'un instant de soleil
  const tl = audioC.timeline
  const realC = sun => {
    for (let i = 1; i < tl.length; i++) if (tl[i][1] >= sun) {
      const [r0, s0] = tl[i - 1]
      const [r1, s1] = tl[i]
      return s1 > s0 ? r0 + ((r1 - r0) * (sun - s0)) / (s1 - s0) : r0
    }
    return tl.at(-1)[0]
  }
  const BAR = 98 / 34 // mesure de la partition (temps de soleil) : la Grande Ombre tombe sur la 34e
  const bar = k => realC(k * BAR)
  const gsReal = realC(98)
  const nightReal = audioC.nightReal

  // ─── sections musicales (secondes de bande-annonce) ───
  const S = { A: 0, B: 4 * BAR, C: 8 * BAR, GS: 12 * BAR }
  S.night = S.GS + (nightReal - gsReal)
  const F = s => Math.round(s * FPS)

  const plans = []
  const cursor = () => plans.reduce((a, p) => a + p.pieces.reduce((b, x) => b + x.n, 0), 0)
  const add = p => {
    p.start = cursor() / FPS
    plans.push(p)
    return p
  }
  const until = (frame, name, mk) => {
    const n = frame - cursor()
    if (n <= 0) throw new Error(`plan ${name} : durée ${n}`)
    return add(mk(n))
  }

  // ═══ A · midi (4 mesures) ═══
  add({ name: 'ouverture — oiseau au ras du désert (démo du titre)', pieces: [{ clip: 'title-demo', from: T.open, n: 259 }], fadeIn: { d: 0.7 }, cards: [{ id: 'recit-noon', at: 0.55 }] })
  // compte à rebours de la manche : « 1 », « ENVOL ! », les oiseaux partent
  const takeoff = add({ name: 'compte à rebours, « Take off! » (manche, HUD)', pieces: [{ clip: 'round', from: T.countdown, n: 173 }] })
  const paint = until(F(S.B), 'peinture', n => ({
    name: 'l’ombre peint : plongée (démo) puis la manche',
    pieces: [
      { clip: 'title-demo', from: T.paint1, n: T.paint1n },
      { clip: 'round', from: T.roundPaint, n: n - T.paint1n },
    ],
    cards: [{ id: 'cap-paint', at: 0.15 }],
  }))

  // ═══ B · heure dorée (4 mesures) ═══
  const p4from = atSun(16)
  const ph = round.phoneFrames.find(f => f[1] >= p4from)
  const p4 = add({
    name: 'la manette : Léa joue, son oiseau vole (manche, HUD)',
    pieces: [{ clip: 'round', from: p4from, n: 259 }],
    phones: [{ clip: 'phone-round', from: ph[0], n: Math.ceil(259 / 2) + 1, x: 1108, y: 630, at: 0.25 }],
    cards: [{ id: 'cap-phone', at: 0.35 }],
  })
  const tl0 = atSun(45)
  const lapse = add({ name: 'le soleil baisse, les ombres s’allongent (accéléré × 8)', pieces: [{ clip: 'round', from: tl0, n: 273, step: 8 }], cards: [{ id: 'recit-golden', at: 0.3 }] })
  until(F(S.C), 'plongée dorée', n => ({ name: 'heure dorée, plongée sur un oiseau (démo)', pieces: [{ clip: 'title-demo', from: T.golden, n }] }))

  // ═══ C · couchant (4 mesures) : le piqué ═══
  const slow0 = frames.find(f => f[3] === 1)[0]
  const hit = evFrame('diveHit', e => e.t > 82 && e.t < 84)
  const commit = evFrame('diveCommit', e => e.t > 82 && e.t < 84)
  const hi = round.hires
  /**
   * Le piqué : approche à vitesse normale, rampe (× 4 → × 2 → ralenti), ralenti × 4 jusqu'après le punch-in ;
   * morceaux pris dans le clip 4K s'il existe ; recadrage du monteur qui suit Léa et Sam (positions écran
   * journalisées, lissées) avec un zoom qui monte jusqu'à la touche.
   */
  const makeDive = (name, approach, ramp4, ramp2, total) => {
    const s1from = slow0 + ramp4 * 4 + ramp2 * 2
    const plan = {
      name,
      pieces: [
        { clip: 'round', from: slow0 - approach, n: approach },
        { clip: 'round', from: slow0, n: ramp4, step: 4 },
        { clip: 'round', from: slow0 + ramp4 * 4, n: ramp2, step: 2 },
        { clip: 'round', from: s1from, n: total - approach - ramp4 - ramp2 },
      ],
      cards: [],
    }
    if (hi) for (const pc of plan.pieces) {
      const last = pc.from + pc.n * (pc.step ?? 1)
      if (pc.from >= hi.from && last <= hi.from + hi.n) Object.assign(pc, { clip: 'round-4k', from: pc.from - hi.from, src4k: true })
    }
    const hitOut = approach + ramp4 + ramp2 + (hit - s1from)
    const commitOut = approach + ramp4 + ramp2 + (commit - s1from)
    const srcOf = o => {
      let k = o
      for (const pc of plan.pieces) {
        const base = pc.src4k ? pc.from + hi.from : pc.from
        if (k < pc.n) return base + k * (pc.step ?? 1)
        k -= pc.n
      }
      return frames.length - 1
    }
    const t1 = approach / FPS
    const K = [[0, 1.0], [t1 * 0.8, 1.35], [(approach + ramp4 + ramp2) / FPS, 1.65], [hitOut / FPS, 1.75], [hitOut / FPS + 1.4, 1.4], [total / FPS, 1.32]]
    const zAt = t => {
      for (let i = 1; i < K.length; i++) if (t <= K[i][0]) {
        const u = (t - K[i - 1][0]) / (K[i][0] - K[i - 1][0])
        return K[i - 1][1] + (K[i][1] - K[i - 1][1]) * u * u * (3 - 2 * u)
      }
      return K.at(-1)[1]
    }
    let cx = null
    let cy = null
    plan.zoom = []
    for (let o = 0; o < total; o++) {
      const f = frames[srcOf(o)] ?? frames.at(-1)
      let tx = 0.42
      let ty = 0.68
      if (f.length >= 8) {
        const pts = [[f[4], f[5]], [f[6], f[7]]].filter(([x, y]) => x >= 0 && y >= 0)
        if (pts.length) {
          tx = pts.reduce((a, q) => a + q[0], 0) / pts.length
          ty = pts.reduce((a, q) => a + q[1], 0) / pts.length - 0.03
        }
      }
      cx = cx === null ? tx : cx + (tx - cx) * 0.06
      cy = cy === null ? ty : cy + (ty - cy) * 0.06
      const z = zAt(o / FPS)
      const k = Math.min(1, (z - 1) / 0.35)
      if (o % 6 === 0 || o === total - 1) plan.zoom.push([+(o / FPS).toFixed(4), +z.toFixed(4), +(0.5 + (cx - 0.5) * k).toFixed(4), +(0.5 + (cy - 0.5) * k).toFixed(4)])
    }
    return { plan, hitOut, commitOut }
  }
  const approach = 93
  const ramp4 = 60
  const ramp2 = 20
  const D = makeDive('le piqué de Léa sur Sam, ralenti × 4 (manche, HUD)', approach, ramp4, ramp2, F(S.C + 9.4) - F(S.C))
  const dive = add(D.plan)
  const { hitOut, commitOut } = D
  dive.cards.push({ id: 'cap-dive', at: Math.max(0.5, hitOut / FPS - 1.62) })
  const silhouette = until(F(S.GS), 'silhouette', n => ({ name: 'contre-jour du couchant (démo)', pieces: [{ clip: 'title-demo', from: T.sunset, n }] }))

  // ═══ Grande Ombre → nuit (synchrone avec la musique et les bruitages du jeu) ═══
  const gs0 = atSun(98)
  const gsN = F(S.night) - F(S.GS)
  const cut1 = 280
  const insert = 100
  add({ name: 'la Grande Ombre (manche, HUD)', pieces: [{ clip: 'round', from: gs0, n: cut1 }], cards: [{ id: 'recit-night', at: 1.0 }] })
  add({ name: 'la nuit avance sur un oiseau (démo)', pieces: [{ clip: 'title-demo', from: T.dusk, n: insert }] })
  add({ name: 'compte à rebours, la nuit fige tout (manche, HUD)', pieces: [{ clip: 'round', from: gs0 + cut1 + insert, n: gsN - cut1 - insert }] })

  // ═══ nuit → carte → podium ═══
  const nightT = cursor() / FPS
  add({ name: 'nuit, montée à la verticale, la carte', pieces: [{ clip: 'results', from: 0, n: 250 }, { clip: 'results', from: T.resultsPanel, n: 120 }], cards: [{ id: 'recit-win', at: 2.2 }] })
  const podium = add({ name: 'podium et titres', pieces: [{ clip: 'results', from: T.podium, n: 240 }] })

  // ═══ comment jouer ═══
  const howto = add({
    name: 'planche « comment jouer » : salon (QR) + manette',
    pieces: [{ clip: 'lobby', from: T.lobby, n: 420 }],
    howto: { tv: { clip: 'lobby', from: T.lobby }, phone: { clip: 'phonejoin', from: 0 }, tvRect: { x: 72, y: 276, w: 1120, h: 630 }, phoneRect: { x: 1262, y: 276, w: 586, h: 270 } },
  })

  // ═══ carton final ═══
  const fin = add({
    name: `carton final (${variant})`,
    pieces: [{ clip: 'title-demo', from: T.final, n: T.finaln }],
    cards: [{ id: variant === 'B' ? 'final-b' : 'final-a', at: 0.15 }],
    fadeOut: { d: 0.9 },
  })
  const total = cursor() / FPS
  // contrôle : chaque morceau de la démo tient dans un seul plan (coupes détectées par shots.mjs)
  const shotsFile = join(WORK, 'title-demo-shots.json')
  if (existsSync(shotsFile)) {
    const shots = J(shotsFile)
    for (const p of plans) for (const pc of p.pieces) {
      if (pc.clip !== 'title-demo') continue
      const a = pc.from
      const b = pc.from + pc.n * (pc.step ?? 1) - 1
      const sh = shots.find(x => a >= x.from && a <= x.to)
      if (!sh || b > sh.to) console.warn(`⚠ ${p.name} : démo ${a}→${b} déborde du plan ${sh ? `${sh.from}→${sh.to}` : '?'}`)
    }
  }

  // ═══ bande-son ═══
  const audio = { clips: [], duck: { music: [], fx: [] } }
  const A = c => audio.clips.push(c)
  const stem = b => join(WORK, 'audio', `round${seed}c-${b}.wav`)
  // musique : la partition de la manche, coupée sur les mesures
  A({ bus: 'music', file: stem('music'), from: bar(0), dur: S.B + 0.35, at: 0, fadeIn: 0.02, fadeOut: 0.35 })
  A({ bus: 'music', file: stem('music'), from: bar(20), dur: 4 * BAR + 0.35, at: S.B, fadeIn: 0.02, fadeOut: 0.35 })
  // couchant → Grande Ombre → nuit : d'un seul tenant ; pendant le ralenti du piqué, la musique s'étouffe
  const dive0 = dive.start + (approach + ramp4) / FPS
  const dive1 = dive.start + (hitOut + 150) / FPS
  const m3 = bar(30)
  A({ bus: 'music', file: stem('music'), from: m3, dur: dive0 - S.C + 0.15, at: S.C, fadeIn: 0.02, fadeOut: 0.15 })
  A({ bus: 'music', file: stem('music'), from: m3 + (dive0 - S.C), dur: dive1 - dive0 + 0.3, at: dive0, fadeIn: 0.15, fadeOut: 0.3, lowpass: 700, db: -3 })
  A({ bus: 'music', file: stem('music'), from: m3 + (dive1 - S.C), dur: S.night - dive1 + 14, at: dive1, fadeIn: 0.3 })
  // musique des résultats (piste du jeu), jusqu'au bout
  const resAt = nightT + 3.4
  A({ bus: 'music', file: MUSIC('results_cynicmusic_synthwave4k'), from: 43.95, dur: total - resAt, at: resAt, fadeIn: 3.0, fadeOut: 2.4, db: -4 })

  // ambiance et bruitages du jeu
  A({ bus: 'fx', file: stem('amb'), from: realC(0), dur: S.B + 0.3, at: 0, fadeIn: 1.2, fadeOut: 0.3 })
  A({ bus: 'fx', file: SFX('bird_hawk_scream_01_giant'), at: 0.25, db: -14, fadeOut: 0.5, dur: 2.2 })
  A({ bus: 'fx', file: SFX('wing_flap_heavy_01'), at: 1.1, db: -12 })
  A({ bus: 'fx', file: SFX('sand_paint_loop'), from: 0, dur: 2.0, at: paint.start, db: -20, fadeIn: 0.4, fadeOut: 0.8 })
  // compte à rebours et « Envol » : bruitages du jeu, synchrones (bâtons de bois, conque, cloche)
  A({ bus: 'fx', file: stem('sfx'), from: frames[T.countdown][2], dur: 173 / FPS, at: takeoff.start, fadeOut: 0.3 })
  A({ bus: 'fx', file: stem('sfx'), from: frames[T.roundPaint][2], dur: (paint.pieces[1].n) / FPS, at: paint.start + T.paint1n / FPS, fadeIn: 0.1, fadeOut: 0.3 })
  // la manette (manche) : bruitages synchrones
  A({ bus: 'fx', file: stem('sfx'), from: realC(16), dur: 259 / FPS, at: p4.start, fadeIn: 0.1, fadeOut: 0.2 })
  A({ bus: 'fx', file: stem('amb'), from: realC(16), dur: 4 * BAR, at: S.B, fadeIn: 0.2, fadeOut: 0.3 })
  A({ bus: 'fx', file: SFX('whoosh_pass_01'), at: lapse.start - 0.05, db: -12 })
  // le piqué : approche synchrone, puis ralenti (bruitages de la manche ralentis × 4, une octave plus bas)
  A({ bus: 'fx', file: stem('sfx'), from: realC(round.frames[slow0 - approach][1]), dur: (approach + ramp4) / FPS, at: dive.start, fadeOut: 0.25 })
  A({ bus: 'fx', file: stem('amb'), from: realC(78), dur: 4 * BAR, at: S.C, fadeIn: 0.2, fadeOut: 0.4 })
  const commitReal = realC(round.frames[commit][1])
  A({ bus: 'fx', file: stem('sfx'), from: commitReal - 0.35, dur: 1.9, at: dive.start + commitOut / FPS - 0.35 * 4, rate: 0.5, stretch: 0.5, db: 2, fadeOut: 1.2 })
  const hitT = dive.start + hitOut / FPS
  A({ bus: 'fx', file: SFX('impact_punch'), at: hitT, rate: 0.62, db: -4 })
  A({ bus: 'fx', file: SFX('impact_hit_heavy'), at: hitT + 0.02, rate: 0.7, db: -8 })
  A({ bus: 'fx', file: SFX('sub_drop'), at: hitT, db: -6 })
  A({ bus: 'fx', file: SFX('feather_burst_02'), at: hitT + 0.08, rate: 0.7, db: -10 })
  A({ bus: 'fx', file: SFX('bell_tibetan'), at: hitT + 0.25, db: -14 })
  A({ bus: 'fx', file: SFX('wing_flap_heavy_03'), at: silhouette.start + 0.2, db: -12 })
  // Grande Ombre → nuit → gong → grillons : bruitages et ambiance du jeu, synchrones
  A({ bus: 'fx', file: stem('sfx'), from: gsReal, dur: total - S.GS, at: S.GS })
  A({ bus: 'fx', file: stem('amb'), from: gsReal, dur: total - S.GS, at: S.GS, fadeOut: 3 })
  // la planche « comment jouer » arrive comme une page qu'on tourne
  A({ bus: 'fx', file: SFX('ui_page_flip_1'), at: howto.start - 0.06, db: -6 })
  // ponctuations du jeu (rendues par le moteur audio : cues.wav)
  const cuesFile = join(WORK, 'audio', 'cues.wav')
  const cues = [
    { at: podium.start + T.podiumUi / FPS, stinger: 'gameWin', colorIndex: 1 },
    { at: howto.start + 0.45, ui: 'open' },
    ...[
      [2.2, 1],
      [3.0, 3],
      [3.7, 0],
      [4.4, 2],
    ].map(([t, c]) => ({ at: howto.start + t + 0.05, ui: 'join', colorIndex: c })),
    { at: fin.start + 0.2, ui: 'launch' },
  ]
  if (existsSync(cuesFile)) A({ bus: 'fx', file: cuesFile, at: 0, db: 0 })

  // voix du narrateur (anglais) + sous-titres (cartons « recit-* »)
  const V = []
  const voice = (id, at, db = 1, duck = 0) => {
    const dur = J(join(ROOT, 'public/audio/narrator/manifest.json')).lines.find(l => l.lang === 'en' && l.id === id).duration_s
    A({ bus: 'voice', file: VOICE(id), at, db })
    V.push([at, at + dur, duck])
  }
  voice('matchOpen', 0.8)
  voice('golden2', lapse.start + 0.5)
  voice('greatShadow1', S.GS + 1.2, 2.5, -2.5) // la Grande Ombre est le passage le plus dense : voix plus haute, creux plus profond
  voice('roundWin1.1', nightT + 2.4)
  // ducking comme le jeu (musique −6 dB, bruitages −5 dB ; 80 ms / 400 ms)
  const duck = (db, list) => {
    for (const [a, b, extra] of V) {
      const g = Math.pow(10, (db + extra) / 20)
      list.push([a - 0.08, 1], [a, g], [b, g], [b + 0.4, 1])
    }
  }
  duck(-6, audio.duck.music)
  duck(-5, audio.duck.fx)

  return {
    plans, audio, cues, total, sections: S, posterAt: fin.start + 3.2, nightT,
    ctx: { T, frames, atSun, slow0, makeDive, gs0, gsN, p4from, ph, stem, realC, gsReal, bar, hit, commit },
  }
}

/**
 * Version verticale (1080 × 1920, ~25 s) : page de BD (card-vertical.mov), le jeu dans une case 4:3 (image
 * 16:9 recadrée au centre), la manette de Léa dans un téléphone, légendes ; musique : la partition du
 * couchant jusqu'à la Grande Ombre (le « boum » tombe sur le temps fort de la nuit).
 */
export function buildVertical() {
  const E = buildEdl('A')
  const { T, atSun, makeDive, gs0, gsN, p4from, ph, stem, realC, gsReal } = E.ctx
  const plans = []
  const add = p => {
    p.start = plans.reduce((a, q) => a + q.pieces.reduce((b, x) => b + x.n, 0), 0) / FPS
    plans.push(p)
    return p
  }
  add({ name: 'v · ouverture', pieces: [{ clip: 'title-demo', from: T.open, n: 180 }] })
  add({ name: 'v · envol et peinture', pieces: [{ clip: 'round', from: T.countdown + 55, n: 180 }] })
  const phonePlan = add({ name: 'v · la manette', pieces: [{ clip: 'round', from: p4from, n: 252 }] })
  add({ name: 'v · le soleil baisse', pieces: [{ clip: 'round', from: atSun(45), n: 180, step: 8 }] })
  const D = makeDive('v · le piqué', 40, 40, 20, 360)
  const dive = add(D.plan)
  const night = add({ name: 'v · compte à rebours', pieces: [{ clip: 'round', from: gs0 + gsN - 180, n: 180 }] })
  add({ name: 'v · podium', pieces: [{ clip: 'results', from: T.podium + 60, n: 192 }] })
  const total = plans.reduce((a, q) => a + q.pieces.reduce((b, x) => b + x.n, 0), 0) / FPS
  const phone = { clip: 'phone-round', from: ph[0], n: Math.ceil(252 / 2), at: phonePlan.start }
  // bande-son : le « boum » de la Grande Ombre sur le début du plan de la nuit
  const audio = { clips: [], duck: { music: [], fx: [] } }
  const A = c => audio.clips.push(c)
  const lead = night.start
  A({ bus: 'music', file: stem('music'), from: gsReal - lead, dur: total + 0.2, at: 0, fadeIn: 0.8, fadeOut: 1.4 })
  A({ bus: 'fx', file: stem('amb'), from: realC(20), dur: night.start, at: 0, fadeIn: 0.8, fadeOut: 0.5 })
  A({ bus: 'fx', file: stem('sfx'), from: gsReal, dur: total - lead, at: lead, fadeOut: 1.2 })
  const hitT = dive.start + D.hitOut / FPS
  A({ bus: 'fx', file: SFX('impact_punch'), at: hitT, rate: 0.62, db: -4 })
  A({ bus: 'fx', file: SFX('sub_drop'), at: hitT, db: -6 })
  A({ bus: 'fx', file: SFX('feather_burst_02'), at: hitT + 0.08, rate: 0.7, db: -10 })
  A({ bus: 'fx', file: SFX('bell_tibetan'), at: hitT + 0.25, db: -14 })
  return { plans, phone, audio, total }
}
