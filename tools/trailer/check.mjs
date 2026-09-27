// Vérification des livrables de la bande-annonce : format (ffprobe), durée, débit, faststart, sonie (EBU R128,
// crête vraie), planche d'une image par seconde, et lecture réelle dans Chrome (décodage, seeks, images non vides).
//   nix shell nixpkgs#ffmpeg-full -c node tools/trailer/check.mjs
// Écrit marketing/work/check/<livrable>-sheet.jpg et marketing/work/check/report.json.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, statSync, openSync, readSync, closeSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { ROOT, WORK, FFMPEG, FFPROBE, ORIGIN, browser, closeBrowser } from './lib/stage.mjs'

const OUT = join(WORK, 'check')
mkdirSync(OUT, { recursive: true })
const files = [
  join(ROOT, 'marketing/trailer-1080p.mp4'),
  join(ROOT, 'marketing/trailer-1080p-ai-credit.mp4'),
  join(ROOT, 'public/media/trailer-720.mp4'),
  join(ROOT, 'marketing/trailer-vertical.mp4'),
].filter(existsSync)

/** moov avant mdat (lecture progressive, +faststart). */
function faststart(f) {
  const fd = openSync(f, 'r')
  const buf = Buffer.alloc(64)
  let pos = 0
  const order = []
  for (let k = 0; k < 12; k++) {
    if (readSync(fd, buf, 0, 16, pos) < 8) break
    let size = buf.readUInt32BE(0)
    const type = buf.toString('latin1', 4, 8)
    if (size === 1) size = Number(buf.readBigUInt64BE(8))
    order.push(type)
    if (size < 8) break
    pos += size
  }
  closeSync(fd)
  return order.indexOf('moov') >= 0 && order.indexOf('moov') < order.indexOf('mdat')
}

function loudness(f) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', f, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' })
  const s = r.stderr.slice(r.stderr.lastIndexOf('Summary'))
  return { I: Number(/I:\s+(-?[\d.]+) LUFS/.exec(s)?.[1]), LRA: Number(/LRA:\s+(-?[\d.]+) LU/.exec(s)?.[1]), TP: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(s)?.[1]) }
}

const report = []
for (const f of files) {
  const p = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=codec_type,codec_name,profile,pix_fmt,width,height,r_frame_rate,bit_rate,sample_rate,channels', '-of', 'json', f]).toString())
  const v = p.streams.find(s => s.codec_type === 'video')
  const a = p.streams.find(s => s.codec_type === 'audio')
  const name = basename(f, '.mp4')
  const sheet = join(OUT, `${name}-sheet.jpg`)
  const vertical = v.height > v.width
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', f, '-vf', `fps=1,scale=${vertical ? 180 : 320}:-1,tile=${vertical ? 13 : 8}x${Math.ceil(Number(p.format.duration) / (vertical ? 13 : 8))}`, '-frames:v', '1', sheet])
  report.push({
    file: f.replace(ROOT + '/', ''),
    sizeMB: +(statSync(f).size / 1048576).toFixed(2),
    duration: +Number(p.format.duration).toFixed(2),
    video: `${v.codec_name} ${v.profile} ${v.pix_fmt} ${v.width}×${v.height} ${v.r_frame_rate} ${Math.round(v.bit_rate / 1000)} kb/s`,
    audio: a ? `${a.codec_name} ${a.profile ?? ''} ${a.sample_rate} Hz ${a.channels} can. ${Math.round(a.bit_rate / 1000)} kb/s` : 'aucun',
    faststart: faststart(f),
    loudness: a ? loudness(f) : null,
    sheet: sheet.replace(ROOT + '/', ''),
  })
}

// lecture dans Chrome (servi par le serveur de dev, requêtes partielles) : lecture 1,5 s, 4 seeks, image non vide.
// Décodeur logiciel : dans ce Chrome sans écran lancé avec le GPU forcé (ANGLE/EGL), le décodeur vidéo matériel
// échoue au hasard sur n'importe quel H.264, même une mire générée par ffmpeg (PIPELINE_ERROR_DISCONNECTED).
process.env.TRAILER_CHROME_ARGS = `${process.env.TRAILER_CHROME_ARGS ?? ''} --disable-accelerated-video-decode`
const b = await browser()
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } })
const page = await ctx.newPage()
await page.goto(`${ORIGIN}/dev/trailer.html?card=phone`)
const urlOf = f => `${ORIGIN}/${f.replace(ROOT + '/', '').replace(/^public\//, '')}`
for (const [k, f] of files.entries()) {
  const res = await page.evaluate(async src => {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.src = src
    document.body.replaceChildren(v)
    const ev = (el, name, ms = 15000) => new Promise((ok, ko) => { const t = setTimeout(() => ko(new Error(`timeout ${name}`)), ms); el.addEventListener(name, () => { clearTimeout(t); ok() }, { once: true }) })
    try {
      await ev(v, 'loadeddata')
      await v.play()
      await new Promise(r => setTimeout(r, 1500))
      v.pause()
      const c = document.createElement('canvas')
      c.width = 64
      c.height = 36
      const g = c.getContext('2d', { willReadFrequently: true })
      const luma = () => {
        g.drawImage(v, 0, 0, 64, 36)
        const d = g.getImageData(0, 0, 64, 36).data
        let s = 0
        for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
        return +(s / (d.length / 4)).toFixed(1)
      }
      const stops = []
      for (const frac of [0.1, 0.45, 0.7, 0.95]) {
        v.currentTime = v.duration * frac
        await ev(v, 'seeked')
        stops.push([+(v.duration * frac).toFixed(1), luma()])
      }
      const q = v.getVideoPlaybackQuality()
      return { ok: true, duration: +v.duration.toFixed(2), size: `${v.videoWidth}×${v.videoHeight}`, decoded: q.totalVideoFrames, dropped: q.droppedVideoFrames, stops }
    } catch (e) {
      return { ok: false, error: String(e), code: v.error?.code ?? null }
    }
  }, urlOf(f))
  report[k].chrome = res
}
await closeBrowser()
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1))
for (const r of report) console.log(JSON.stringify(r))
