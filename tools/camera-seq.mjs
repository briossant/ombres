// Séquences de captures de la page de mise en scène (dev/camera.html) pour juger le mouvement.
//   node tools/camera-seq.mjs <nom> "<requête>" [--frames=8] [--every=1000] [--start=600]
//        [--w=1280 --h=720] [--tile=4x] [--at="ms:js;ms:js"] [--port=8812] [--label]
// Écrit shots/staging/<nom>/NN.jpg et la planche shots/staging/<nom>.jpg (ImageMagick montage).
// --at : scripts exécutés dans la page à des instants donnés (ms après le départ), ex.
//        --at="1500:__cam.fireDive()".
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { launch, newContext, collectLogs } from './lib/browser.mjs'

const [name, query = '', ...rest] = process.argv.slice(2)
if (!name) {
  console.error('usage: node tools/camera-seq.mjs <nom> "<requête>" [options]')
  process.exit(2)
}
const opt = Object.fromEntries(rest.map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))
const frames = +(opt.frames ?? 8)
const every = +(opt.every ?? 1000)
const start = +(opt.start ?? 600)
const port = opt.port ?? 8812
const dir = `shots/staging/${name}`
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

const browser = await launch()
const context = await newContext(browser, { w: +(opt.w ?? 1280), h: +(opt.h ?? 720) })
const page = await context.newPage()
const logs = collectLogs(page)
await page.goto(`http://localhost:${port}${opt.page ?? '/dev/camera.html'}?${query}`, { waitUntil: 'load' })
try {
  if (opt.page) await page.waitForTimeout(+(opt.boot ?? 8000))
  else await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })
} catch {
  logs.push('[seq] timeout __ready')
}
const at = String(opt.at ?? '')
  .split(';')
  .filter(Boolean)
  .map((s) => { const i = s.indexOf(':'); return { ms: +s.slice(0, i), js: s.slice(i + 1), done: false } })
const t0 = Date.now()
const runAt = async () => {
  for (const a of at) if (!a.done && Date.now() - t0 >= a.ms) { a.done = true; await page.evaluate(a.js) }
}
const wait = async (until) => { while (Date.now() - t0 < until) { await runAt(); await page.waitForTimeout(Math.min(50, until - (Date.now() - t0))) } }
const files = []
for (let i = 0; i < frames; i++) {
  await wait(start + i * every)
  await runAt()
  const f = `${dir}/${String(i).padStart(2, '0')}.jpg`
  await page.screenshot({ path: f, type: 'jpeg', quality: 82 })
  const info = await page.evaluate(() => { const c = window.__cam ?? window.__ombres; const s = c?.gameView?.sim; return `${c?.state?.mode ?? c?.cameraCue?.mode ?? ''} ${c?.state?.shot ?? ''} t=${s ? s.sun.t.toFixed(1) : '-'}` })
  files.push({ f, info, ms: Date.now() - t0 })
}
await browser.close()
const labels = opt.label !== 'false'
const args = []
for (const { f, info, ms } of files) args.push('-label', labels ? `${(ms / 1000).toFixed(1)}s ${info}` : '', f)
const font = process.env.SEQ_FONT ?? (() => { try { return execFileSync('sh', ['-c', "fc-list : file | grep -iE 'Mono.*\.ttf' | head -1"]).toString().trim().replace(/:\s*$/, '') } catch { return '' } })()
execFileSync('montage', [...(font ? ['-font', font] : []), ...args, '-tile', opt.tile ?? '3x', '-geometry', (opt.geom ?? '640x360+3+3'), '-pointsize', '18', `shots/staging/${name}.jpg`])
console.log(JSON.stringify({ sheet: `shots/staging/${name}.jpg`, frames: files.map((x) => `${x.f} @${x.ms}ms ${x.info}`), logs: logs.filter((l) => !/\[vite\]|DevTools|Download the React/.test(l)).slice(-12) }, null, 1))
