// Ressenti côté téléphone (critique game feel) : iPhone 15 Pro (paysage) + Pixel 7 + bots par défaut
// (2 humains → Pie, Guetteur), une manche à vitesse réelle. Pilotes « appliqués » au toucher (CDP) :
// peinture au ras du sable, chasse, PIQUER au chevron, COUP D'AILE au clac. Enregistre l'écran des deux
// téléphones autour des événements qui les concernent, journalise navigator.vibrate (Pixel) et les
// flashs de bordure, et prend des images du PC.
//   PORT=8822 node tools/polish/feel/phones.mjs --name=phones
import { writeFileSync } from 'node:fs'
import { join as pjoin } from 'node:path'
import { ORIGIN, outDir, sleep, waitFor, arg, installTap, drainTap, Recorder } from './lib.mjs'
import { installBrain } from './pilot.mjs'
import { launch, newContext, collectLogs } from '../../lib/browser.mjs'

const name = arg('name', 'phones')
const dir = outDir(name)
const t0 = Date.now()
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`)
const browser = await launch()
const pcCtx = await newContext(browser)
const pc = await pcCtx.newPage()
const pcLogs = collectLogs(pc)
await pc.addInitScript(() => {
  try {
    localStorage.setItem('ombres.settings.v1', JSON.stringify({ lang: 'fr', quality: 'medium', hints: 'auto' }))
  } catch {}
})
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title' && !!window.__ombres?.useLobby.getState().joinUrl, null, 120000, 'titre + salle')
const joinUrl = await pc.evaluate(() => window.__ombres.useLobby.getState().joinUrl)
const u = new URL(joinUrl)
const phoneUrl = `${ORIGIN}${u.pathname}${u.search}`
log(`join ${joinUrl}`)

const tp = (id, x, y) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })
async function newPhone(device, tag) {
  const ctx = await newContext(browser, { mobile: device, landscape: true })
  const page = await ctx.newPage()
  const logs = collectLogs(page)
  await page.addInitScript(() => {
    window.__vib = []
    const orig = navigator.vibrate?.bind(navigator)
    if (orig) navigator.vibrate = p => { window.__vib.push({ w: Date.now(), p: Array.isArray(p) ? [...p] : [p] }); return true }
  })
  const cdp = await ctx.newCDPSession(page)
  return { ctx, page, logs, cdp, device, tag }
}
const center = async (page, sel) => {
  const b = await page.locator(sel).first().boundingBox()
  if (!b) throw new Error(`introuvable ${sel}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }
}
async function tap(ph, sel) {
  const c = await center(ph.page, sel)
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(9, c.x, c.y)] })
  await sleep(70)
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
async function joinRoom(ph, nm, swatch) {
  await ph.page.goto(phoneUrl, { waitUntil: 'load' })
  await waitFor(ph.page, () => !!document.querySelector('.profile'), null, 20000, `profil ${nm}`)
  await sleep(400)
  await ph.page.fill('#phone-name', nm)
  if (swatch != null) await ph.page.locator('.swatch').nth(swatch).click()
  await ph.page.locator('.profile__go').click()
  await waitFor(ph.page, () => !!document.querySelector('.lobby-goals'), null, 10000, `salon ${nm}`)
}
const A = await newPhone('iPhone 15 Pro', 'iphone')
const SOLO = process.argv.includes('--solo')
const B = SOLO ? null : await newPhone('Pixel 7', 'pixel')
await joinRoom(A, 'Solène', null)
await sleep(800)
if (B) await joinRoom(B, 'Malo', null)
await sleep(2500)
await A.page.screenshot({ path: join2('A-lobby-1.jpg'), type: 'jpeg', quality: 85 })
function join2(f) {
  return pjoin(dir, f)
}
// Salon : quelques secondes au joystick (le mannequin, la carte des règles)
await A.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, 200, 250)] })
await A.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, 250, 220)] })
await sleep(600)
await A.page.screenshot({ path: join2('A-lobby-thumb.jpg'), type: 'jpeg', quality: 85 })
await A.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await sleep(3000)
await A.page.screenshot({ path: join2('A-lobby-2.jpg'), type: 'jpeg', quality: 85 })
if (B) await B.page.screenshot({ path: join2('B-lobby.jpg'), type: 'jpeg', quality: 85 })
if (SOLO) {
  await pc.evaluate(() => { const o = window.__ombres; for (const p of o.useRoster.getState().slots.filter(s => s.kind === 'bot')) o.runner.removeBot(p.slot); o.runner.addBot('ploughman', 0); o.runner.addBot('falcon', 2); o.runner.addBot('magpie', 1) })
  await sleep(800)
}
await pc.screenshot({ path: join2('pc-lobby.jpg'), type: 'jpeg', quality: 80 })
const roster = await pc.evaluate(() => window.__ombres.useRoster.getState().slots.map(s => ({ slot: s.slot, kind: s.kind, name: s.name, color: s.colorIndex, bot: s.bot })))
log(JSON.stringify(roster))
const slotA = roster.find(r => r.name === 'Solène').slot
const slotB = B ? roster.find(r => r.name === 'Malo').slot : -1
await installTap(pc)
await installBrain(pc)

