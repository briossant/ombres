// QA : les premières images de l'écran titre (raccord chargement → titre), en rafale.
import { ORIGIN, launch, newContext, makeShots, sleep, arg } from './lib.mjs'
const { shot, log } = makeShots(arg('name', 'titlecut'))
const browser = await launch()
for (let run = 0; run < Number(arg('runs', '2')); run++) {
  const ctx = await newContext(browser)
  const page = await ctx.newPage()
  await page.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'commit' })
  await page.waitForFunction(() => window.__ombres?.useUi.getState().screen === 'title', null, { timeout: 120000, polling: 16 })
  for (let i = 0; i < 8; i++) {
    const cam = await page.evaluate(() => ({ mode: window.__ombres.cameraCue.mode, t: window.__ombres.runner.sim?.state.sun.t }))
    await shot(page, `run${run}-${i}-${cam.mode}-t${cam.t?.toFixed(1)}`)
    await sleep(120)
  }
  await ctx.close()
}
await browser.close()
