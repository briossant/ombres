// « Écoute » d'une vraie manche (critique game feel) : capture du mixage réel à la sortie de l'AudioContext
// du jeu (dérivation posée sur toute connexion vers la destination), avec le journal des événements de
// la sim et des sous-titres du narrateur, horodatés sur l'horloge audio. Sortie : WAV mono 22,05 kHz + JSON.
//   PORT=8822 node tools/polish/feel/audio-capture.mjs --name=audio6 [--bots='[…]'] [--groups=1]
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openPC, toLobby, setupRoster, outDir, sleep, waitFor, arg } from './lib.mjs'
import { installBrain, SmartKeyboardPilot } from './pilot.mjs'
import { launch, newContext, collectLogs } from '../../lib/browser.mjs'

const name = arg('name', 'audio6')
const dir = outDir(name)
const bots = arg('bots', null) ? JSON.parse(arg('bots')) : [{ p: 'falcon', lv: 1 }, { p: 'ploughman', lv: 1 }, { p: 'magpie', lv: 1 }, { p: 'lookout', lv: 1 }, { p: 'fool', lv: 1 }]
const groups = arg('groups', '1').split(',').map(Number)

// Dérivation : posée avant la création de l'AudioContext du jeu.
const TAP = () => {
  const orig = AudioNode.prototype.connect
  const st = (window.__tap = { chunks: [], t0: null, ctx: null, sp: null, sources: new Set(), rate: 0 })
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = orig.call(this, dest, ...rest)
    try {
      if (dest instanceof AudioDestinationNode && !st.sources.has(this) && this !== st.sp && this !== st.mute) {
        const ctx = this.context
        if (!st.sp) {
          st.ctx = ctx
          st.rate = ctx.sampleRate
          st.sp = ctx.createScriptProcessor(4096, 2, 1)
          st.mute = ctx.createGain()
          st.mute.gain.value = 0
          orig.call(st.sp, st.mute)
          orig.call(st.mute, ctx.destination)
          st.sp.onaudioprocess = e => {
            if (!st.rec) return
            const L = e.inputBuffer.getChannelData(0)
            const R = e.inputBuffer.getChannelData(1)
            // mono, décimé ×2 (moyenne), Int16
            const n = L.length >> 1
            const out = new Int16Array(n)
            for (let i = 0; i < n; i++) {
              const v = (L[2 * i] + R[2 * i] + L[2 * i + 1] + R[2 * i + 1]) * 0.25
              out[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)))
            }
            if (st.t0 === null) st.t0 = e.playbackTime
            st.chunks.push(out)
          }
        }
        if (this.context === st.ctx) {
          st.sources.add(this)
          orig.call(this, st.sp)
        }
      }
    } catch (e) {
      console.warn('tap', e)
    }
    return r
  }
}

const browser = await launch()
const ctx = await newContext(browser, { w: 1920, h: 1080 })
const pc = await ctx.newPage()
const logs = collectLogs(pc)
await pc.addInitScript(TAP)
await pc.addInitScript(p => {
  try {
    localStorage.setItem('ombres.settings.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('ombres.settings.v1') ?? '{}'), ...p }))
  } catch {}
}, { lang: 'fr', quality: 'medium', hints: 'auto', narrator: 'voice' })
const { ORIGIN } = await import('./lib.mjs')
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await toLobby(pc)
const roster = await setupRoster(pc, { groups, bots })
console.log('salon', JSON.stringify(roster.map(r => `${r.kind}:${r.bot?.personality ?? ''}`)))
await installBrain(pc)
// journal sur l'horloge audio
await pc.evaluate(async () => {
  const o = window.__ombres
  const busMod = await import('/src/host/bus.ts')
  const st = window.__tap
  const L = (st.log = [])
  const at = () => (st.ctx ? st.ctx.currentTime : 0)
  o.simEvents.on(e => {
    if (['altitude', 'flapReady', 'lock', 'unlock', 'hidden'].includes(e.type)) return
    L.push({ a: at(), t: o.runner.sim?.state.sun.t ?? null, type: e.type, e: e.type === 'paleOnStrong' ? undefined : JSON.parse(JSON.stringify(e)) })
  })
  busMod.subtitleEvents.on(e => L.push({ a: at(), type: 'sub', e: e.type === 'show' ? { text: e.text, voiced: e.voiced, dur: e.durationMs, lineId: e.lineId } : { hide: e.id } }))
  let prev = null
  setInterval(() => {
    const sc = o.useUi.getState().screen
    if (sc !== prev) L.push({ a: at(), type: 'screen', e: sc })
    prev = sc
  }, 100)
  st.chunks.length = 0
  st.t0 = null
  st.rec = true
})
const kb = roster.filter(r => r.kind === 'keyboard').map(r => r.slot)
const pilots = kb.map((s, i) => new SmartKeyboardPilot(pc, groups[i], () => s, { huntEvery: 12 }))
await pc.keyboard.press('Enter')
await waitFor(pc, () => ['rules', 'game'].includes(window.__ombres?.useUi.getState().screen), null, 10000, 'cartes')
await sleep(4000)
if ((await pc.evaluate(() => window.__ombres.useUi.getState().screen)) === 'rules') await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 15000, 'manche')
for (const p of pilots) await p.start()
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'roundResults', null, 200000, 'résultats')
for (const p of pilots) await p.stop()
await sleep(Number(arg('tail', '12000')))
// récupération
const meta = await pc.evaluate(() => {
  const st = window.__tap
  st.rec = false
  let n = 0
  for (const c of st.chunks) n += c.length
  return { n, rate: st.rate / 2, t0: st.t0, log: st.log, sources: st.sources.size }
})
console.log(`audio : ${(meta.n / meta.rate).toFixed(1)} s à ${meta.rate} Hz, ${meta.sources} sources vers la destination`)
const parts = []
for (let i = 0; ; i++) {
  const b64 = await pc.evaluate(i => {
    const st = window.__tap
    const per = 40
    const cs = st.chunks.slice(i * per, (i + 1) * per)
    if (!cs.length) return null
    let n = 0
    for (const c of cs) n += c.length
    const all = new Int16Array(n)
    let o = 0
    for (const c of cs) {
      all.set(c, o)
      o += c.length
    }
    const u8 = new Uint8Array(all.buffer)
    let s = ''
    for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000))
    return btoa(s)
  }, i)
  if (!b64) break
  parts.push(Buffer.from(b64, 'base64'))
}
const pcm = Buffer.concat(parts)
const hdr = Buffer.alloc(44)
hdr.write('RIFF', 0)
hdr.writeUInt32LE(36 + pcm.length, 4)
hdr.write('WAVE', 8)
hdr.write('fmt ', 12)
hdr.writeUInt32LE(16, 16)
hdr.writeUInt16LE(1, 20)
hdr.writeUInt16LE(1, 22)
hdr.writeUInt32LE(meta.rate, 24)
hdr.writeUInt32LE(meta.rate * 2, 28)
hdr.writeUInt16LE(2, 32)
hdr.writeUInt16LE(16, 34)
hdr.write('data', 36)
hdr.writeUInt32LE(pcm.length, 40)
writeFileSync(join(dir, 'mix.wav'), Buffer.concat([hdr, pcm]))
writeFileSync(join(dir, 'audio-log.json'), JSON.stringify({ rate: meta.rate, t0: meta.t0, log: meta.log }, null, 0))
const pb = logs.filter(l => /^\[(error|warning|pageerror)\]/.test(l))
console.log(pb.length ? `console : ${[...new Set(pb)].slice(0, 8).join(' | ')}` : 'console propre')
await browser.close()
