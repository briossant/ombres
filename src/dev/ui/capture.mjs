// Captures de l'UI (page dev/ui.html) — revue visuelle.
//   node src/dev/ui/capture.mjs all                     → chaque écran, 1080p et 720p, FR et EN
//   node src/dev/ui/capture.mjs one "screen=rules&n=5" rules [--size=1920x1080] [--at=0.4,1.2]
// --at : fige toutes les animations CSS à ces instants (s) et capture chacun.
// Sortie : shots/ui/<nom>[_<t>].jpg
import { launch, newContext, collectLogs } from '../../../tools/lib/browser.mjs'

const BASE = process.env.UI_BASE ?? 'http://localhost:8805/dev/ui.html'
const OUT = 'shots/ui'
const [mode = 'all', query = '', name = 'shot', ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))

const browser = await launch()

async function shoot(q, file, { w = 1920, h = 1080, at = null, wait = 700, evalJs = null } = {}) {
  const ctx = await newContext(browser, { w, h })
  const page = await ctx.newPage()
  const logs = collectLogs(page)
  await page.goto(`${BASE}?${q}`, { waitUntil: 'load' })
  try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 })
  } catch {
    logs.push('[capture] timeout __ready')
  }
  await page.waitForTimeout(wait)
  if (evalJs) {
    await page.evaluate(evalJs)
    await page.waitForTimeout(400)
  }
  const times = at ?? [null]
  for (const t of times) {
    if (t !== null) {
      await page.evaluate(ms => {
        for (const a of document.getAnimations()) {
          a.pause()
          a.currentTime = ms
        }
      }, t * 1000)
      await page.waitForTimeout(80)
    }
    const out = `${OUT}/${file}${t !== null ? `_${String(t).replace('.', 'p')}` : ''}.jpg`
    await page.screenshot({ path: out, type: 'jpeg', quality: 86 })
    console.log(out)
  }
  const errs = logs.filter(l => /error|pageerror|timeout/i.test(l) && !/favicon|404/.test(l))
  if (errs.length) console.log('  !', errs.join('\n  ! '))
  await ctx.close()
}

if (mode === 'one') {
  const [w, h] = String(opt.size ?? '1920x1080').split('x').map(Number)
  const at = opt.at ? String(opt.at).split(',').map(Number) : null
  await shoot(query, name, { w, h, at, wait: Number(opt.wait ?? 700), evalJs: opt.eval ?? null })
} else {
  const screens = [
    ['loading', 'screen=loading'],
    ['title', 'screen=title'],
    ['title-menu', 'screen=title-menu'],
    ['lobby', 'screen=lobby&n=5'],
    ['lobby-empty', 'screen=lobby-empty'],
    ['lobby-12', 'screen=lobby&n=12'],
    ['rules', 'screen=rules&n=4'],
    ['hud-countdown', 'screen=hud&phase=countdown&n=4'],
    ['hud-noon', 'screen=hud&phase=noon&n=6'],
    ['hud-golden', 'screen=hud&phase=golden&n=6'],
    ['hud-sunset', 'screen=hud&phase=sunset&n=6'],
    ['hud-great', 'screen=hud&phase=great&n=6'],
    ['hud-last', 'screen=hud&phase=last&n=6'],
    ['hud-12cb', 'screen=hud&phase=golden&n=12&cb=1'],
    ['pause', 'screen=pause&phase=sunset&n=5'],
    ['settings', 'screen=settings'],
    ['round', 'screen=round&n=5'],
    ['match', 'screen=match&n=6'],
    ['credits', 'screen=credits'],
    ['reconnect', 'screen=reconnect&phase=golden&n=4'],
  ]
  const only = opt.only ? String(opt.only).split(',') : null
  const sizes = opt.sizes ? String(opt.sizes).split(',') : ['1920x1080', '1280x720']
  const langs = opt.langs ? String(opt.langs).split(',') : ['fr', 'en']
  for (const [n, q] of screens) {
    if (only && !only.includes(n)) continue
    for (const size of sizes) {
      const [w, h] = size.split('x').map(Number)
      for (const lang of langs) await shoot(`${q}&lang=${lang}`, `${n}_${h}_${lang}`, { w, h, wait: 900 })
    }
  }
}
await browser.close()
