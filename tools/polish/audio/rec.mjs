// Enregistreur du mix RÉEL du jeu (agent polish audio, lecture seule du code du jeu).
//
// Branche un AudioWorklet en parallèle de la chaîne du moteur (src/host/audio/engine.ts) :
//   canaux 0-1 : sortie master (après glue, limiteur, saturation) = ce qu'entend le salon
//   canal 2    : bus voix (narrateur)            ┐
//   canal 3    : musique (après ducking + pause)  │ pistes « stems », avant le master,
//   canal 4    : ambiance (après ducking)         │ stockées à −6,02 dB (×0,5) pour la marge
//   canal 5    : bruitages (bus sfx)              │
//   canal 6    : retour de réverbe               │
//   canal 7    : interface / ponctuations (bus ui)┘
// Les échantillons partent en int16 vers Node (exposeBinding) qui écrit des WAV.
// Journal horodaté (horloge audio) : écrans, sous-titres du narrateur, événements de simulation,
// chaque son demandé au lecteur de bruitages (nom, fichier, joué ou refusé), phases du soleil.
//   import { installRecorder } from './rec.mjs'
//   const rec = await installRecorder(page, outDir)   // après que window.__ombres existe
//   ... ; await rec.mark('label') ; await rec.stop()
import { mkdirSync, writeFileSync, openSync, writeSync, closeSync, statSync } from 'node:fs'
import { join } from 'node:path'

const WORKLET = `
class OmbresRec extends AudioWorkletProcessor {
  constructor() {
    super()
    this.CH = 8
    this.N = 22016 // multiple de 128 (un bloc de rendu) : aucun échantillon perdu en fin de tampon
    this.buf = new Int16Array(this.N * this.CH)
    this.pos = 0
    this.first = -1
    this.on = true
    this.port.onmessage = e => { if (e.data === 'stop') { this.flush(); this.on = false } }
  }
  flush() {
    if (!this.pos) return
    const out = this.buf.slice(0, this.pos * this.CH)
    this.port.postMessage({ frame: this.first, frames: this.pos, data: out.buffer }, [out.buffer])
    this.pos = 0
    this.first = -1
  }
  process(inputs) {
    if (!this.on) return false
    const n = 128
    if (this.first < 0) this.first = currentFrame
    const b = this.buf, CH = this.CH
    const m = inputs[0]
    const mL = m && m[0], mR = m && (m[1] || m[0])
    const q = v => { v = v * 32767; return v > 32767 ? 32767 : v < -32768 ? -32768 : v | 0 }
    for (let i = 0; i < n; i++) {
      const o = (this.pos + i) * CH
      b[o] = mL ? q(mL[i]) : 0
      b[o + 1] = mR ? q(mR[i]) : 0
      for (let k = 1; k < 7; k++) {
        const inp = inputs[k]
        if (!inp || !inp.length) { b[o + 1 + k] = 0; continue }
        const a = inp[0], c = inp[1] || inp[0]
        b[o + 1 + k] = q(0.5 * 0.5 * (a[i] + c[i]))
      }
    }
    this.pos += n
    if (this.pos >= this.N) this.flush()
    return true
  }
}
registerProcessor('ombres-rec', OmbresRec)
`

