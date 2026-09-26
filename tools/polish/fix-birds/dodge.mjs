// Correcteur birds (polish B7) : partie réelle de bots, capture figée juste après chaque
// esquive (diveMiss dodged) : image entière + recadrage ×3 de l'esquiveur et du chasseur.
//   PORT=8833 node tools/polish/fix-birds/dodge.mjs --name=dodge12 [--n=12] [--speed=2] [--max=4] [--delay=150]
// Sorties : shots/polish/fix-birds/<name>/.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGIN, launch, newContext, collectLogs, sleep, waitFor, problems, arg, presetSettings } from '../../e2e/qa/lib.mjs'

const NAME = arg('name', 'dodge')
const N = Number(arg('n', '12'))
const SPEED = Number(arg('speed', '2'))
const MAX = Number(arg('max', '4'))
const DELAY = Number(arg('delay', '150'))
const dir = join(import.meta.dirname, '../../../shots/polish/fix-birds', NAME)
mkdirSync(dir, { recursive: true })
const t0 = Date.now()
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`)

const browser = await launch()
const ctx = await newContext(browser, { w: 1920, h: 1080 })
const pc = await ctx.newPage()
const logs = collectLogs(pc)
await presetSettings(pc, { lang: 'fr', quality: 'high' })
// HMR coupé (d'autres correcteurs modifient le code en parallèle).
await pc.addInitScript(() => {
  const WS = window.WebSocket
  window.WebSocket = new Proxy(WS, {
    construct(target, args) {
      const list = Array.isArray(args[1]) ? args[1] : [args[1]]
      if (list.some(p => typeof p === 'string' && p.startsWith('vite-'))) {
        const fake = new EventTarget()
        Object.assign(fake, { readyState: 0, send() {}, close() {}, url: String(args[0]), protocol: '' })
        return fake
      }
      return Reflect.construct(target, args)
    },
  })
})
await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=${SPEED}`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await pc.evaluate(() => window.__ombres.runner.enterLobby())
await sleep(600)
await pc.keyboard.press('Space')
await sleep(400)
await pc.evaluate(n => {
  const r = window.__ombres.runner
  r.setMatchSetting('rounds', 3)
  while (r.roster.size < n) if (!r.addBot(null, 1)) break
}, N)
await sleep(800)
await pc.evaluate(async delay => {
  const url = path => {
    const e = performance.getEntriesByType('resource').filter(r => r.name.includes(path))
    return e.length ? new URL(e[e.length - 1].name).pathname + new URL(e[e.length - 1].name).search : path
  }
  window.__hud = (await import(url('/src/host/ui/viewModel.ts'))).hudAnchors
  window.__an = (await import(url('/src/host/render/bird/anchors.ts'))).birdAnchors
  const o = window.__ombres
  o.simEvents.on(e => {
    if (e.type !== 'diveMiss' || !e.dodged || window.__dodge) return
    window.__dodge = { pending: true, ...e }
    setTimeout(() => {
      o.runner.timeScale = () => 0
      const pos = s => {
        const a = window.__hud.birds[s]
        const span = window.__an.spanPx[s]
        return { x: Math.round(a.x), y: Math.round(a.y - Math.min(span * 0.24, innerHeight * 0.08)), span: Math.round(span) }
      }
      window.__dodge = { ...window.__dodge, pending: false, t: pos(e.target), h: pos(e.hunter) }
    }, delay)
  })
}, DELAY)
await pc.keyboard.press('Enter')
await waitFor(pc, () => ['rules', 'round'].includes(window.__ombres?.runner.phase), null, 10000, 'lancement')
await sleep(300)
if ((await pc.evaluate(() => window.__ombres.runner.phase)) === 'rules') await pc.keyboard.press('Enter')

const shots = []
let n = 0
while (n < MAX) {
  const d = await pc.evaluate(() => window.__dodge ?? null)
  const phase = await pc.evaluate(() => window.__ombres.runner.phase)
  if (phase === 'matchResults') break
  if (d && d.pending === false) {
    // Deux images par esquive : à +DELAY ms (arc de souffle) puis +300 ms (plumes, étoiles).
    for (const k of [0, 1]) {
      if (k === 1) {
        await pc.evaluate(() => delete window.__ombres.runner.timeScale)
        await sleep(300)
        await pc.evaluate(() => (window.__ombres.runner.timeScale = () => 0))
        await sleep(60)
      }
      const file = join(dir, `${String(n + 1).padStart(2, '0')}${k ? 'b' : 'a'}-dodge-t${d.target}-h${d.hunter}.png`)
      await pc.screenshot({ path: file, type: 'png', timeout: 120000 })
      const tiles = []
      for (const [name, p] of [['esquiveur', d.t], ['chasseur', d.h]]) {
        const t = join(dir, `.tile-${name}.png`)
        const x = Math.max(0, Math.min(1920 - 140, p.x - 70))
        const y = Math.max(0, Math.min(1080 - 140, p.y - 70))
        execFileSync('magick', [file, '-crop', `140x140+${x}+${y}`, '+repage', '-filter', 'point', '-resize', '300%', t])
        tiles.push(t)
      }
      execFileSync('magick', [...tiles, '+append', '-quality', '90', file.replace('.png', '-crop.jpg')])
      shots.push({ file, ...d })
    }
    n++
    log(`esquive ${n} : cible ${d.target} (${d.t.span} px), chasseur ${d.hunter} (${d.h.span} px)`)
    await pc.evaluate(() => {
      delete window.__ombres.runner.timeScale
      window.__dodge.pending = 'done'
      setTimeout(() => (window.__dodge = null), 2500)
    })
  }
  await sleep(40)
}
writeFileSync(join(dir, 'dodges.json'), JSON.stringify(shots, null, 1))
const errs = problems(logs)
log(errs.length ? `PROBLÈMES :\n  ${[...new Set(errs)].slice(0, 12).join('\n  ')}` : 'console propre')
await browser.close()
