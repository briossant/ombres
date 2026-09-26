// Non-régression (vague 2) : ce que la page nue télécharge pendant les N premières secondes du titre
// (build de production), requête par requête (octets reçus, y compris les flux média partiels).
//   URL=http://localhost:8862/ SECS=8 node tools/polish/verify2/netload.mjs
import { launch, newContext } from '../../lib/browser.mjs'

const URL = process.env.URL ?? 'http://localhost:8862/'
const SECS = Number(process.env.SECS ?? 8)
const browser = await launch()
const ctx = await newContext(browser)
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Network.enable')
const reqs = new Map()
cdp.on('Network.requestWillBeSent', e => reqs.set(e.requestId, { url: e.request.url, bytes: 0, done: false }))
cdp.on('Network.dataReceived', e => { const r = reqs.get(e.requestId); if (r) r.bytes += e.encodedDataLength || e.dataLength })
cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) { r.bytes = Math.max(r.bytes, e.encodedDataLength); r.done = true } })
const t0 = Date.now()
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('.title, [class*=title]') !== null, null, { timeout: 20000 }).catch(() => {})
await new Promise(r => setTimeout(r, SECS * 1000))
const by = {}
let total = 0
const media = []
for (const r of reqs.values()) {
  const k = r.url.match(/\/(audio\/\w+|assets|fonts|ui|textures)\//)?.[1] ?? 'autre'
  by[k] = (by[k] ?? 0) + r.bytes
  total += r.bytes
  if (/\/audio\/music\//.test(r.url)) media.push(`${(r.bytes / 1e6).toFixed(2)} Mo ${r.done ? 'fini' : 'en cours'} ${r.url.split('/').pop()}`)
}
console.log(`${URL} après ${((Date.now() - t0) / 1000).toFixed(1)} s : ${(total / 1e6).toFixed(2)} Mo, ${reqs.size} requêtes`)
console.log(Object.entries(by).map(([k, v]) => `${k} ${(v / 1e6).toFixed(2)}`).join(' | '))
console.log(media.join('\n'))
await browser.close()