/** Installe l'enregistreur dans la page du PC. Renvoie { mark, stop, dir }. */
export async function installRecorder(page, dir, { name = 'mix' } = {}) {
  mkdirSync(dir, { recursive: true })
  const pcmPath = join(dir, `${name}.pcm`)
  const fd = openSync(pcmPath, 'w')
  let frames = 0
  let firstFrame = -1
  let lastEnd = -1
  let gaps = 0
  const gapList = []
  await page.exposeBinding('__recChunk', (_src, frame, count, b64) => {
    if (firstFrame < 0) firstFrame = frame
    if (lastEnd >= 0 && frame !== lastEnd) {
      gaps++
      gapList.push([lastEnd, frame])
      // trou dans le flux : on comble par du silence pour garder l'axe du temps exact
      if (frame > lastEnd && frame - lastEnd < 44100 * 5) {
        const z = Buffer.alloc((frame - lastEnd) * 16)
        writeSync(fd, z)
        frames += frame - lastEnd
      }
    }
    lastEnd = frame + count
    const buf = Buffer.from(b64, 'base64')
    writeSync(fd, buf)
    frames += count
  })
  const events = []
  await page.exposeBinding('__recLog', (_src, batch) => {
    for (const e of batch) events.push(e)
  })
  const info = await page.evaluate(async code => {
    const A = await import('/src/host/audio/index.ts')
    const bus = await import('/src/host/bus.ts')
    const sys = A.getAudio() ?? A.initAudio()
    const e = sys.engine
    const ctx = e.ctx
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    await ctx.audioWorklet.addModule(url)
    const node = new AudioWorkletNode(ctx, 'ombres-rec', {
      numberOfInputs: 7,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    })
    e.output.connect(node, 0, 0)
    e.buses.voice.connect(node, 0, 1)
    e.musicPauseGain.connect(node, 0, 2)
    e.duckAmb.connect(node, 0, 3)
    e.buses.sfx.connect(node, 0, 4)
    e.verbOut.connect(node, 0, 5)
    e.buses.ui.connect(node, 0, 6)
    const mute = ctx.createGain()
    mute.gain.value = 0
    node.connect(mute).connect(ctx.destination)
    const b64 = u8 => {
      let s = ''
      const CH = 0x8000
      for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH))
      return btoa(s)
    }
    node.port.onmessage = ev => {
      const { frame, frames, data } = ev.data
      window.__recChunk(frame, frames, b64(new Uint8Array(data)))
    }
    // ─── journal ───
    const L = []
    const now = () => ctx.currentTime
    const log = (k, o = {}) => L.push({ t: +now().toFixed(4), w: +(performance.now() / 1000).toFixed(3), k, ...o })
    window.__recLogPush = log
    const o = window.__ombres
    let prev = {}
    o.useUi.subscribe(s => {
      if (s.screen !== prev.screen) log('screen', { v: s.screen })
      if (s.paused !== prev.paused) log('paused', { v: s.paused })
      prev = { screen: s.screen, paused: s.paused }
    })
    log('screen', { v: o.useUi.getState().screen })
    bus.subtitleEvents.on(s => log('sub', s.type === 'show' ? { type: 'show', id: s.id, lineId: s.lineId, text: s.text, voiced: s.voiced, color: s.colorIndex, dur: s.durationMs } : { type: 'hide', id: s.id }))
    o.simEvents.on(ev => {
      const mode = o.runner.sim?.state.config.mode
      if (ev.type === 'altitude' || ev.type === 'paleOnStrong') {
        // fréquents : compteur compact
        log('sim', { type: ev.type, mode, slot: ev.slot, strong: ev.strong })
      } else log('sim', { type: ev.type, mode, ...Object.fromEntries(Object.entries(ev).filter(([k, v]) => k !== 'type' && typeof v !== 'object')) })
    })
    const p = sys.sfx.player
    const orig = p.play.bind(p)
    p.play = (nm, opts) => {
      const v = orig(nm, opts)
      log('sfx', { name: nm, file: opts?.file ?? p.lastFile.get(nm) ?? p.defs[nm]?.files?.[0], ok: !!v, when: opts?.when !== undefined ? +opts.when.toFixed(4) : undefined })
      return v
    }
    p.onPlay = (nm, db, sec) => log('lvl', { name: nm, db: +db.toFixed(1), sec: +sec.toFixed(2) })
    // musique : écran audio + piste
    const md = sys.music
    const origSet = md.setScreen.bind(md)
    md.setScreen = s => {
      const before = md.screen
      origSet(s)
      log('music', { from: before, to: s })
    }
    // horloge du soleil / phase
    let lastPhase = ''
    setInterval(() => {
      const st = o.runner.sim?.state
      const phase = o.runner.phase
      const sp = st?.sun.phase ?? ''
      if (sp !== lastPhase) {
        log('sun', { phase: sp, sunT: st?.sun.t, runner: phase })
        lastPhase = sp
      }
      if (L.length) window.__recLog(L.splice(0))
    }, 250)
    // tick de soleil chaque seconde (pour caler l'axe du temps)
    setInterval(() => {
      const st = o.runner.sim?.state
      log('tick', { runner: o.runner.phase, mode: st?.config.mode, sunT: st ? +st.sun.t.toFixed(2) : null, birds: st?.birds.length ?? 0, ts: o.runner.sim ? undefined : undefined })
    }, 1000)
    window.__recNode = node
    return { sr: ctx.sampleRate, state: ctx.state, now: ctx.currentTime, base: ctx.baseLatency }
  }, WORKLET)
  const t0 = Date.now()
  return {
    dir,
    info,
    events,
    async mark(label, extra = {}) {
      await page.evaluate(([l, x]) => window.__recLogPush('mark', { label: l, ...x }), [label, extra]).catch(() => {})
    },
    async stop() {
      await page.evaluate(() => window.__recNode.port.postMessage('stop')).catch(() => {})
      await new Promise(r => setTimeout(r, 1500))
      // flush du journal
      await page.evaluate(() => {}).catch(() => {})
      closeSync(fd)
      const sr = info.sr
      const bytes = statSync(pcmPath).size
      await writeWav(join(dir, `${name}.wav`), pcmPath, sr, 8, bytes)
      writeFileSync(join(dir, `${name}.events.json`), JSON.stringify({ sr, firstFrame, frames, gaps, gapList, chunkFix: 'v2', wallSeconds: (Date.now() - t0) / 1000, channels: ['masterL', 'masterR', 'voice', 'music', 'amb', 'sfx', 'verb', 'ui'], stemGain: 0.5, events }))
      return { frames, firstFrame, gaps, seconds: frames / sr }
    },
  }
}

/** Enveloppe WAV autour d'un PCM int16 entrelacé (écrit en flux, fichiers de plusieurs centaines de Mo). */
function writeWav(path, pcmPath, sr, ch, bytes) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + bytes, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(ch, 22)
  h.writeUInt32LE(sr, 24)
  h.writeUInt32LE(sr * ch * 2, 28)
  h.writeUInt16LE(ch * 2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(bytes, 40)
  const fd = openSync(path, 'w')
  writeSync(fd, h)
  closeSync(fd)
  // concaténation en flux
  return new Promise((res, rej) => {
    import('node:fs').then(fs => {
      const ws = fs.createWriteStream(path, { flags: 'a' })
      fs.createReadStream(pcmPath).pipe(ws).on('finish', () => {
        fs.unlinkSync(pcmPath)
        res()
      }).on('error', rej)
    })
  })
}
