// Galerie des états du téléphone (page de dev = vraie app + faux PC) sur plusieurs appareils,
// avec mesure des débordements (boutons hors écran, textes coupés).
//   Copie du correcteur phone (sortie dans shots/polish/fix-phone/phonegallery ; iPhone SE paysage = 568 × 320, + 667 × 340).
//   PORT=8835 node tools/polish/phone/phonegallery.mjs
import { ORIGIN, launch, makeShots, sleep, overflowCheck } from '../firsttime/ft.mjs'
import { devices } from 'playwright-core'

const { shot, log } = makeShots('../fix-phone/phonegallery')
const browser = await launch()
const DEVICES = [
  ['iPhone 15 Pro', true],
  ['iPhone SE', true],
  ['Pixel 7', true],
  ['iPhone 15 Pro', false],
  ['iPhone 8', true, { width: 667, height: 340 }],
]
const SCEN = ['lobby', 'intro', 'play', 'play-target', 'play-hunted', 'play-stunned', 'play-hidden', 'roundEnd', 'roundEnd-winner', 'matchEnd', 'matchEnd-winner', 'spectate', 'paused', 'settings']
for (const lang of ['fr', 'en']) {
  for (const [dev, land, vp] of DEVICES) {
    const { defaultBrowserType: _i, ...d } = devices[dev]
    const ctx = await browser.newContext({ ...d, locale: lang === 'fr' ? 'fr-FR' : 'en-US', viewport: vp ?? (land ? { width: d.viewport.height, height: d.viewport.width } : d.viewport) })
    const page = await ctx.newPage()
    for (const s of SCEN) {
      if (!land && !['play', 'play-target', 'lobby', 'roundEnd', 'matchEnd'].includes(s)) continue
      if (dev === 'Pixel 7' && lang === 'en' && !['play-target', 'lobby', 'matchEnd', 'roundEnd'].includes(s)) continue
      await page.goto(`${ORIGIN}/dev/phone.html?s=${s}&lang=${lang}&color=3`, { waitUntil: 'load' })
      await sleep(s === 'play-hunted' ? 1400 : 900)
      const tag = `${lang}-${dev.replace(/ /g, '')}${vp ? `-${vp.width}x${vp.height}` : ''}${land ? '' : '-portrait'}-${s}`
      await shot(page, tag)
      const o = await overflowCheck(page, ['.act--dive', '.act--flap', '.act__star', '.band', '.lobby-rules', '.stick', '.lobby-goals', '.btn', '.recitatif', '.act-callout'])
      const bad = o.filter(x => x.outX || x.outY)
      if (bad.length) log(`${tag} DÉBORDE : ${JSON.stringify(bad)}`)
      const cut = await page.evaluate(() => [...document.querySelectorAll('button, .btn, .recitatif, h1, p, .t-title, .goal__label, .act__label')].filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible').map(e => e.innerText.slice(0, 40)))
      if (cut.length) log(`${tag} TEXTE COUPÉ : ${JSON.stringify(cut)}`)
    }
    await ctx.close()
  }
}
await browser.close()
