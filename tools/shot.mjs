// Capture d'écran d'une page du jeu.
//   node tools/shot.mjs <url> <out.jpg|png> [--w=1920 --h=1080] [--mobile="iPhone 15 Pro"] [--landscape]
//                       [--wait=1500] [--ready] [--eval="js à exécuter avant la capture"] [--no-vsync]
// --ready attend window.__ready === true (à exposer par les pages de lookdev / le jeu).
// Préférer .jpg (0,2 s) à .png (1,7 s) pour les scènes 3D.
import { launch, newContext, collectLogs, gpuRenderer } from './lib/browser.mjs'

const [url, out = 'shot.jpg', ...rest] = process.argv.slice(2)
if (!url) {
  console.error('usage: node tools/shot.mjs <url> <out> [options]')
  process.exit(2)
}
const opt = Object.fromEntries(rest.map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))
const browser = await launch({ noVsync: !!opt['no-vsync'] })
const context = await newContext(browser, { w: +(opt.w ?? 1920), h: +(opt.h ?? 1080), mobile: opt.mobile === true ? 'iPhone 15 Pro' : opt.mobile, landscape: !!opt.landscape })
const page = await context.newPage()
const logs = collectLogs(page)
await page.goto(url, { waitUntil: 'load' })
const gpu = await gpuRenderer(page)
if (/SwiftShader/.test(gpu) && !process.env.SOFTWARE_GL) console.warn('ATTENTION : rendu logiciel', gpu)
if (opt.ready) {
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }) } catch { logs.push('[shot] timeout __ready') }
}
if (opt.eval) await page.evaluate(opt.eval)
await page.waitForTimeout(+(opt.wait ?? 1500))
await page.screenshot({ path: out, ...(/\.jpe?g$/.test(out) ? { type: 'jpeg', quality: 85 } : {}) })
console.log(JSON.stringify({ out, gpu, logs: logs.slice(-15) }, null, 1))
await browser.close()
