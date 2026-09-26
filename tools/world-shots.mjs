// Série de captures de la page de lookdev du monde, dans UN seul navigateur :
//   node tools/world-shots.mjs [--port=8801] [--set=keys|presets|all] [--out=shots/world/set] [--timings]
// Chaque capture attend window.__ready ; avec --timings, on relève window.__timings (GPU par passe,
// médianes) après ~3 s de rendu. Les noms de fichiers sont stables pour comparer les itérations.
import { mkdirSync, writeFileSync } from 'node:fs'
import { launch, newContext, gpuRenderer } from './lib/browser.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))
const port = opt.port ?? 8801
const out = opt.out ?? 'shots/world/set'
const set = opt.set ?? 'keys'
mkdirSync(out, { recursive: true })

const KEYS = [
  ['kf80', 'kf=80'],
  ['kf50', 'kf=50'],
  ['kf25', 'kf=25'],
  ['kf16', 'kf=16'],
  ['kf10', 'kf=10'],
  ['kf3', 'kf=3.5'],
  ['kf1', 'kf=1'],
  ['grande-ombre', 'night=0.5'],
  ['resultats', 'results=1&cam=top'],
  ['plan-bas-kf10', 'kf=10&cam=low'],
  ['plan-bas-kf3', 'kf=3.5&cam=low'],
  ['plan-bas-est-kf16', 'kf=16&cam=lowe'],
  ['daltonien-kf50', 'kf=50&cb=1'],
  ['daltonien-kf3', 'kf=3.5&cb=1'],
]
const PRESETS = [
  ['q-low', 'kf=16&q=low'],
  ['q-medium', 'kf=16&q=medium'],
  ['q-high', 'kf=16&q=high'],
]
const list = set === 'presets' ? PRESETS : set === 'all' ? [...KEYS, ...PRESETS] : set === 'keys' ? KEYS : KEYS.filter(([n]) => set.split(',').includes(n))

const browser = await launch({ noVsync: !!opt.timings })
const ctx = await newContext(browser, { w: 1920, h: 1080 })
const report = {}
for (const [name, q] of list) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 300)) })
  const url = `http://localhost:${port}/dev/world.html?${q}${opt.timings ? '&debug' : ''}`
  await page.goto(url, { waitUntil: 'load' })
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }) } catch { errors.push('timeout __ready') }
  await page.waitForTimeout(opt.timings ? 4500 : 900)
  const file = `${out}/${name}.jpg`
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 })
  const t = opt.timings ? await page.evaluate(() => ({ timings: window.__timings, info: window.__nprInfo })) : null
  report[name] = { file, errors, ...(t ?? {}) }
  console.log(name.padEnd(20), errors.length ? `ERR ${errors[0]}` : 'ok', t?.timings ? JSON.stringify(t.timings) : '')
  await page.close()
}
report.gpu = await (async () => { const p = await ctx.newPage(); const r = await gpuRenderer(p); await p.close(); return r })()
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1))
await browser.close()
