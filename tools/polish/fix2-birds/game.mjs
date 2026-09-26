// Correcteur birds (polish vague 2) : partie réelle (1 joueur clavier + bots), images figées à des
// instants choisis, recadrages ×3 de chaque oiseau, relevé des envergures et MESURE DE LA COULEUR
// DES BANDES D'AILE : la sonde `birdAnchors.screen` (?debug) donne la position écran du milieu de
// chaque bande ; on y relève l'OKLCH (moyenne 3×3 px sur PNG sans perte) et on compare à la teinte
// du joueur.
//   PORT=8853 node tools/polish/fix2-birds/game.mjs --name=after-12 [--n=12] [--speed=2] [--rounds=1]
//        [--at=0.15,0.45,0.7,0.82,0.9] [--countdown] [--results] [--q=high] [--crop=1] [--cb=0] [--reads]
// Sorties : shots/polish2/birds/<name>/ (PNG, planches `crops-*.jpg`, `birds.json`, `bands.txt`).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGIN, launch, newContext, collectLogs, sleep, waitFor, problems, arg, flag, presetSettings } from '../../e2e/qa/lib.mjs'

const NAME = arg('name', 'game')
const N = Number(arg('n', '12'))
const SPEED = Number(arg('speed', '2'))
const ROUNDS = Number(arg('rounds', '1'))
const AT = arg('at', '0.15,0.45,0.7,0.82,0.9').split(',').filter(Boolean).map(Number)
const CROP = arg('crop', '1') === '1'
const dir = join(import.meta.dirname, '../../../shots/polish2/birds', NAME)
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'bands.txt'), '')
const palette = JSON.parse(readFileSync(join(import.meta.dirname, '../../../src/shared/palette.json'), 'utf8'))
const t0 = Date.now()
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`)

// ─── OKLab ─────────────────────────────────────────────────────────────────
const s2l = c => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function oklab(r, g, b) {
  r = s2l(r)
  g = s2l(g)
  b = s2l(b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
const hueOf = (a, b) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
const hueDist = (h1, h2) => Math.abs(((h1 - h2 + 540) % 360) - 180)
/** Moyenne OKLab 3×3 autour de (x, y) dans une image RGB brute. */
function sample(raw, W, H, x, y) {
  let L = 0
  let A = 0
  let B = 0
  let n = 0
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const px = Math.round(x) + i
      const py = Math.round(y) + j
      if (px < 0 || py < 0 || px >= W || py >= H) continue
      const o = (py * W + px) * 3
      const [l, a, b] = oklab(raw[o], raw[o + 1], raw[o + 2])
      L += l
      A += a
      B += b
      n++
    }
  if (!n) return null
  L /= n
  A /= n
  B /= n
  return { L, C: Math.hypot(A, B), h: hueOf(A, B) }
}

const browser = await launch()
const ctx = await newContext(browser, { w: 1920, h: 1080 })
const pc = await ctx.newPage()
const logs = collectLogs(pc)
await presetSettings(pc, { lang: 'fr', quality: arg('q', 'high'), colorblind: arg('cb', '0') === '1' })
// Correcteurs en parallèle : HMR de Vite coupé dans cette page.
await pc.addInitScript(() => {
  const WS = window.WebSocket
  window.WebSocket = new Proxy(WS, {
    construct(target, args) {
      const proto = args[1]
      const list = Array.isArray(proto) ? proto : [proto]
      if (list.some(p => typeof p === 'string' && p.startsWith('vite-'))) {
        const fake = new EventTarget()
        Object.assign(fake, { readyState: 0, send() {}, close() {}, url: String(args[0]), protocol: '' })
        return fake
      }
      return Reflect.construct(target, args)
    },
  })
})
const query = SPEED > 1 ? `?debug=fast,nosave&speed=${SPEED}` : '?debug=nosave'
await pc.goto(`${ORIGIN}/${query}`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await pc.evaluate(() => window.__ombres.runner.enterLobby())
await sleep(600)
await pc.keyboard.press('Space')
await sleep(400)
await pc.evaluate(
  ({ n, rounds }) => {
    const r = window.__ombres.runner
    r.setMatchSetting('rounds', rounds)
    while (r.roster.size < n) if (!r.addBot(null, 1)) break
  },
  { n: N, rounds: ROUNDS },
)
await sleep(800)
await pc.evaluate(async () => {
  const url = path => {
    const e = performance.getEntriesByType('resource').filter(r => r.name.includes(path))
    return e.length ? new URL(e[e.length - 1].name).pathname + new URL(e[e.length - 1].name).search : path
  }
  window.__birdsAnchors = (await import(url('/src/host/render/bird/anchors.ts'))).birdAnchors
  window.__birdsAnchors.screen = new Float32Array(12 * 6)
  window.__hud = (await import(url('/src/host/ui/viewModel.ts'))).hudAnchors
})
if (flag('reads'))
  await pc.evaluate(() => {
    const o = window.__ombres
    const S = (window.__feelRead = [])
    setInterval(() => {
      const r = o.runner
      const st = r.sim?.state
      if (!st || r.phase !== 'round' || o.useUi.getState().screen !== 'game') return
      if (Object.prototype.hasOwnProperty.call(r, 'timeScale')) return
      const bar = document.querySelector('.sandbar, .sand-bar, [class*="sandbar"]')?.getBoundingClientRect()
      const birds = st.birds.map(b => {
        const a = window.__hud.birds[b.slot]
        return { s: b.slot, x: Math.round(a.x), y: Math.round(a.y), span: Math.round(window.__birdsAnchors.spanPx[b.slot]), hid: a.hidden, z: +b.z.toFixed(1) }
      })
      S.push({ t: +st.sun.t.toFixed(2), ph: st.sun.phase, W: innerWidth, H: innerHeight, barBottom: bar ? Math.round(bar.bottom) : null, birds })
    }, 250)
  })

// Gel de la sim ET de la caméra (qui vit en temps réel) : matrices figées pendant la capture.
const freeze = on =>
  pc.evaluate(on => {
    const r = window.__ombres.runner
    const cam = window.__birdsAnchors.probeCamera
    if (on) {
      r.timeScale = () => 0
      if (cam) {
        cam.matrixAutoUpdate = false
        cam.__upm = cam.updateProjectionMatrix
        cam.updateProjectionMatrix = () => {}
      }
    } else {
      delete r.timeScale
      if (cam) {
        cam.matrixAutoUpdate = true
        if (cam.__upm) cam.updateProjectionMatrix = cam.__upm
      }
    }
  }, on)

const birdsNow = () =>
  pc.evaluate(() => {
    const o = window.__ombres
    const st = o.gameView.sim
    if (!st) return []
    const P = window.__birdsAnchors.screen
    const sx = v => ((v + 1) / 2) * innerWidth
    const sy = v => ((1 - v) / 2) * innerHeight
    return st.birds.map(b => {
      const a = window.__hud.birds[b.slot]
      const span = window.__birdsAnchors.spanPx[b.slot]
      const k = b.slot * 6
      return {
        slot: b.slot,
        color: o.gameView.players[b.slot]?.colorIndex ?? b.slot,
        x: Math.round(sx(P[k + 4])),
        y: Math.round(sy(P[k + 5])),
        bl: [sx(P[k]), sy(P[k + 1])],
        br: [sx(P[k + 2]), sy(P[k + 3])],
        span: Math.round(span),
        scale: +window.__birdsAnchors.scale[b.slot].toFixed(2),
        hidden: b.hidden,
        hud: [Math.round(a.x), Math.round(a.y)],
        z: +b.z.toFixed(1),
      }
    })
  })

const records = []
let n = 0
async function capture(label) {
  await freeze(true)
  // La caméra continue de vivre en temps réel pendant le gel : on attend qu'elle se pose,
  // puis on relève les positions avant ET après la capture (moyenne, dérive notée).
  await sleep(400)
  const birdsA = await birdsNow()
  const info = await pc.evaluate(() => {
    const st = window.__ombres.gameView.sim
    return { sunT: st?.sun.t ?? null, phase: st?.sun.phase ?? null, pe: st?.sun.paletteElevDeg ?? null, screen: window.__ombres.useUi.getState().screen }
  })
  const file = join(dir, `${String(++n).padStart(3, '0')}-${label}.png`)
  await pc.screenshot({ path: file, type: 'png', timeout: 120000 })
  const birdsB = await birdsNow()
  await freeze(false)
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const birds = birdsA.map(a => {
    const b = birdsB.find(x => x.slot === a.slot) ?? a
    const drift = Math.hypot(a.x - b.x, a.y - b.y)
    return { ...a, x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), bl: mid(a.bl, b.bl), br: mid(a.br, b.br), drift: +drift.toFixed(1) }
  })
  // Couleur des bandes.
  const raw = execFileSync('magick', [file, '-depth', '8', 'rgb:-'], { maxBuffer: 64 << 20 })
  const out = [`## ${label} (${info.phase}, paletteElev ${info.pe?.toFixed(1)})`]
  let ok = 0
  let tot = 0
  for (const b of birds) {
    const pl = palette.players[b.color]
    const [, , hp] = pl.oklch
    const res = []
    for (const [x, y] of [b.bl, b.br]) {
      if (x < 2 || y < 2 || x > 1917 || y > 1077 || b.drift > 2.5) continue
      const s = sample(raw, 1920, 1080, x, y)
      if (!s) continue
      tot++
      const good = s.C >= 0.08 && hueDist(s.h, hp) <= 35
      if (good) ok++
      res.push(`L ${s.L.toFixed(2)} C ${s.C.toFixed(3)} h ${s.h.toFixed(0)}${good ? '' : ' ✗'}`)
    }
    b.bands = res
    out.push(`  s${b.slot} ${pl.fr.padEnd(8)} (h ${hp}) ${String(b.span).padStart(3)} px${b.hidden ? ' caché' : ''}${b.drift > 2.5 ? ` (dérive ${b.drift} px)` : ''}  ${res.join('  |  ')}`)
  }
  out.push(`  → bandes chroma ≥ 0,08 et teinte à ±35° : ${ok}/${tot}`)
  appendFileSync(join(dir, 'bands.txt'), out.join('\n') + '\n')
  records.push({ file, label, ...info, birds, bandsOk: ok, bandsTotal: tot })
  const spans = birds.map(b => b.span).sort((a, b) => a - b)
  log(`${label} : ${birds.length} oiseaux, envergure médiane ${spans[Math.floor(spans.length / 2)] ?? '-'} px (min ${spans[0] ?? '-'}), bandes OK ${ok}/${tot}`)
  if (CROP && birds.length) {
    const tiles = []
    for (const b of birds) {
      if (b.x < 0 || b.y < 0 || b.x > 1920 || b.y > 1080) continue
      const t = join(dir, `.tile-${b.slot}.png`)
      const x = Math.max(0, Math.min(1920 - 110, b.x - 55))
      const y = Math.max(0, Math.min(1080 - 110, b.y - 55))
      execFileSync('magick', [file, '-crop', `110x110+${x}+${y}`, '+repage', '-filter', 'point', '-resize', '300%', '-gravity', 'south', '-background', '#2b1d23', '-splice', '0x22', '-fill', '#f7f0e3', '-pointsize', '16', '-annotate', '+0+2', `s${b.slot} ${palette.players[b.color].fr} ${b.span}px${b.hidden ? ' caché' : ''}`, t])
      tiles.push(t)
    }
    if (tiles.length) {
      const argv = []
      for (let i = 0; i < tiles.length; i += 4) argv.push('(', ...tiles.slice(i, i + 4), '-bordercolor', '#2b1d23', '-border', '3', '+append', ')')
      execFileSync('magick', [...argv, '-background', '#2b1d23', '-append', '-quality', '90', join(dir, `crops-${String(n).padStart(3, '0')}-${label}.jpg`)])
    }
  }
}

