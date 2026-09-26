// Correcteur birds (polish vague 1) : partie réelle (1 joueur clavier + bots), images figées
// à des instants choisis, avec recadrages ×3 de chaque oiseau (planche) et relevé des envergures.
//   PORT=8833 node tools/polish/fix-birds/game.mjs --name=twelve [--n=12] [--speed=2] [--rounds=1]
//        [--at=0.1,0.4,0.65,0.85,0.95] (fractions u de la durée du soleil) [--countdown] [--results] [--podium] [--q=high]
//        [--crop=1] [--cb=0] [--png] [--reads]
// --reads : relevé à 4 Hz au format de tools/polish/feel/lib.mjs (installReadProbe) dans reads.json,
//           à lire avec `node tools/polish/feel/read-stats.mjs shots/polish/fix-birds/<name>/reads.json`.
// Sorties : shots/polish/fix-birds/<name>/ (images, planches `crops-*.jpg`, `birds.json`).
// Le gel utilise ?debug (le runner est exposé) : timeScale forcé à 0 le temps de la capture.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGIN, launch, newContext, collectLogs, sleep, waitFor, problems, arg, flag, presetSettings } from '../../e2e/qa/lib.mjs'

const NAME = arg('name', 'game')
const N = Number(arg('n', '12'))
const SPEED = Number(arg('speed', '2'))
const ROUNDS = Number(arg('rounds', '1'))
const AT = arg('at', '0.1,0.4,0.65,0.85,0.95').split(',').filter(Boolean).map(Number)
const CROP = arg('crop', '1') === '1'
/** --png : captures sans perte (mesures de chroma : le JPEG sous-échantillonne la couleur). */
const EXT = flag('png') ? 'png' : 'jpg'
const dir = join(import.meta.dirname, '../../../shots/polish/fix-birds', NAME)
mkdirSync(dir, { recursive: true })
const t0 = Date.now()
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`)

const browser = await launch()
const ctx = await newContext(browser, { w: 1920, h: 1080 })
const pc = await ctx.newPage()
const logs = collectLogs(pc)
await presetSettings(pc, { lang: 'fr', quality: arg('q', 'high'), colorblind: arg('cb', '0') === '1' })
// Sept correcteurs modifient le code en parallèle : on coupe le HMR de Vite dans cette page
// (sinon une modification ailleurs recharge la page en pleine partie).
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
  // Accès aux ancres des oiseaux (envergure à l'écran) pour le relevé.
  // Même instance de module que l'application (URL exacte, avec l'éventuel ?t= du HMR).
  const url = path => {
    const e = performance.getEntriesByType('resource').filter(r => r.name.includes(path))
    return e.length ? new URL(e[e.length - 1].name).pathname + new URL(e[e.length - 1].name).search : path
  }
  window.__birdsAnchors = (await import(url('/src/host/render/bird/anchors.ts'))).birdAnchors
  window.__hud = (await import(url('/src/host/ui/viewModel.ts'))).hudAnchors
})
if (flag('reads'))
  await pc.evaluate(() => {
    // Même sonde que installReadProbe (feel/lib.mjs), avec les bonnes instances de modules.
    const o = window.__ombres
    const S = (window.__feelRead = [])
    setInterval(() => {
      const r = o.runner
      const st = r.sim?.state
      if (!st || r.phase !== 'round' || o.useUi.getState().screen !== 'game') return
      if (Object.prototype.hasOwnProperty.call(r, 'timeScale')) return // image figée par ce script
      const bar = document.querySelector('.sandbar, .sand-bar, [class*="sandbar"]')?.getBoundingClientRect()
      const birds = st.birds.map(b => {
        const a = window.__hud.birds[b.slot]
        return { s: b.slot, x: Math.round(a.x), y: Math.round(a.y), span: Math.round(window.__birdsAnchors.spanPx[b.slot]), hid: a.hidden, z: +b.z.toFixed(1) }
      })
      S.push({ t: +st.sun.t.toFixed(2), ph: st.sun.phase, W: innerWidth, H: innerHeight, barBottom: bar ? Math.round(bar.bottom) : null, birds })
    }, 250)
  })

const freeze = on =>
  pc.evaluate(on => {
    const r = window.__ombres.runner
    if (on) r.timeScale = () => 0
    else delete r.timeScale
  }, on)

const birdsNow = () =>
  pc.evaluate(() => {
    const o = window.__ombres
    const st = o.gameView.sim
    if (!st) return []
    return st.birds.map(b => {
      const a = window.__hud.birds[b.slot]
      const span = window.__birdsAnchors.spanPx[b.slot]
      const half = Math.min(span * 0.24, innerHeight * 0.08)
      return {
        slot: b.slot,
        color: o.gameView.players[b.slot]?.colorIndex ?? b.slot,
        x: Math.round(a.x),
        y: Math.round(a.y - half),
        span: Math.round(span),
        scale: +window.__birdsAnchors.scale[b.slot].toFixed(2),
        hidden: b.hidden,
        z: +b.z.toFixed(1),
      }
    })
  })

const records = []
let n = 0
async function capture(label) {
  await freeze(true)
  await sleep(250)
  const birds = await birdsNow()
  const info = await pc.evaluate(() => {
    const st = window.__ombres.gameView.sim
    return { sunT: st?.sun.t ?? null, phase: st?.sun.phase ?? null, pe: st?.sun.paletteElevDeg ?? null, screen: window.__ombres.useUi.getState().screen }
  })
  const file = join(dir, `${String(++n).padStart(3, '0')}-${label}.${EXT}`)
  await pc.screenshot(EXT === 'png' ? { path: file, type: 'png', timeout: 120000 } : { path: file, type: 'jpeg', quality: 90, timeout: 120000 })
  await freeze(false)
  records.push({ file, label, ...info, birds })
  const spans = birds.map(b => b.span).sort((a, b) => a - b)
  log(`${label} : ${birds.length} oiseaux, envergure médiane ${spans[Math.floor(spans.length / 2)] ?? '-'} px (min ${spans[0] ?? '-'})`)
  if (CROP && birds.length) {
    // Recadrage ×3 de 110 px autour de chaque oiseau, planche 4 colonnes.
    const tiles = []
    for (const b of birds) {
      if (b.x < 0 || b.y < 0 || b.x > 1920 || b.y > 1080) continue
      const t = join(dir, `.tile-${b.slot}.png`)
      const x = Math.max(0, Math.min(1920 - 110, b.x - 55))
      const y = Math.max(0, Math.min(1080 - 110, b.y - 55))
      execFileSync('magick', [file, '-crop', `110x110+${x}+${y}`, '+repage', '-filter', 'point', '-resize', '300%', '-gravity', 'south', '-background', '#2b1d23', '-splice', '0x22', '-fill', '#f7f0e3', '-pointsize', '16', '-annotate', '+0+2', `s${b.slot} c${b.color} ${b.span}px${b.hidden ? ' caché' : ''}`, t])
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
  if (s.screen === 'roundResults' && flag('results') && resShot < 2) {
    await sleep(resShot === 0 ? 1200 : 3000)
    resShot++
    await capture(`r${round}-results-${resShot}`)
  }
  if (s.phase === 'matchResults') {
    if (flag('podium')) {
      await sleep(3500)
      await capture('podium-a')
      await sleep(2500)
      await capture('podium-b')
      await sleep(3000)
      await capture('podium-c')
    }
    break
  }
  if (s.screen === 'roundResults' && round >= ROUNDS && !flag('podium')) {
    await sleep(2500)
    break
  }
  await sleep(100)
}
writeFileSync(join(dir, 'birds.json'), JSON.stringify(records, null, 1))
if (flag('reads')) writeFileSync(join(dir, 'reads.json'), JSON.stringify(await pc.evaluate(() => window.__feelRead)))
const errs = problems(logs)
log(errs.length ? `PROBLÈMES :\n  ${[...new Set(errs)].slice(0, 12).join('\n  ')}` : 'console propre')
await browser.close()
