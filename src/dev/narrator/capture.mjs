// Contrôle de la page du narrateur dans Chrome :
//   node src/dev/narrator/capture.mjs [port] [--decode-all]
// - relève les ressources en erreur (404…) ;
// - capture la page (FR, EN) et un récitatif affiché (réplique sélectionnée dans la manche synthétique) ;
// - --decode-all : décode TOUS les MP3 du manifest avec Web Audio (decodeAudioData, ce que fera le jeu)
//   et compare leur durée à celle du manifest.
import { launch, newContext, collectLogs } from '../../../tools/lib/browser.mjs'

const port = process.argv.find(a => /^\d+$/.test(a)) ?? '8806'
const base = `http://localhost:${port}`
const out = 'shots/director'
const browser = await launch()
const ctx = await newContext(browser, { w: 1920, h: 1080 })
const page = await ctx.newPage()
const logs = collectLogs(page)
const failed = []
page.on('response', r => {
  if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
})

for (const lang of ['fr', 'en']) {
  await page.goto(`${base}/dev/narrator.html?lang=${lang}&color=${lang === 'fr' ? 5 : 8}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/page-${lang}.jpg`, type: 'jpeg', quality: 85 })
  // Réplique sélectionnée : le récitatif s'affiche dans la scène
  const items = page.locator('.cuelist li')
  const n = await items.count()
  await items.nth(Math.min(3, n - 1)).click()
  await page.waitForTimeout(400)
  await page.locator('.sim').screenshot({ path: `${out}/sim-${lang}.jpg`, type: 'jpeg', quality: 90 })
  await page.locator('.hints').screenshot({ path: `${out}/hints-${lang}.jpg`, type: 'jpeg', quality: 90 })
}

let decode = null
if (process.argv.includes('--decode-all')) {
  decode = await page.evaluate(async () => {
    const m = await (await fetch('/audio/narrator/manifest.json', { cache: 'no-store' })).json()
    const ac = new OfflineAudioContext(1, 24000, 24000)
    const bad = []
    let n = 0
    let maxDiff = 0
    let bytes = 0
    for (const l of m.lines) {
      try {
        const buf = await (await fetch(`/audio/narrator/${l.file}`)).arrayBuffer()
        bytes += buf.byteLength
        const audio = await ac.decodeAudioData(buf)
        maxDiff = Math.max(maxDiff, Math.abs(audio.duration - l.duration_s))
        if (Math.abs(audio.duration - l.duration_s) > 0.08) bad.push(`${l.file}: ${audio.duration.toFixed(3)} s ≠ ${l.duration_s}`)
        n++
      } catch (e) {
        bad.push(`${l.file}: ${e}`)
      }
    }
    return { decoded: n, total: m.lines.length, maxDiff: +maxDiff.toFixed(3), megabytes: +(bytes / 1e6).toFixed(2), bad: bad.slice(0, 20) }
  })
}

console.log(JSON.stringify({ failed, logs: logs.filter(l => /error|warn/i.test(l)).slice(-10), decode }, null, 1))
await browser.close()