// Pilote tactile
class TouchPilot {
  constructor(ph, slot) {
    this.ph = ph
    this.slot = slot
    this.on = false
    this.pts = new Map()
    this.handled = new Set()
    this.stats = { flaps: 0, late: [] }
  }
  send(type) {
    if (type === 'touchEnd' && this.pts.size) type = 'touchMove'
    return this.ph.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [...this.pts.values()] })
  }
  async start() {
    this.on = true
    this.loop = this.run().catch(e => console.log(`[pilot ${this.ph.tag}] ${e.message}`))
  }
  async stop() {
    this.on = false
    await this.loop
  }
  async run() {
    while (this.on) {
      const d = await pc.evaluate(([s, solo]) => {
        const r = window.__feelBrain?.(s, { hunt: true, huntEvery: 12 }) ?? null
        if (!r || !solo) return r
        const b = window.__ombres.runner.sim.state.bySlot[s]
        // solo : haut (chasseur) avant 45 s, bas (proie) ensuite ; PIQUER tenu dès le chevron
        r.dive = r.t < 45 ? (b.lockTarget >= 0 || b.dive !== 'none') : true
        return r
      }, [this.slot, SOLO]).catch(() => null)
      const zone = await this.ph.page.locator('.stick-zone').first().boundingBox().catch(() => null)
      if (!d || !zone) {
        if (this.pts.size) {
          this.pts.clear()
          await this.send('touchEnd').catch(() => {})
        }
        await sleep(250)
        continue
      }
      const sx = zone.x + zone.width * 0.45
      const sy = zone.y + zone.height * 0.55
      if (!this.pts.has(1)) {
        this.pts.set(1, tp(1, sx, sy))
        await this.send('touchStart')
        await sleep(30)
      }
      let hx = d.hx
      let hy = d.hy
      if (d.threat && d.threat.kind === 'commit' && !this.handled.has(d.threat.w)) {
        this.handled.add(d.threat.w)
        const wait = 230 + Math.random() * 90 - (Date.now() - d.threat.w)
        if (wait > 0) await sleep(wait)
        if (d.flapDir) {
          hx = d.flapDir.x
          hy = d.flapDir.y
        }
        this.pts.set(1, tp(1, sx + hx * 60, sy - hy * 60))
        await this.send('touchMove')
        const f = await center(this.ph.page, '.act--flap').catch(() => null)
        if (f) {
          this.pts.set(3, tp(3, f.x, f.y))
          await this.send('touchStart')
          await sleep(60)
          this.pts.delete(3)
          await this.send('touchEnd')
          this.stats.flaps++
          this.stats.late.push(Date.now() - d.threat.w)
        }
        continue
      }
      this.pts.set(1, tp(1, sx + hx * 60, sy - hy * 60))
      await this.send('touchMove')
      const diving = this.pts.has(2)
      if (d.dive && !diving) {
        const c = await center(this.ph.page, '.act--dive').catch(() => null)
        if (c) {
          this.pts.set(2, tp(2, c.x, c.y))
          await this.send('touchStart')
        }
      } else if (!d.dive && diving) {
        this.pts.delete(2)
        await this.send('touchEnd')
      }
      await sleep(60)
    }
    if (this.pts.size) {
      this.pts.clear()
      await this.send('touchEnd').catch(() => {})
    }
  }
}

