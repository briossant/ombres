// Capture d'un scénario de la page de dev du téléphone, avec journal (erreurs, HTTP ≥ 400).
//   PORT=8835 node tools/polish/phone/one.mjs <scénario> [--w=568 --h=320] [--dev="iPhone SE"] [--lang=fr] [--color=3]
//     [--q=params en plus] [--wait=900] [--out=chemin.jpg] [--burst=100,400,900 (ms après le chargement)] [--seek=300,800 (animations figées)] [--for=.fx__stamp] [--clock=400] [--tap]
import { devices } from 'playwright-core'
import { launch } from '../../lib/browser.mjs'

const PORT = Number(process.env.PORT ?? 8835)
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const scen = process.argv[2]
const { defaultBrowserType: _i, ...d } = devices[arg('dev', 'iPhone 15 Pro')]
const w = Number(arg('w', d.viewport.height))
const h = Number(arg('h', d.viewport.width))
const b = await launch()
const ctx = await b.newContext({ ...d, viewport: { width: w, height: h } })
const p = await ctx.newPage()
await p.addInitScript(() => {
  const t0 = performance.now()
  window.__vibes = []
  navigator.vibrate = pattern => {
    window.__vibes.push({ t: Math.round(performance.now() - t0), pattern })
    return true
  }
})
p.on('pageerror', e => console.log('PAGEERROR', e.message))
p.on('console', m => ['error', 'warning'].includes(m.type()) && console.log('CONSOLE', m.type(), m.text()))
p.on('response', r => r.status() >= 400 && console.log('HTTP', r.status(), r.url()))
// --clock=<ms> : horloge JS figée (timers, rAF) et avancée de <ms> après le chargement : les éléments
// éphémères (tampons retirés par setTimeout) restent en place pendant une capture lente.
const clockMs = arg('clock', '')
if (clockMs) await p.clock.install()
await p.goto(`http://localhost:${PORT}/dev/phone.html?s=${scen}&lang=${arg('lang', 'fr')}&color=${arg('color', '3')}${arg('q', '') ? '&' + arg('q', '') : ''}`, { waitUntil: 'load' })
// --tap : un appui tout de suite après le chargement (activation utilisateur : navigator.vibrate autorisé)
if (process.argv.includes('--tap')) await p.mouse.click(3, Math.round(h / 2))
const out = arg('out', `shots/polish/fix-phone/one-${scen}.jpg`)
const burst = arg('burst', '')
const seek = arg('seek', '')
if (seek) {
  // Instants figés : toutes les animations CSS en pause, puis placées au temps donné (ms) — images exactes
  // même quand la capture est lente (GPU partagé).
  await p.waitForFunction(() => window.__ready === true)
  // --for=<sélecteur> : attendre qu'un élément apparaisse (tampon, message) avant de figer.
  if (clockMs) await p.clock.runFor(Number(clockMs))
  if (arg('for', '')) await p.waitForSelector(arg('for', ''), { timeout: 10000 })
  else if (!clockMs) await p.waitForTimeout(200)
  for (const ms of seek.split(',').map(Number)) {
    await p.evaluate(t => {
      for (const a of document.getAnimations()) {
        a.pause()
        a.currentTime = t
      }
    }, ms)
    const f = out.replace(/\.jpg$/, `-t${String(ms).padStart(5, '0')}.jpg`)
    await p.screenshot({ path: f, type: 'jpeg', quality: 85 })
    console.log(f)
  }
} else if (burst) {
  // Rafale : captures aux instants donnés (ms depuis __ready).
  await p.waitForFunction(() => window.__ready === true)
  const t0 = Date.now()
  for (const ms of burst.split(',').map(Number)) {
    const wait = ms - (Date.now() - t0)
    if (wait > 0) await p.waitForTimeout(wait)
    const f = out.replace(/\.jpg$/, `-${String(ms).padStart(5, '0')}.jpg`)
    await p.screenshot({ path: f, type: 'jpeg', quality: 85 })
    console.log(f, `${Date.now() - t0} ms`)
  }
} else {
  await p.waitForTimeout(Number(arg('wait', '900')))
  await p.screenshot({ path: out, type: 'jpeg', quality: 85 })
  console.log(out)
}
const vib = await p.evaluate(() => window.__vibes ?? null)
if (vib) console.log('vibrations', JSON.stringify(vib))
await b.close()
