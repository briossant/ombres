// Sonde de la cinématique du titre (polish S4) : échantillonne 4 fois par seconde le plan en cours,
// son défaut de composition (cameraState.shotFault : tour < 45 m, tour > 12 % de la largeur,
// Simoun < 120 m, tour dans la case du logo ou du pied de page) et le sujet ; résumé par plan.
//   PORT=8831 node --import ./tools/polish/staging/nohmr.mjs tools/polish/staging/title-probe.mjs [--secs=90] [--runs=3]
import { launch, newContext } from '../../lib/browser.mjs'
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const secs = Number(arg('secs', '90'))
const runs = Number(arg('runs', '1'))
const browser = await launch()
const total = { n: 0, bad: {} }
for (let run = 0; run < runs; run++) {
  const page = await (await newContext(browser)).newPage()
  await page.goto(`http://localhost:${process.env.PORT ?? 8831}/?debug=nosave`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__ombres?.useUi.getState().screen === 'title', null, { timeout: 120000 })
  await page.evaluate(async () => {
    const urlOf = path => {
      const e = performance.getEntriesByType('resource').map(r => r.name).filter(n => new URL(n).pathname === path)
      return e.length ? e[e.length - 1] : path
    }
    const cue = await import(urlOf('/src/host/camera/cue.ts'))
    window.__tp = []
    setInterval(() => {
      const s = window.__ombres.runner.sim?.state
      window.__tp.push({ shot: cue.cameraState.shot, fault: cue.cameraState.shotFault, t: s ? +s.sun.t.toFixed(1) : null })
    }, 250)
  })
  // captures d'images signalées (au plus `shots`, espacées d'au moins 2 s)
  const maxShots = Number(arg('shots', '0'))
  const dir = arg('dir', 'shots/polish/fix-staging/title-probe')
  if (maxShots) (await import('node:fs')).mkdirSync(dir, { recursive: true })
  const t0 = Date.now()
  let shots = 0
  let last = 0
  while (Date.now() - t0 < secs * 1000) {
    await page.waitForTimeout(250)
    if (shots >= maxShots || Date.now() - last < 2000) continue
    const x = await page.evaluate(() => window.__tp[window.__tp.length - 1])
    if (x?.fault) {
      last = Date.now()
      shots++
      await page.screenshot({ path: `${dir}/r${run}-${String(shots).padStart(2, '0')}-${x.shot}-${x.fault}-t${x.t}.jpg`, type: 'jpeg', quality: 70 })
    }
  }
  const S = await page.evaluate(() => window.__tp)
  const by = {}
  for (const x of S) {
    const k = x.shot || '?'
    by[k] ??= { n: 0, bad: {} }
    by[k].n++
    total.n++
    if (x.fault) {
      by[k].bad[x.fault] = (by[k].bad[x.fault] ?? 0) + 1
      total.bad[x.fault] = (total.bad[x.fault] ?? 0) + 1
    }
  }
  console.log(`run ${run} : ${S.length} échantillons`)
  for (const [k, v] of Object.entries(by)) console.log(`  ${k.padEnd(7)} ${v.n} éch., défauts ${JSON.stringify(v.bad)}`)
  await page.context().close()
}
const nb = Object.values(total.bad).reduce((a, b) => a + b, 0)
console.log(`TOTAL ${total.n} échantillons, ${nb} avec défaut (${((100 * nb) / total.n).toFixed(1)} %) ${JSON.stringify(total.bad)}`)
await browser.close()
