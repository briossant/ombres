// Mesure le coût CPU RÉEL du moteur audio en temps réel : temps CPU consommé par le thread de
// rendu WebAudio de Chrome (« AudioOutputDevi… », lu dans /proc) pendant chaque phase d'une
// manche jouée par la page dev/audio.html. Résultat en % d'un cœur.
//   node tools/audio-cpu.mjs [--port=8804] [--window=8]
import { readdirSync, readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { launch, newContext } from './lib/browser.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))
const port = opt.port ?? 8804
const win = Number(opt.window ?? 8)
const CLK = 100 // ticks par seconde (/proc/…/stat)

function audioThreads() {
  const out = new Map()
  for (const pid of readdirSync('/proc').filter(x => /^\d+$/.test(x))) {
    let tasks = []
    try { tasks = readdirSync(`/proc/${pid}/task`) } catch { continue }
    for (const t of tasks) {
      try {
        if (/^AudioOutputDevi/.test(readFileSync(`/proc/${pid}/task/${t}/comm`, 'utf8'))) out.set(`${pid}/${t}`, cpuOf(pid, t))
      } catch { /* thread terminé */ }
    }
  }
  return out
}
function cpuOf(pid, t) {
  const f = readFileSync(`/proc/${pid}/task/${t}/stat`, 'utf8').split(') ')[1].split(' ')
  return (Number(f[11]) + Number(f[12])) / CLK // utime + stime (s)
}

// page servie hors Vite (pas de rechargement HMR pendant la mesure)
const bundle = await build({
  entryPoints: ['src/dev/audio/realtime-entry.ts'], bundle: true, format: 'iife', write: false, target: 'es2022',
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env': '{"BASE_URL":"/"}' }, logLevel: 'error',
})
const before = audioThreads()
const browser = await launch()
const ctx = await newContext(browser, { w: 1280, h: 800 })
const page = await ctx.newPage()
const host = `http://localhost:${port}`
const query = opt.latency ? `?audioLatency=${opt.latency}` : ''
await page.route(`${host}/__audio_rt__.html${query}`, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>audio temps réel</body></html>' }))
await page.route(`${host}/__audio_rt__.js`, r => r.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text }))
await page.goto(`${host}/__audio_rt__.html${query}`)
await page.addScriptTag({ url: `${host}/__audio_rt__.js` })
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })
await page.waitForTimeout(1500)
const mine = [...audioThreads().keys()].filter(k => !before.has(k))
if (mine.length !== 1) console.warn('threads audio candidats :', mine)
const [pid, tid] = mine[0].split('/')
const measure = async (label, setup) => {
  await page.evaluate(setup)
  await page.waitForTimeout(1000)
  const c0 = cpuOf(pid, tid), t0 = Date.now()
  await page.waitForTimeout(win * 1000)
  const pct = ((cpuOf(pid, tid) - c0) / ((Date.now() - t0) / 1000)) * 100
  console.log(`${label.padEnd(28)} ${pct.toFixed(1).padStart(5)} % d'un cœur`)
}
const go = (screen, t) => new Function(`window.__rt.go(${JSON.stringify(screen)}, ${t ?? -3})`)
if (opt.experiment) {
  await page.evaluate(n => window.__rt.experiment(n), String(opt.experiment))
  for (let i = 0; i < Number(opt.n ?? 8); i++) {
    const c0 = cpuOf(pid, tid), t0 = Date.now()
    await page.waitForTimeout(5000)
    console.log(`${opt.experiment} ${String(i * 5).padStart(3)} s : ${(((cpuOf(pid, tid) - c0) / ((Date.now() - t0) / 1000)) * 100).toFixed(1).padStart(5)} %`)
  }
  await browser.close()
  process.exit(0)
}
if (opt.probe) {
  // série temporelle : un scénario fixe, mesuré toutes les 5 s (détecte une dérive du coût)
  const [screen, t] = String(opt.probe).split(':')
  for (const part of opt.disable ? String(opt.disable).split(',') : []) await page.evaluate(p => window.__rt.disable(p), part)
  await page.evaluate(go(screen, t !== undefined ? Number(t) : undefined))
  for (let i = 0; i < Number(opt.n ?? 8); i++) {
    const c0 = cpuOf(pid, tid), t0 = Date.now()
    await page.waitForTimeout(5000)
    const st = await page.evaluate(() => window.__rt.stats?.() ?? '')
    console.log(`${opt.probe} ${String(i * 5).padStart(3)} s : ${(((cpuOf(pid, tid) - c0) / ((Date.now() - t0) / 1000)) * 100).toFixed(1).padStart(5)} %  ${st}`)
  }
  await browser.close()
  process.exit(0)
}
await measure('repos (rien)', () => {})
await measure('écran titre (piste + démo)', go('title'))
await measure('lobby (boucle + ambiance)', go('lobby'))
await measure('manche : compte à rebours', go('round', -3))
for (const t of [5, 20, 60, 88, 99]) await measure(`manche : t = ${t} s`, go('round', t))
await measure('résultats (piste)', go('roundResults'))
console.log('charge machine :', readFileSync('/proc/loadavg', 'utf8').trim())
await browser.close()
