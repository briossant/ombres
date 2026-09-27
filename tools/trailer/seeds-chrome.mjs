// Choix de la graine de la manche filmée, rejouée dans Chrome (même moteur JavaScript que le jeu filmé).
//   node tools/trailer/seeds-chrome.mjs [--from=1] [--n=300] [--top=12]
//   node tools/trailer/seeds-chrome.mjs --seed=27            → journal détaillé
import { join } from 'node:path'
import { build } from 'esbuild'
import { browser, closeBrowser } from './lib/stage.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const entry = `import { playRound, score } from ${JSON.stringify(join(import.meta.dirname, 'seeds.ts'))}\nwindow.__seeds = { playRound, score }`
const b = await build({ stdin: { contents: entry, resolveDir: import.meta.dirname, loader: 'ts' }, bundle: true, format: 'iife', write: false, target: 'es2022', logLevel: 'error' })
const page = await (await (await browser()).newContext()).newPage()
await page.setContent('<html></html>')
await page.addScriptTag({ content: b.outputFiles[0].text })
if (opt.seed) {
  const r = await page.evaluate(s => {
    const l = window.__seeds.playRound(s)
    return { ...window.__seeds.score(l), log: l }
  }, Number(opt.seed))
  const l = r.log
  const f = x => x.toFixed(1)
  console.log(`graine ${opt.seed} : ${r.score} · ${r.why.join(' · ')}`)
  console.log(`classement ${l.rank.join(' ')} · parts ${l.shares.slice(0, 6).map(x => (x * 100).toFixed(1)).join(' ')}`)
  console.log(`phases ${l.phases.map(p => `${p.phase}@${f(p.t)}`).join(' ')} · nuit ${f(l.nightT)}`)
  console.log(`touches ${l.hits.map(h => `${f(h.t)}:${h.hunter}>${h.target}(${h.stolen}${h.crown ? ',couronne' : ''})`).join(' ')}`)
  console.log(`ratés ${l.misses.map(m => `${f(m.t)}:${m.hunter}>${m.target}${m.dodged ? '(esquive)' : ''}`).join(' ')}`)
  console.log(`couronnes ${l.crowns.map(c => `${f(c.t)}:${c.slot}`).join(' ')}`)
} else {
  const from = Number(opt.from ?? 1)
  const n = Number(opt.n ?? 300)
  const t0 = Date.now()
  const rows = await page.evaluate(([from, n]) => {
    const out = []
    for (let s = from; s < from + n; s++) out.push({ seed: s, ...window.__seeds.score(window.__seeds.playRound(s)) })
    return out.sort((a, b) => b.score - a.score)
  }, [from, n])
  for (const r of rows.slice(0, Number(opt.top ?? 12))) console.log(`${r.seed}\t${r.score.toFixed(1)}\t${r.why.join(' · ')}`)
  console.log(`${n} manches en ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}
await closeBrowser()
