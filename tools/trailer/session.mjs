// Tournage de la bande-annonce dans le VRAI jeu (page /, ?debug) en temps virtuel, image par image.
//   nix shell nixpkgs#ffmpeg-full -c node tools/trailer/session.mjs --seed=11 [--quality=high]
//        [--takes=title,lobby,rules,round,results] [--test]
//   node tools/trailer/session.mjs --takes=phonejoin          (manette : l'arrivée d'un joueur, à part)
//
// Prises (marketing/work/clips/*.mp4, mezzanines 1080p60 H.264 4:4:4 + journal <prise>.json) :
//   title-demo[-ui]  démo de l'écran titre (vraie manche de bots, coucher accéléré), sans UI (+ 12 s avec)
//   lobby            salon : QR code, 4 téléphones émulés qui rejoignent (noms, couleurs), 2 bots
//   rules            cartes des règles
//   round            la manche entière (HUD), ralenti × 4 autour du piqué choisi, journal image → soleil
//   phone-round      manette de Léa pendant une fenêtre de la manche (joystick et PLONGER suivent son oiseau)
//   results          nuit → montée → carte et panneau → podium et titres
//   phonejoin        la manette : profil (nom tapé, couleur), salon, joystick, PLONGER (30 i/s)
// La manche est déterministe : Math.random est réensemencé avec --seed juste avant le lancement (graine de
// partie), les « téléphones » sont pilotés pendant la partie par des bots à graine (voir cast.json) ;
// tools/trailer/seeds.ts rejoue exactement la même manche en Node pour choisir la graine.
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openPage, waitFor, advance, shoot, encoder, grab, closeBrowser, sleep, setClean, CLEAN_CSS, CLIPS, ORIGIN } from './lib/stage.mjs'

const cast = JSON.parse(readFileSync(join(import.meta.dirname, 'cast.json'), 'utf8'))
const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const SEED = Number(opt.seed ?? 11)
const QUALITY = opt.quality ?? 'high'
const TEST = opt.test === 'true'
const TAKES = new Set((opt.takes ?? 'title,lobby,rules,round,results').split(','))
const HOST_TOKEN = '0b5e7a11ad0c0ffee0ddba11ca5cade5'
// --w/--h : répétition à basse définition (même cadrage : seul le rapport 16:9 compte)
const W = Number(opt.w ?? 1920)
const H = Number(opt.h ?? 1080)
const log = m => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)

const SETTINGS = {
  lang: 'en', quality: QUALITY, narrator: 'off', hints: 'never', colorblind: false,
  volMaster: 0, volMusic: 0, volSfx: 0, volVoice: 0, screenShake: true, reduceFlashes: false,
}

function roomInit(arg) {
  try {
    sessionStorage.setItem('ombres.host.room.v1', JSON.stringify(arg))
  } catch {}
}