const recA = new Recorder(A.cdp, dir, { overviewMs: 3000, maxWidth: 1200, maxHeight: 1200, quality: 70 })
recA.tag = 'A'
await recA.start()
const recPC = new Recorder(await pcCtx.newCDPSession(pc), dir, { overviewMs: 4000, quality: 55 })
recPC.tag = 'pc'
await recPC.start()
await tap(A, '.band__start')
await waitFor(pc, () => ['rules', 'game'].includes(window.__ombres?.useUi.getState().screen), null, 10000, 'cartes')
await sleep(1500)
await A.page.screenshot({ path: join2('A-rules.jpg'), type: 'jpeg', quality: 85 })
for (const ph of [A, B].filter(Boolean)) {
  const ok = await ph.page.locator('.intro__foot .btn').first().isVisible().catch(() => false)
  if (ok) await tap(ph, '.intro__foot .btn')
}
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 15000, 'manche')
const pA = new TouchPilot(A, slotA)
const pB = B ? new TouchPilot(B, slotB) : null
await pA.start()
if (pB) await pB.start()
let n = 0
const events = []
while ((await pc.evaluate(() => window.__ombres.useUi.getState().screen)) !== 'roundResults') {
  for (const e of await drainTap(pc)) {
    events.push(e)
    const E = e.e
    if (!E) {
      log(`${e.k} ${e.v}`)
      continue
    }
    const mine = s => s === slotA
    const lab = x => `${String(++n).padStart(3, '0')}-${x}`
    if (E.type === 'lock' && mine(E.hunter)) recA.mark(lab(`A-lock-t${E.target}`), e.w, 200, 900)
    if (E.type === 'diveWindup' && mine(E.target)) recA.mark(lab(`A-windup-on-me`), e.w, 300, 1800)
    if (E.type === 'diveWindup' && mine(E.hunter)) recA.mark(lab(`A-my-windup`), e.w, 300, 1800)
    if ((E.type === 'diveHit' || E.type === 'diveMiss') && (mine(E.target) || mine(E.hunter))) {
      recA.mark(lab(`A-${E.type}-${mine(E.hunter) ? 'hunter' : 'target'}`), e.w, 300, 1600)
      recPC.mark(lab(`PC-${E.type}-A${mine(E.hunter) ? 'hunter' : 'target'}`), e.w, 800, 1600)
    }
    if (E.type === 'phase' && E.phase === 'greatShadow') recA.mark(lab('A-greatShadow'), e.w, 200, 2500)
    if (E.type === 'lastSeconds' && E.n === 3) recA.mark(lab('A-last3'), e.w, 200, 3500)
    if (!['lock', 'unlock', 'flap', 'bump', 'hidden', 'storm', 'towerBump', 'countdown'].includes(E.type)) log(`ev t=${e.t?.toFixed?.(1)} ${JSON.stringify(E)}`)
  }
  await sleep(120)
}
await pA.stop()
if (pB) await pB.stop()
await sleep(6000)
await A.page.screenshot({ path: join2('A-roundEnd.jpg'), type: 'jpeg', quality: 85 })
if (B) await B.page.screenshot({ path: join2('B-roundEnd.jpg'), type: 'jpeg', quality: 85 })
await recA.stop()
await recPC.stop()
const vib = B ? await B.page.evaluate(() => window.__vib) : []
const vibA = await A.page.evaluate(() => window.__vib)
writeFileSync(pjoin(dir, 'events.json'), JSON.stringify({ roster, slotA, slotB, events, vibB: vib, vibA, pilots: [pA.stats, pB?.stats] }, null, 1))
log(`vibrations Pixel : ${vib.length} ; iPhone : ${vibA.length} ; pilotes ${JSON.stringify([pA.stats, pB?.stats])}`)
for (const [k, l] of [['pc', pcLogs], ['A', A.logs], ['B', B?.logs ?? []]]) {
  const pb = l.filter(x => /^\[(error|warning|pageerror)\]/.test(x))
  log(`${k} console : ${pb.length ? [...new Set(pb)].slice(0, 5).join(' | ') : 'propre'}`)
}
await browser.close()