await pc.keyboard.press('Enter')
await waitFor(pc, () => ['rules', 'round'].includes(window.__ombres?.runner.phase), null, 10000, 'lancement')
await sleep(300)
if ((await pc.evaluate(() => window.__ombres.runner.phase)) === 'rules') await pc.keyboard.press('Enter')
let round = 0
let todo = [...AT]
let lastScreen = ''
let cdShot = false
let resShot = 0
while (true) {
  const s = await pc.evaluate(() => {
    const o = window.__ombres
    const r = o.runner
    return { phase: r.phase, screen: o.useUi.getState().screen, round: r.roundIndex, sunT: r.sim?.state.sun.u ?? null, cd: r.sim?.state.sun.phase === 'countdown' }
  })
  if (s.screen !== lastScreen) {
    log(`écran ${s.screen} (manche ${s.round})`)
    if (s.screen === 'game') {
      round++
      todo = [...AT]
      cdShot = false
    }
    if (s.screen === 'roundResults') resShot = 0
    lastScreen = s.screen
  }
  if (s.screen === 'game' && flag('countdown') && !cdShot && s.cd && s.sunT !== null) {
    cdShot = true
    await sleep(700)
    await capture(`r${round}-countdown`)
  }
  if (s.screen === 'game' && todo.length && s.sunT !== null && s.sunT >= todo[0]) {
    const at = todo.shift()
    await capture(`r${round}-u${at}`)
  }
  if (s.screen === 'roundResults' && flag('results') && resShot < 1) {
    await sleep(1200)
    resShot++
    await capture(`r${round}-results`)
  }
  if (s.phase === 'matchResults') break
  if (s.screen === 'roundResults' && round >= ROUNDS) {
    await sleep(1500)
    break
  }
  await sleep(100)
}
writeFileSync(join(dir, 'birds.json'), JSON.stringify(records, null, 1))
if (flag('reads')) writeFileSync(join(dir, 'reads.json'), JSON.stringify(await pc.evaluate(() => window.__feelRead)))
const tot = records.reduce((a, r) => [a[0] + r.bandsOk, a[1] + r.bandsTotal], [0, 0])
log(`bandes OK sur la partie : ${tot[0]}/${tot[1]}`)
const errs = problems(logs)
log(errs.length ? `PROBLÈMES :\n  ${[...new Set(errs)].slice(0, 12).join('\n  ')}` : 'console propre')
await browser.close()
