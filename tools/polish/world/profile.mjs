// Correcteur world (polish W3) : coût GPU par passe (timer queries, ?debug) de la page de lookdev
// du monde, puis coût de chaque famille d'objets (masquée une à une) : où passent les millisecondes.
//   PORT=8832 node --import ./tools/polish/world/nohmr.mjs tools/polish/world/profile.mjs ["kf=3.5&np=12&q=high"] [--frames=240]
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, sleep, gpuBusyAvg } from '../tech/common.mjs'

const params = process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'kf=3.5&np=12&q=high'
const WAIT = Number(process.argv.find(a => a.startsWith('--wait='))?.split('=')[1] ?? '4500')
const browser = await launch()
const ctx = await newContext(browser)
const page = await ctx.newPage()
await page.goto(`${ORIGIN}/dev/world.html?${params}&debug`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 })
await sleep(3000)
const read = async () => {
  await sleep(WAIT)
  return page.evaluate(() => ({ ...(window.__timings ?? {}) }))
}
const fmt = t => `total ${t.total?.toFixed(2)} [sh ${t.shadow?.toFixed(2)} gb ${t.gbuffer?.toFixed(2)} ink ${t.ink?.toFixed(2)} smaa ${t.smaa?.toFixed(2) ?? '-'}]`
console.log(`gpu_busy au repos : ${await gpuBusyAvg(6, 80)} %  (${params})`)
const base = await read()
console.log('complet          ', fmt(base))
const groups = await page.evaluate(() => {
  const names = []
  window.__scene.traverse(o => {
    if (o.parent === window.__scene || o.parent?.parent === window.__scene) if (o.name && !names.includes(o.name)) names.push(o.name)
  })
  return names
})
for (const name of groups) {
  await page.evaluate(n => {
    window.__scene.traverse(o => {
      if (o.name === n) o.visible = false
    })
  }, name)
  const t = await read()
  console.log(`sans ${name.padEnd(12)}`, fmt(t), `Δgb ${(base.gbuffer - t.gbuffer).toFixed(2)}`)
  await page.evaluate(n => {
    window.__scene.traverse(o => {
      if (o.name === n) o.visible = true
    })
  }, name)
}
await browser.close()
