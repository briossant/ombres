// Revue DA : galerie des écrans du téléphone (page de dev, vraie app) sur iPhone 15 Pro et Pixel 7, paysage.
//   PORT=8821 node tools/polish/art/phones.mjs [--name=phones]
import { ORIGIN, launch, newContext, sleep, arg } from '../../e2e/qa/lib.mjs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dirname, '../../../shots/polish/art', arg('name', 'phones'))
mkdirSync(dir, { recursive: true })
const SCEN = ['play-target', 'play-hunted', 'play-stunned', 'play-hidden', 'roundEnd-winner', 'matchEnd-winner', 'matchEnd', 'reconnect', 'paused', 'spectate', 'settings', 'countdown']
const browser = await launch()
for (const dev of ['iPhone 15 Pro', 'Pixel 7']) {
  const ctx = await newContext(browser, { mobile: dev, landscape: true })
  const page = await ctx.newPage()
  for (const s of SCEN) {
    await page.goto(`${ORIGIN}/dev/phone.html?s=${s}&lang=fr&color=3`, { waitUntil: 'load' })
    await sleep(1200)
    await page.screenshot({ path: join(dir, `${dev.replace(/ /g, '')}-${s}.jpg`), type: 'jpeg', quality: 82 })
    if (s === 'play-target') {
      const r = await page.evaluate(() => {
        const q = sel => document.querySelector(sel)?.getBoundingClientRect()
        return { vw: innerWidth, vh: innerHeight, dive: q('.act--dive'), star: q('.act__star'), flap: q('.act--flap') }
      })
      console.log(dev, JSON.stringify(r))
    }
  }
  await ctx.close()
}
await browser.close()
