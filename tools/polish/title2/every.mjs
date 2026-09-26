// Correcteur title (polish vague 2) : une capture de l'écran titre toutes les `every` ms pendant
// `secs` s, dès la fin du chargement (raccord compris), avec le plan, le défaut signalé par la
// caméra (cameraState.shotFault) et la carte de la démo ; planches contact de 24 images.
//   PORT=8852 node --import ./tools/polish/staging/nohmr.mjs tools/polish/title2/every.mjs \
//     [--secs=180] [--every=1000] [--name=base] [--w=1920 --h=1080] [--menu=0]
import { launch, newContext } from '../../lib/browser.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const PORT = Number(process.env.PORT ?? 8852)
const SECS = Number(arg('secs', '180'))
const EVERY = Number(arg('every', '1000'))
const NAME = arg('name', 'base')
const W = Number(arg('w', '1920'))
const H = Number(arg('h', '1080'))
const MENU = arg('menu', '0') === '1'
const FONT = '/nix/store/qwnwwzfwipdi17c7icw2l709bpdcaakv-home-manager-path/share/fonts/truetype/NerdFonts/JetBrainsMono/JetBrainsMonoNLNerdFont-Medium.ttf'
const dir = join(import.meta.dirname, '../../../shots/polish2/title', NAME)
mkdirSync(dir, { recursive: true })

const browser = await launch()
const ctx = await newContext(browser, { w: W, h: H })
const page = await ctx.newPage()
const errs = []
page.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', e => errs.push(`[pageerror] ${e.message}`))
await page.goto(`http://localhost:${PORT}/?debug=nosave`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__ombres?.useUi.getState().screen === 'title', null, { timeout: 120000, polling: 16 })
await page.evaluate(async () => {
  const urlOf = path => {
    const e = performance.getEntriesByType('resource').map(r => r.name).filter(n => new URL(n).pathname === path)
    return e.length ? e[e.length - 1] : path
  }
  window.__cue = await import(urlOf('/src/host/camera/cue.ts'))
})
if (MENU) {
  await page.keyboard.press('KeyX')
  await page.waitForTimeout(600)
}
const log = []
const t0 = Date.now()
let n = 0
while (Date.now() - t0 < SECS * 1000) {
  const due = t0 + n * EVERY
  const wait = due - Date.now()
  if (wait > 0) await page.waitForTimeout(wait)
  const info = await page.evaluate(() => {
    const o = window.__ombres
    const s = o.runner.sim?.state
    const c = window.__cue?.cameraState
    return { t: s ? +s.sun.t.toFixed(1) : null, map: s?.config?.mapId ?? '', shot: c?.shot ?? '', fault: c?.shotFault ?? '', storm: o.worldView.hideStorm, mode: o.cameraCue.mode, screen: o.useUi.getState().screen }
  })
  const f = `${String(n).padStart(3, '0')}-${info.shot}-t${info.t}${info.fault ? '-' + info.fault : ''}.jpg`
  await page.screenshot({ path: join(dir, f), type: 'jpeg', quality: 78 })
  log.push({ n, sec: +((Date.now() - t0) / 1000).toFixed(2), file: f, ...info })
  n++
}
writeFileSync(join(dir, '_log.json'), JSON.stringify(log, null, 1))
await browser.close()
// planches de 24 images (6 × 4)
const files = log.map(l => join(dir, l.file))
for (let i = 0; i < files.length; i += 24) {
  const out = join(dir, `sheet-${String(i / 24).padStart(2, '0')}.jpg`)
  execFileSync('montage', ['-font', FONT, '-label', '%t', ...files.slice(i, i + 24), '-tile', '6x', '-geometry', '480x270+2+2', '-pointsize', '12', '-background', '#222', '-fill', '#eee', out])
}
const faults = log.filter(l => l.fault)
console.log(`${log.length} images, ${faults.length} signalées par la caméra : ${faults.map(l => l.n + ':' + l.fault).join(' ')}`)
console.log(errs.length ? `PROBLÈMES :\n${errs.join('\n')}` : 'console propre')