async function openHost(room = cast.room, override = true) {
  const pc = await openPage({
    path: '/?debug=nosave',
    w: W,
    h: H,
    settings: SETTINGS,
    seed: SEED,
    // salle au code choisi (le serveur l'accepte : code valide + jeton de 32 hex)
    init: [CLEAN_CSS, [roomInit, { room, hostToken: HOST_TOKEN }]],
  })
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title' && !!window.__ombres.useLobby.getState().joinUrl, null, 120000, 'titre + salle')
  const info = await pc.evaluate(() => ({ room: window.__ombres.useLobby.getState().roomCode, url: window.__ombres.useLobby.getState().joinUrl, q: window.__ombres.useRenderQuality.getState().level }))
  log(`titre : salle ${info.room} · ${info.url} · qualité ${info.q}`)
  // la page du jeu : bots à la place des téléphones pendant la partie, pas de remplaçant ni de départ
  if (override) await pc.evaluate(async ([humans, salt]) => {
    const r = window.__ombres.runner
    const { createBot } = await import('/src/bots/index.ts')
    const hash = (a, b) => {
      let h = (a ^ 0x9e3779b9) >>> 0
      h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b) >>> 0
      h ^= h >>> 13
      h = Math.imul(h, 0xc2b2ae35) >>> 0
      return (h ^ (h >>> 16)) >>> 0
    }
    const brains = new Map()
    const proto = Object.getPrototypeOf(r)
    r.sourceFor = p => {
      if (p.kind !== 'phone') return proto.sourceFor.call(r, p)
      const h = humans.find(x => x.slot === p.slot)
      if (!h) return proto.sourceFor.call(r, p)
      const seed = r.sim?.state.config.seed ?? 1
      const key = `${seed}:${p.slot}`
      if (!brains.has(key)) brains.set(key, createBot({ slot: p.slot, personality: h.brain.personality, level: h.brain.level, seed: hash(seed, salt + p.slot) }))
      return { kind: 'bot', bot: brains.get(key) }
    }
    r.checkSubstitutes = () => {}
    r.dropStalePhones = () => {}
    r.hub.latencyGraceSeconds = () => 0
    r.botsCustomized = true
    // dernières entrées par slot (la manette de Léa les suit)
    const collect = r.router.collect.bind(r.router)
    r.router.collect = (st, ev) => {
      const out = collect(st, ev)
      window.__lastInputs = out.map(i => (i ? { dirX: i.dirX, dirY: i.dirY, dive: i.dive } : null))
      return out
    }
    // positions écran (fractions) des oiseaux de Léa et Sam : le montage recadre le piqué dessus
    // même instance de module que le jeu (Vite peut avoir ajouté ?t=… à l'URL après une modification)
    const vmUrl = performance.getEntriesByType('resource').map(e => e.name).find(n => /\/src\/host\/ui\/viewModel\.ts/.test(n)) ?? '/src/host/ui/viewModel.ts'
    const vm = await import(vmUrl)
    window.__anch = () => [0, 1].flatMap(s => {
      const a = vm.hudAnchors.birds[s]
      return a.active ? [+(a.x / innerWidth).toFixed(4), +(a.y / innerHeight).toFixed(4)] : [-1, -1]
    })
    // journal des événements de la sim : image (temps virtuel) + instant de soleil
    window.__evlog = []
    window.__ombres.simEvents.on(e => {
      if (['diveHit', 'diveCommit', 'diveMiss', 'phase', 'night', 'over', 'crown', 'bigSteal', 'countdown', 'lastSeconds'].includes(e.type))
        window.__evlog.push({ f: window.__vt.frames, vt: window.__vt.now, t: r.sim?.state.sun.t ?? null, kind: r.simKind, ...e })
    })
  }, [cast.humans, cast.brainSeedSalt])
  return pc
}

const hostState = pc => pc.evaluate(() => {
  const r = window.__ombres.runner
  const st = r.sim?.state
  return { phase: r.phase, screen: window.__ombres.useUi.getState().screen, t: st?.sun.t ?? null, sunPhase: st?.sun.phase ?? null, over: st?.over ?? null, frames: window.__vt.frames, link: window.__ombres.useUi.getState().hostLink, cam: window.__ombres.cameraCue.mode, roster: r.roster.players.map(p => [p.slot, p.kind, p.name, p.colorIndex]) }
})

