// Captures en série de la page de lookdev des oiseaux (un seul navigateur).
//   node src/dev/birds/shots.mjs <dossier> [--port=8802] [--w=1920 --h=1080] [--sheet=nom.jpg --tile=3x] nom=requête [nom=requête…]
// Exemple :
//   node src/dev/birds/shots.mjs shots/birds --sheet=sheet.jpg top="view=closeup&yaw=180&pitch=89" side="view=closeup&yaw=90&pitch=4"
// La planche (montage ImageMagick) réduit chaque capture de moitié.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext, collectLogs } from '../../../tools/lib/browser.mjs'

const args = process.argv.slice(2)
const outDir = args.shift()
const opt = {}
const jobs = []
for (const a of args) {
  if (a.startsWith('--')) {
    const i = a.indexOf('=')
    opt[a.slice(2, i < 0 ? undefined : i)] = i < 0 ? true : a.slice(i + 1)
  } else {
    const i = a.indexOf('=')
    jobs.push([a.slice(0, i), a.slice(i + 1)])
  }
}
const port = opt.port ?? 8802
const w = +(opt.w ?? 1920)
const h = +(opt.h ?? 1080)
mkdirSync(outDir, { recursive: true })
const browser = await launch()
const context = await newContext(browser, { w, h })
const page = await context.newPage()
const logs = collectLogs(page)
const files = []
for (const [name, query] of jobs) {
  const url = `http://localhost:${port}/dev/birds.html?${query}`
  await page.goto(url, { waitUntil: 'load' })
  try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 })
  } catch {
    logs.push(`[shots] timeout __ready ${name}`)
  }
  await page.waitForTimeout(+(opt.wait ?? 400))
  const file = join(outDir, `${name}.jpg`)
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 })
  files.push(file)
}
await browser.close()
const errs = logs.filter(l => /error|timeout/i.test(l) && !/favicon|404/.test(l))
if (errs.length) console.log(errs.slice(-10).join('\n'))
if (opt.sheet) {
  const out = join(outDir, opt.sheet)
  const cols = parseInt(opt.tile ?? '3', 10)
  const argv = []
  for (let i = 0; i < files.length; i += cols) argv.push('(', ...files.slice(i, i + cols), '-bordercolor', '#2b1d23', '-border', '2', '+append', ')')
  execFileSync('magick', [...argv, '-background', '#2b1d23', '-append', '-resize', '50%', '-quality', '88', out])
  console.log(out)
} else console.log(files.join('\n'))
