// Sonde : images vides au début du titre (canvas uni). Échantillonne l'état caméra toutes les 50 ms
// et capture toutes les 250 ms pendant `secs` s après l'arrivée du titre ; signale les captures
// quasi unies (écart-type des pixels du canvas hors UI) et l'état caméra à cet instant.
//   PORT=8852 node --import ./tools/polish/staging/nohmr.mjs tools/polish/title2/blank.mjs [--runs=3] [--secs=10]
import { launch, newContext } from '../../lib/browser.mjs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const PORT = Number(process.env.PORT ?? 8852)
const dir = join(import.meta.dirname, '../../../shots/polish2/title', arg('name', 'blank'))
mkdirSync(dir, { recursive: true })
const browser = await launch()
for (let run = 0; run < Number(arg('runs', '3')); run++) {
  const ctx = await newContext(browser)
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${PORT}/?debug=nosave`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__ombres?.useUi.getState().screen === 'title', null, { timeout: 120000, polling: 16 })
  await page.evaluate(async () => {
    const urlOf = path => {
      const e = performance.getEntriesByType('resource').map(r => r.name).filter(n => new URL(n).pathname === path)
      return e.length ? e[e.length - 1] : path
    }
    const cue = await import(urlOf('/src/host/camera/cue.ts'))
    window.__log = []
    const t0 = performance.now()
    const tick = () => {
      const s = window.__ombres.runner.sim?.state
      const f = cue.cameraState.frame
      window.__log.push({ ms: Math.round(performance.now() - t0), t: s ? +s.sun.t.toFixed(2) : null, shot: cue.cameraState.shot, fault: cue.cameraState.shotFault, fx: +f.x.toFixed(1), fy: +f.y.toFixed(1), fw: +f.halfWidth.toFixed(1) })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const t0 = Date.now()
  let n = 0
  const secs = Number(arg('secs', '10'))
  while (Date.now() - t0 < secs * 1000) {
    const buf = await page.screenshot({ type: 'png', clip: { x: 1150, y: 80, width: 700, height: 420 } })
    // uniformité : on décode grossièrement via sharp absent → on laisse ImageMagick juger plus tard
    const f = join(dir, `r${run}-${String(n++).padStart(3, '0')}-${Date.now() - t0}.png`)
    ;(await import('node:fs')).writeFileSync(f, buf)
    await page.waitForTimeout(150)
  }
  const log = await page.evaluate(() => window.__log)
  ;(await import('node:fs')).writeFileSync(join(dir, `r${run}-log.json`), JSON.stringify(log))
  const bad = log.filter(l => !Number.isFinite(l.fx) || !Number.isFinite(l.fw))
  console.log(`run ${run}: ${log.length} frames, cadre non fini ${bad.length}`, bad.slice(0, 5))
  await ctx.close()
}
await browser.close()