// ─── Téléphones ─────────────────────────────────────────────────────────────
const tp = (id, x, y) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })
async function center(page, sel) {
  const b = await page.locator(sel).first().boundingBox()
  if (!b) throw new Error(`introuvable : ${sel}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }
}
async function openPhone(joinPath, device, vclock) {
  const page = await openPage({ path: joinPath, mobile: device, landscape: true, vclock: true, seed: SEED + 1 })
  if (vclock) await page.evaluate(() => window.__vt.setManual(true))
  const cdp = await page.context().newCDPSession(page)
  return { page, cdp }
}
async function tapAt(ph, x, y, ms = 70) {
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(9, x, y)] })
  await sleep(ms)
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
/** Un joueur rejoint : profil (nom, couleur), décollage. Le PC doit avancer pendant ce temps. */
async function joinPhone(pc, h, joinPath) {
  const ph = await openPhone(joinPath, h.device, false)
  ph.h = h
  await waitFor(ph.page, () => !!document.querySelector('.profile'), null, 30000, `profil ${h.name}`)
  await ph.page.fill('#phone-name', h.name)
  await ph.page.locator('.swatch').nth(h.color).click()
  await sleep(150)
  await ph.page.locator('.profile__go').click()
  await waitFor(ph.page, () => !!document.querySelector('.lobby-goals'), null, 30000, `salon ${h.name}`)
  return ph
}

// ─── Prises ────────────────────────────────────────────────────────────────
async function takeTitle(pc) {
  await pc.evaluate(() => window.__vt.setManual(true))
  await advance(pc, 0.5)
  const n = TEST ? 240 : Math.round(60 * (opt.titleSeconds ? Number(opt.titleSeconds) : 46))
  const shots = []
  const r = await shoot(pc, {
    name: 'title-demo',
    frames: n,
    variants: [
      { suffix: '', clean: true },
      { suffix: '-ui', clean: false, when: i => i < (TEST ? 120 : 720) },
    ],
    after: async i => {
      if (i % 15 === 0) shots.push(await pc.evaluate(() => ({ shot: window.__ombres.cameraCue.mode, t: window.__ombres.gameView.sim?.sun.t ?? null })).then(s => ({ i, ...s })))
    },
  })
  writeFileSync(join(CLIPS, 'title-demo.json'), JSON.stringify({ frames: r.frames, fps: 60, samples: shots }, null, 1))
  await setClean(pc, false)
  log(`titre : ${r.frames} images`)
}

async function takeLobby(pc, capture) {
  await pc.evaluate(() => window.__vt.setManual(true))
  await pc.evaluate(() => {
    const r = window.__ombres.runner
    r.enterLobby()
    r.botsCustomized = true
    for (const b of r.roster.bots()) r.removeBot(b.slot)
    r.setMatchSetting('rounds', 1)
    r.setMatchSetting('length', 'normal')
  })
  await advance(pc, 1.2)
  const url = new URL(await pc.evaluate(() => window.__ombres.useLobby.getState().joinUrl))
  const joinPath = `${url.pathname}${url.search}`
  const phones = []
  // arrivées échelonnées (images de la prise) ; chaque téléphone attend que le précédent ait son slot
  const JOIN_AT = [70, 150, 230, 310]
  const BOT_AT = [400, 450]
  let pending = null
  let next = 0
  const before = async i => {
    if (next < cast.humans.length && i >= JOIN_AT[next] && !pending) {
      const h = cast.humans[next++]
      pending = joinPhone(pc, h, joinPath).then(ph => {
        phones.push({ ...ph, h })
        pending = null
      })
    }
    const k = BOT_AT.indexOf(i)
    if (k >= 0) await pc.evaluate(b => window.__ombres.runner.addBot(b.personality, b.level), cast.bots[k])
  }
  const until = async i => i >= (TEST ? 520 : 640) && !pending && next >= cast.humans.length
  if (capture) {
    await shoot(pc, { name: 'lobby', before, until })
  } else {
    for (let i = 0; !(await until(i)); i++) {
      await before(i)
      await pc.evaluate(() => window.__vt.step(1000 / 60, 0))
      if (pending) await sleep(20)
    }
  }
  const s = await hostState(pc)
  log(`salon : ${JSON.stringify(s.roster)}`)
  const want = [...cast.humans.map(h => [h.slot, 'phone', h.name, h.color]), ...cast.bots.map((_, i) => [cast.humans.length + i, 'bot'])]
  for (const w of want) {
    const got = s.roster.find(p => p[0] === w[0])
    if (!got || got[1] !== w[1] || (w[2] && (got[2] !== w[2] || got[3] !== w[3]))) throw new Error(`distribution inattendue : ${JSON.stringify(s.roster)}`)
  }
  return phones
}

async function takeRules(pc, capture) {
  // graine de partie = --seed exactement : freshSeed() vaut (Math.random() × 0x7fffffff) | 0 ; pendant
  // startMatch, Math.random rend une constante (les autres tirages de ce moment, sons d'UI, s'en moquent)
  const ms = await pc.evaluate(seed => {
    const rnd = Math.random
    Math.random = () => (seed + 0.5) / 0x7fffffff
    try {
      window.__ombres.runner.startMatch()
    } finally {
      Math.random = rnd
    }
    return window.__ombres.runner.matchSeed
  }, SEED)
  if (ms !== SEED) throw new Error(`graine de partie ${ms} ≠ ${SEED}`)
  log(`partie : graine ${ms}`)
  if (capture) await shoot(pc, { name: 'rules', frames: TEST ? 120 : 330 })
  else await advance(pc, 1)
  await pc.evaluate(() => window.__ombres.runner.finishRules())
  return ms
}

/**
 * La manche : 1/60 s par image, 1/240 s (ralenti × 4) dans les fenêtres --slow=a:b,c:d (instants de soleil),
 * journal image → (soleil, instant réel). Manette de Léa (phone-round, 30 i/s) dans les fenêtres --ph=a:b,…
 */
const windows = (v, d) => (v ?? d).split(',').filter(Boolean).map(w => w.split(':').map(Number))
async function takeRound(pc, phones) {
  const SLOW = windows(opt.slow, '')
  const PH = windows(opt.ph, '14:26')
  // --hires=a:b : fenêtre tournée en 3840 × 2160 (clip round-4k.mp4, recadrage du monteur sans perte) ;
  // round.mp4 reçoit les mêmes images réduites en 1080p
  const HI = windows(opt.hires, '')
  let hiEnc = null
  let hiOn = false
  let hiStart = -1
  let hiCount = 0
  const lea = phones.find(p => p.h.slot === 0)
  const inAny = (ws, t) => ws.some(([a, b]) => t >= a && t < b)
  let sunT = -99
  let real = 0
  let phoneAcc = 0
  const frames = []
  const phoneFrames = []
  let phoneEnc = null
  let stick = null
  if (lea) await lea.page.evaluate(() => window.__vt.setManual(true))
  const dtOf = () => (inAny(SLOW, sunT) ? 1 / 240 : 1 / 60)
  let lastDt = 1 / 60
  const r = await shoot(pc, {
    name: 'round',
    size: [W, H],
    before: async () => {
      const want = inAny(HI, sunT)
      if (want !== hiOn) {
        await pc.setViewportSize(want ? { width: 3840, height: 2160 } : { width: W, height: H })
        hiOn = want
        // le canevas suit la nouvelle taille (ResizeObserver, R3F) : deux images sans avancer le temps
        await sleep(500)
        for (let k = 0; k < 2; k++) {
          await pc.evaluate(() => window.__vt.step(0.001))
          await sleep(150)
        }
      }
    },
    dt: () => (lastDt = dtOf()),
    until: async () => {
      const s = await pc.evaluate(() => ({ phase: window.__ombres.runner.phase, night: window.__evlog.some(e => e.type === 'night' && e.kind === 'round') }))
      return s.phase !== 'round' || s.night || (TEST && sunT > Number(opt.stopAt ?? 40))
    },
    after: async (i, buf) => {
      if (hiOn) {
        hiEnc ??= encoder(join(CLIPS, 'round-4k.mp4'), 60)
        if (hiStart < 0) hiStart = i
        await hiEnc.write(buf)
        hiCount++
      }
      const st = await pc.evaluate(() => [window.__ombres.runner.sim?.state.sun.t ?? -99, ...window.__anch()])
      sunT = st[0]
      real += lastDt
      frames.push([i, +sunT.toFixed(4), +real.toFixed(5), lastDt < 1 / 100 ? 1 : 0, ...st.slice(1)])
      if (!lea) return
      if (inAny(PH, sunT)) {
        phoneAcc += lastDt
        if (phoneAcc >= 1 / 30 - 1e-6) {
          phoneAcc -= 1 / 30
          phoneEnc ??= encoder(join(CLIPS, 'phone-round.mp4'), 30)
          const inp = await pc.evaluate(() => window.__lastInputs?.[0] ?? null)
          stick = await drivePhone(lea, inp, stick)
          await lea.page.evaluate(() => window.__vt.step(1000 / 30))
          await phoneEnc.write(await grab(lea.cdp))
          phoneFrames.push([phoneFrames.length, i, +sunT.toFixed(4), +real.toFixed(5)])
        }
      } else if (stick) {
        // fin de fenêtre : le pouce se lève, la manette continue d'avancer (temps de la vidéo)
        await lea.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        stick = null
      }
    },
  })
  if (phoneEnc) await phoneEnc.close()
  if (hiEnc) await hiEnc.close()
  if (hiOn) await pc.setViewportSize({ width: W, height: H })
  if (lea) {
    await lea.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {})
    await lea.page.evaluate(() => window.__vt.setManual(false)).catch(() => {})
  }
  const ev = await pc.evaluate(() => window.__evlog)
  writeFileSync(join(CLIPS, 'round.json'), JSON.stringify({ fps: 60, cols: ['image', 'soleil', 'instant réel', 'ralenti', 'Léa x', 'Léa y', 'Sam x', 'Sam y'], frames, phoneFrames, events: ev.filter(e => e.kind === 'round'), slow: SLOW, phone: PH, hires: hiStart >= 0 ? { from: hiStart, n: hiCount } : null }, null, 0))
  log(`manche : ${r.frames} images, soleil ${sunT.toFixed(1)}, ${phoneFrames.length} images de manette`)
}

/** Joystick et PLONGER de la manette de Léa suivent l'entrée de son oiseau (cap absolu, nord en haut). */
async function drivePhone(ph, inp, prev) {
  if (!prev) {
    const z = await center(ph.page, '.stick-zone')
    const d = await center(ph.page, '.act--dive')
    prev = { sx: z.b.x + z.b.width * 0.42, sy: z.b.y + z.b.height * 0.58, dx: d.x, dy: d.y, ids: [] }
    // le pouce se pose (le joystick apparaît sous lui) et ne se lève plus pendant la fenêtre
    await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, prev.sx, prev.sy)] })
    prev.ids = [1]
  }
  const R = 58
  const x = prev.sx + (inp ? inp.dirX : 0) * R
  const y = prev.sy - (inp ? inp.dirY : 0) * R
  const pts = [tp(1, x, y)]
  if (inp?.dive) pts.push(tp(2, prev.dx, prev.dy))
  const ids = pts.map(p => p.id)
  // CDP compare la liste aux points précédents : un événement par point ajouté, retiré ou déplacé
  if (ids.length > prev.ids.length) await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts })
  else if (ids.length < prev.ids.length) await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts })
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts })
  return { ...prev, ids }
}

async function takeResults(pc) {
  let mapAt = -1
  let podiumAt = -1
  let continued = false
  const r = await shoot(pc, {
    name: 'results',
    before: async i => {
      const s = await pc.evaluate(() => ({ screen: window.__ombres.useUi.getState().screen, phase: window.__ombres.runner.phase, podium: window.__ombres.cameraCue.mode === 'podium' }))
      if (mapAt < 0 && s.screen === 'roundResults') mapAt = i
      if (!continued && mapAt >= 0 && i >= mapAt + (TEST ? 120 : 330)) {
        const ok = await pc.evaluate(() => {
          const r = window.__ombres.runner
          r.nextRoundAt = Math.min(r.nextRoundAt, r.realTime)
          r.continueResults(false)
          return r.phase
        })
        continued = ok === 'matchResults'
      }
      if (podiumAt < 0 && s.podium) podiumAt = i
    },
    until: async i => (podiumAt >= 0 && i >= podiumAt + (TEST ? 240 : 720)) || i > 4000,
  })
  writeFileSync(join(CLIPS, 'results.json'), JSON.stringify({ fps: 60, frames: r.frames, mapAt, podiumAt }, null, 1))
  log(`résultats : ${r.frames} images (carte ${mapAt}, podium ${podiumAt})`)
}

/** La manette seule : arrivée d'un joueur (nom tapé lettre à lettre, couleur, décollage), salon, joystick, PLONGER. */
async function takePhoneJoin() {
  const pc = await openHost('SAND', false)
  const url = new URL(await pc.evaluate(() => window.__ombres.useLobby.getState().joinUrl))
  const h = cast.humans[0]
  const ph = await openPhone(`${url.pathname}${url.search}`, h.device, false)
  // le PC reste en temps réel : il répond au téléphone
  await waitFor(ph.page, () => !!document.querySelector('.profile'), null, 30000, 'profil')
  await ph.page.evaluate(() => window.__vt.setManual(true))
  await ph.page.evaluate(() => window.__vt.advance(400, 1000 / 30))
  const enc = encoder(join(CLIPS, 'phonejoin.mp4'), 30)
  const frame = async (n = 1) => {
    for (let k = 0; k < n; k++) {
      await ph.page.evaluate(() => window.__vt.step(1000 / 30))
      await enc.write(await grab(ph.cdp))
    }
  }
  const marks = {}
  await frame(20)
  // effacer le nom proposé, puis taper lettre à lettre
  await ph.page.fill('#phone-name', '')
  await frame(6)
  for (const ch of h.name) {
    await ph.page.type('#phone-name', ch)
    await frame(4)
  }
  await frame(12)
  const sw = await center(ph.page, `.swatch >> nth=${h.color}`)
  marks.color = enc.frames
  await tapAt(ph, sw.x, sw.y)
  await frame(18)
  const go = await center(ph.page, '.profile__go')
  marks.go = enc.frames
  await tapAt(ph, go.x, go.y)
  for (let k = 0; k < 60 && !(await ph.page.evaluate(() => !!document.querySelector('.lobby-goals'))); k++) {
    await sleep(60)
    await frame(1)
  }
  marks.lobby = enc.frames
  await frame(24)
  // joystick : un tour de cadran, puis PLONGER tenu
  const z = await center(ph.page, '.stick-zone')
  const sx = z.b.x + z.b.width * 0.42
  const sy = z.b.y + z.b.height * 0.58
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, sx, sy)] })
  marks.stick = enc.frames
  for (let k = 0; k <= 45; k++) {
    const a = (k / 45) * Math.PI * 1.6 - Math.PI / 2
    const rr = Math.min(1, k / 8) * 58
    await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, sx + Math.cos(a) * rr, sy + Math.sin(a) * rr)] })
    await frame(1)
  }
  const d = await center(ph.page, '.act--dive')
  const last = { x: sx + Math.cos(Math.PI * 1.1) * 58, y: sy + Math.sin(Math.PI * 1.1) * 58 }
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, last.x, last.y), tp(2, d.x, d.y)] })
  marks.dive = enc.frames
  await frame(30)
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await frame(20)
  await enc.close()
  writeFileSync(join(CLIPS, 'phonejoin.json'), JSON.stringify({ fps: 30, frames: enc.frames, marks }, null, 1))
  log(`manette : ${enc.frames} images ${JSON.stringify(marks)}`)
  await pc.context().close()
  await ph.page.context().close()
}

// ─── Déroulé ───────────────────────────────────────────────────────────────
const t0 = Date.now()
try {
  if (TAKES.has('phonejoin')) await takePhoneJoin()
  const main = ['title', 'lobby', 'rules', 'round', 'results'].some(k => TAKES.has(k))
  if (main) {
    const pc = await openHost()
    if (TAKES.has('title')) await takeTitle(pc)
    let phones = []
    if (TAKES.has('lobby') || TAKES.has('rules') || TAKES.has('round') || TAKES.has('results')) phones = await takeLobby(pc, TAKES.has('lobby'))
    if (TAKES.has('rules') || TAKES.has('round') || TAKES.has('results')) await takeRules(pc, TAKES.has('rules'))
    if (TAKES.has('round') || TAKES.has('results')) await takeRound(pc, phones)
    if (TAKES.has('results')) await takeResults(pc)
    const logs = pc.__logs.filter(l => !/THREE.Clock|favicon/.test(l))
    if (logs.length) log(`console du PC :\n${logs.slice(-12).join('\n')}`)
  }
} finally {
  await closeBrowser()
  log(`fini en ${((Date.now() - t0) / 60000).toFixed(1)} min`)
}
