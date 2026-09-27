// Rend les cartons de la bande-annonce (dev/trailer.html, src/dev/trailer/) image par image, en temps
// virtuel, fond transparent : marketing/work/clips/card-<id>.mov (PNG avec alpha, 60 i/s) ; le cadre de
// téléphone en PNG fixe (card-phone.png).
//   node tools/trailer/cards.mjs [--only=recit-noon,final-a] [--preview=0.4,1.5,3]  (aperçus JPEG sur fond)
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openPage, waitFor, closeBrowser, CLIPS, WORK, FFMPEG } from './lib/stage.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const ALL = ['recit-noon', 'cap-paint', 'cap-phone', 'recit-golden', 'cap-dive', 'recit-night', 'recit-win', 'cap-win', 'howto', 'final-a', 'final-b', 'phone']
const ONLY = opt.only ? opt.only.split(',') : ALL
const PREVIEW = opt.preview ? opt.preview.split(',').map(Number) : null
mkdirSync(CLIPS, { recursive: true })

async function openCard(id) {
  const vertical = id === 'vertical'
  const page = await openPage({ path: `/dev/trailer.html?card=${id}`, w: vertical ? 1080 : 1920, h: vertical ? 1920 : 1080 })
  await waitFor(page, () => window.__card?.ready === true, null, 60000, `carton ${id}`)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  // le temps du carton part de zéro au premier pas manuel
  await page.evaluate(() => window.__vt.setManual(true))
  const dur = await page.evaluate(() => window.__card.dur)
  return { page, cdp, dur }
}
const png = async cdp => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')

for (const id of ONLY) {
  const t0 = Date.now()
  const { page, cdp, dur } = await openCard(id)
  if (id === 'phone') {
    await page.evaluate(() => window.__vt.step(1000 / 60))
    const buf = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 768, height: 389, scale: 1 } })).data, 'base64')
    writeFileSync(join(CLIPS, 'card-phone.png'), buf)
    console.log('card-phone.png')
    await page.context().close()
    continue
  }
  if (PREVIEW) {
    const dir = join(WORK, 'preview')
    mkdirSync(dir, { recursive: true })
    let now = 0
    for (const at of PREVIEW) {
      await page.evaluate(ms => window.__vt.advance(ms, 1000 / 60), (at - now) * 1000)
      now = at
      writeFileSync(join(dir, `${id}@${at}.png`), await png(cdp))
    }
    console.log(`aperçus ${id}`)
    await page.context().close()
    continue
  }
  const out = join(CLIPS, `card-${id}.mov`)
  // la version verticale (25 s, 1080 × 1920) est rendue à 30 i/s : ses légendes n'ont pas besoin de plus
  const fps = id === 'vertical' ? 30 : 60
  const ffv = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', '-c:v', 'png', '-pix_fmt', 'rgba', out], { stdio: ['pipe', 'inherit', 'inherit'] })
  const doneV = new Promise((res, rej) => ffv.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}`)))))
  const n = Math.round(dur * fps)
  for (let i = 0; i < n; i++) {
    await page.evaluate(ms => window.__vt.step(ms), 1000 / fps)
    const buf = await png(cdp)
    if (!ffv.stdin.write(buf)) await new Promise(r => ffv.stdin.once('drain', r))
  }
  ffv.stdin.end()
  await doneV
  console.log(`card-${id}.mov : ${n} images (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  await page.context().close()
}
await closeBrowser()
