// Montage de la bande-annonce : lit le découpage (edl.mjs), fabrique chaque plan (images du jeu, cartons,
// manette incrustée, fondus), les met bout à bout, mixe la bande-son (musique et bruitages rendus par le
// moteur audio du jeu, voix du narrateur, sons ponctuels), puis encode les livrables.
//   nix shell nixpkgs#ffmpeg-full -c node tools/trailer/edit.mjs [--only=video|audio|master] [--plans=3,4]
// Livrables : marketing/trailer-1080p.mp4 (A), marketing/trailer-1080p-ai-credit.mp4 (B),
//             public/media/trailer-720.mp4 (A, ≤ 12 Mo), public/media/trailer-poster.jpg (1280 × 720).
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { CLIPS, WORK, ROOT, FFMPEG, FFPROBE } from './lib/stage.mjs'
import { buildEdl, buildVertical } from './edl.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const EDIT = join(WORK, 'edit')
mkdirSync(EDIT, { recursive: true })
const FPS = 60
const W = 1920
const H = 1080
const log = m => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)

function ff(args, label) {
  if (process.env.TRAILER_DUMP) writeFileSync(join(EDIT, 'last-args.json'), JSON.stringify(args))
  const r = spawnSync(FFMPEG, ['-hide_banner', '-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'pipe'], maxBuffer: 1 << 26 })
  if (r.status !== 0) throw new Error(`ffmpeg (${label}) :\n${String(r.stderr).slice(-3000)}`)
  return String(r.stderr)
}
const probe = f => JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:format=duration', '-of', 'json', f]).toString())

const VARIANTS = [
  { tag: 'A', file: 'trailer-1080p.mp4' },
  { tag: 'B', file: 'trailer-1080p-ai-credit.mp4' },
]
const edl = buildEdl('A')

// ─── Plans ─────────────────────────────────────────────────────────────────
/**
 * Un plan : morceaux de source (clip, première image, nombre d'images produites, pas), incrustations
 * (manette, cartons), fondus. Sortie : edit/plan-NN.mp4 (1080p60 4:4:4, sans son).
 */
function renderPlan(p, idx, out) {
  const args = []
  const chains = []
  let nIn = 0
  const pieceLabels = []
  for (const [k, piece] of (p.howto ? [] : p.pieces).entries()) {
    const src = join(CLIPS, `${piece.clip}.mp4`)
    const step = piece.step ?? 1
    const span = piece.n * step
    args.push('-ss', ((piece.from - 0.5) / FPS).toFixed(5), '-t', ((span + 2) / FPS).toFixed(5), '-i', src)
    const i = nIn++
    const sel = step > 1 ? `select='not(mod(n\\,${step}))',` : ''
    // plan recadré : on garde le double de définition jusqu'au recadrage (zoompan) ; sinon 1080p
    const [pw, ph] = p.zoom ? [W * 2, H * 2] : [W, H]
    chains.push(`[${i}:v]${sel}trim=end_frame=${piece.n},setpts=N/${FPS}/TB,scale=${pw}:${ph}:flags=lanczos,format=yuv444p,setsar=1[p${k}]`)
    pieceLabels.push(`[p${k}]`)
  }
  let cur = 'base'
  if (pieceLabels.length > 1) chains.push(`${pieceLabels.join('')}concat=n=${pieceLabels.length}:v=1:a=0[base]`)
  else if (pieceLabels.length === 1) chains.push(`${pieceLabels[0]}null[base]`)
  const frames = p.pieces.reduce((s, x) => s + x.n, 0)
  // recadrage animé (caméra virtuelle du monteur) : [[t, zoom, cx, cy], …], cx/cy en fractions de l'image
  if (p.zoom && cur === 'base') {
    const Z = flatExpr(p.zoom.map(k => [k[0], k[1]]), `in/${FPS}`)
    const CX = flatExpr(p.zoom.map(k => [k[0], k[2]]), `in/${FPS}`)
    const CY = flatExpr(p.zoom.map(k => [k[0], k[3]]), `in/${FPS}`)
    chains.push(`[base]setpts=N/${FPS}/TB,setsar=1,zoompan=z='${Z}':x='max(0\,min(iw-iw/zoom\,(${CX})*iw-iw/zoom/2))':y='max(0\,min(ih-ih/zoom\,(${CY})*ih-ih/zoom/2))':d=1:s=${W}x${H}:fps=${FPS},format=yuv444p[zbase]`)
    cur = 'zbase'
  }
  // manette incrustée (écran de 704 × 325 dans le cadre de card-phone.png)
  for (const [k, ph] of (p.phones ?? []).entries()) {
    args.push('-ss', ((ph.from - 0.5) / 30).toFixed(5), '-t', ((ph.n + 2) / 30).toFixed(5), '-i', join(CLIPS, `${ph.clip}.mp4`))
    const i = nIn++
    args.push('-loop', '1', '-framerate', String(FPS), '-t', ((frames + 2) / FPS).toFixed(4), '-i', join(CLIPS, 'card-phone.png'))
    const j = nIn++
    const sx = ph.x + 24
    const sy = ph.y + 24
    const t0 = (ph.at ?? 0).toFixed(4)
    const fadeIn = ph.fade ?? 0.2
    const vis = `between(t\\,${t0}\\,${((ph.at ?? 0) + ph.n / 30).toFixed(4)})`
    chains.push(`[${i}:v]trim=end_frame=${ph.n},setpts=N/30/TB+${t0}/TB,fps=${FPS},scale=704:325:flags=lanczos,format=yuva444p,fade=in:st=${t0}:d=${fadeIn}:alpha=1[phs${k}]`)
    chains.push(`[${j}:v]format=yuva444p,fade=in:st=${t0}:d=${fadeIn}:alpha=1[phf${k}]`)
    chains.push(`[${cur}][phs${k}]overlay=${sx}:${sy}:eof_action=pass:enable='${vis}'[pa${k}]`)
    chains.push(`[pa${k}][phf${k}]overlay=${ph.x}:${ph.y}:eof_action=pass:enable='${vis}'[pb${k}]`)
    cur = `pb${k}`
  }
  // cartons (RGBA, 60 i/s), posés à `at` secondes du début du plan
  for (const [k, c] of (p.cards ?? []).entries()) {
    // offset : le carton a commencé dans le plan précédent (on reprend à `offset` secondes)
    if (c.offset) args.push('-ss', c.offset.toFixed(4))
    args.push('-i', join(CLIPS, `card-${c.id}.mov`))
    const i = nIn++
    chains.push(`[${i}:v]format=yuva444p,setpts=PTS-STARTPTS+${(c.at ?? 0).toFixed(4)}/TB[cd${k}]`)
    chains.push(`[${cur}][cd${k}]overlay=0:0:eof_action=pass:format=auto[c${k}]`)
    cur = `c${k}`
  }
  // planche « comment jouer » : le salon et la manette passent sous le papier percé
  if (p.howto) {
    const L = p.howto
    const tv = L.tvRect
    const phr = L.phoneRect
    args.push('-ss', ((L.tv.from - 0.5) / FPS).toFixed(5), '-t', ((frames + 2) / FPS).toFixed(5), '-i', join(CLIPS, `${L.tv.clip}.mp4`))
    const i = nIn++
    args.push('-ss', ((L.phone.from - 0.5) / 30).toFixed(5), '-t', ((frames / 2 + 2) / 30).toFixed(5), '-i', join(CLIPS, `${L.phone.clip}.mp4`))
    const j = nIn++
    args.push('-i', join(CLIPS, 'card-howto.mov'))
    const k = nIn++
    chains.push(`color=c=0xF7F0E3:s=${W}x${H}:r=${FPS}:d=${(frames / FPS + 0.1).toFixed(3)},format=yuv444p[hbg]`)
    chains.push(`[${i}:v]trim=end_frame=${frames},setpts=N/${FPS}/TB,scale=${tv.w}:${tv.h}:flags=lanczos,format=yuv444p[htv]`)
    chains.push(`[${j}:v]setpts=N/30/TB,fps=${FPS},trim=end_frame=${frames},scale=${phr.w}:${phr.h}:flags=lanczos,format=yuv444p[hph]`)
    chains.push(`[hbg][htv]overlay=${tv.x}:${tv.y}:eof_action=repeat[h1]`)
    chains.push(`[h1][hph]overlay=${phr.x}:${phr.y}:eof_action=repeat[h2]`)
    chains.push(`[${k}:v]format=yuva444p[hpage]`)
    chains.push(`[h2][hpage]overlay=0:0:eof_action=repeat[base2]`)
    cur = 'base2'
  }
  const post = []
  if (p.fadeIn) post.push(`fade=in:st=0:d=${p.fadeIn.d}:color=${p.fadeIn.color ?? '0xF7F0E3'}`)
  if (p.fadeOut) post.push(`fade=out:st=${(frames / FPS - p.fadeOut.d).toFixed(4)}:d=${p.fadeOut.d}:color=${p.fadeOut.color ?? '0xF7F0E3'}`)
  if (p.veil) post.push(p.veil)
  chains.push(`[${cur}]${post.length ? post.join(',') + ',' : ''}trim=end_frame=${frames},format=yuv444p[out]`)
  // fichier temporaire puis renommage : un plan raté ne laisse jamais un fichier tronqué dans le cache
  const tmp = out.replace(/\.mp4$/, '.tmp.mp4')
  ff([...args, '-filter_complex', chains.join(';'), '-map', '[out]', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', '-pix_fmt', 'yuv444p', '-g', '60', tmp], `plan ${idx} ${p.name}`)
  execFileSync('mv', [tmp, out])
  return { out, frames }
}

// ─── Bande-son ─────────────────────────────────────────────────────────────
const dbg = db => Math.pow(10, db / 20)
/** Linéaire par morceaux, forme plate (somme de rampes bornées) : pas d'imbrication, l'analyseur de ffmpeg suit. */
function flatExpr(points, v) {
  let e = points[0][1].toFixed(4)
  for (let i = 1; i < points.length; i++) {
    const [t0, a] = points[i - 1]
    const [t1, b] = points[i]
    if (t1 <= t0 || Math.abs(b - a) < 1e-5) continue
    e += `+${((b - a) / (t1 - t0)).toFixed(5)}*clip(${v}-${t0.toFixed(4)}\\,0\\,${(t1 - t0).toFixed(4)})`
  }
  return e
}

/** Enveloppe linéaire par morceaux → expression ffmpeg (volume, eval=frame). */
function envExpr(points, v = 't') {
  // points : [[t, gain], …] triés ; constant avant le premier et après le dernier
  if (!points.length) return '1'
  let e = `${points.at(-1)[1].toFixed(4)}`
  for (let i = points.length - 1; i >= 1; i--) {
    const [t0, g0] = points[i - 1]
    const [t1, g1] = points[i]
    const seg = t1 > t0 ? `${g0.toFixed(4)}+(${(g1 - g0).toFixed(4)})*(${v}-${t0.toFixed(4)})/${(t1 - t0).toFixed(4)}` : g1.toFixed(4)
    e = `if(lt(${v}\\,${t1.toFixed(4)})\\,${seg}\\,${e})`
  }
  return `if(lt(${v}\\,${points[0][0].toFixed(4)})\\,${points[0][1].toFixed(4)}\\,${e})`
}

function renderAudio(total, audio, out) {
  const args = []
  const chains = []
  const buses = { music: [], fx: [], voice: [] }
  let n = 0
  for (const [k, c] of audio.clips.entries()) {
    args.push('-i', c.file)
    const i = n++
    const f = []
    f.push(`aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo`)
    if (c.from !== undefined || c.dur !== undefined) f.push(`atrim=start=${(c.from ?? 0).toFixed(4)}${c.dur !== undefined ? `:duration=${c.dur.toFixed(4)}` : ''}`)
    f.push('asetpts=PTS-STARTPTS')
    if (c.rate && c.rate !== 1) f.push(`asetrate=${Math.round(48000 * c.rate)},aresample=48000`)
    if (c.stretch && c.stretch !== 1) f.push(`atempo=${c.stretch}`)
    if (c.lowpass) f.push(`lowpass=f=${c.lowpass}`)
    if (c.fadeIn) f.push(`afade=t=in:st=0:d=${c.fadeIn}`)
    const len = c.dur !== undefined ? c.dur / (c.rate ?? 1) : null
    if (c.fadeOut && len) f.push(`afade=t=out:st=${Math.max(0, len - c.fadeOut).toFixed(4)}:d=${c.fadeOut}`)
    f.push(`volume=${dbg(c.db ?? 0).toFixed(5)}`)
    if (c.env) f.push(`volume=eval=frame:volume='${envExpr(c.env.map(([t, db]) => [t, dbg(db)]))}'`)
    // ducking sous la voix, appliqué clip par clip (temps du clip = temps de la bande-annonce − at, ralenti compris) :
    // appliqué après amix, l'enveloppe n'était lue qu'une fois par trame et amix sort des trames de plusieurs secondes
    const duck = c.bus === 'music' ? audio.duck.music : c.bus === 'voice' ? null : audio.duck.fx
    if (duck?.length) f.push(`volume=eval=frame:volume='${envExpr(duck.map(([t, g]) => [t - c.at, g]))}'`)
    const ms = Math.max(0, Math.round(c.at * 1000))
    f.push(`adelay=${ms}|${ms}`)
    chains.push(`[${i}:a]${f.join(',')}[a${k}]`)
    buses[c.bus ?? 'fx'].push(`[a${k}]`)
  }
  const mix = (labels, name) => {
    if (!labels.length) chains.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${total}[${name}]`)
    else chains.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest[${name}]`)
  }
  mix(buses.music, 'mus0')
  mix(buses.fx, 'fx0')
  mix(buses.voice, 'vox')
  // ducking : musique et bruitages baissent sous la voix (comme le jeu : −6 dB musique, −5 dB bruitages)
  chains.push(`[mus0]anull[mus]`)
  chains.push(`[fx0]anull[fx]`)
  chains.push(`[mus][fx][vox]amix=inputs=3:normalize=0:duration=longest,atrim=duration=${total.toFixed(4)}[mixed]`)
  ff([...args, '-filter_complex', chains.join(';'), '-map', '[mixed]', '-c:a', 'pcm_f32le', '-ar', '48000', out], 'bande-son')
}

/** Sonie intégrée et crête vraie (ebur128). */
function loudness(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' })
  const s = r.stderr
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(s.slice(s.lastIndexOf('Summary')))?.[1])
  const TP = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(s.slice(s.lastIndexOf('True peak')))?.[1])
  const LRA = Number(/LRA:\s+(-?[\d.]+) LU/.exec(s.slice(s.lastIndexOf('Summary')))?.[1])
  return { I, TP, LRA }
}

/** Mastering : gain vers −14 LUFS, limiteur (crête vraie ≤ −1 dBTP), mesuré. */
function master(src, out) {
  const m = loudness(src)
  const gain = -14 - m.I
  ff(['-i', src, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=${dbg(-2.2).toFixed(4)}:attack=3:release=60:level=disabled:asc=1,aresample=48000`, '-c:a', 'pcm_s16le', out], 'mastering')
  const after = loudness(out)
  // deuxième passe : le limiteur a pu mordre quelques dixièmes
  if (Math.abs(after.I + 14) > 0.3) {
    const g2 = -14 - after.I
    ff(['-i', src, '-af', `volume=${(gain + g2).toFixed(2)}dB,alimiter=limit=${dbg(-2.2).toFixed(4)}:attack=3:release=60:level=disabled:asc=1,aresample=48000`, '-c:a', 'pcm_s16le', out + '.tmp.wav'], 'mastering 2')
    rmSync(out)
    execFileSync('mv', [out + '.tmp.wav', out])
  }
  return { before: m, after: loudness(out) }
}

// ─── Déroulé ───────────────────────────────────────────────────────────────
const only = opt.only ? new Set(opt.only.split(',')) : null
const force = opt.force === 'true'
const total = edl.total
log(`découpage : ${edl.plans.length} plans, ${total.toFixed(2)} s`)
for (const p of edl.plans) log(`  ${p.start.toFixed(2).padStart(6)} s  ${(p.pieces.reduce((a, x) => a + x.n, 0) / FPS).toFixed(2).padStart(5)} s  ${p.name}`)
if (opt.list === 'true') process.exit(0)

/** Plan rendu une fois : refait seulement si sa description (ou une source) a changé. */
function planFile(p, i) {
  const srcs = [...p.pieces.map(x => x.clip), ...(p.phones ?? []).map(x => x.clip), ...(p.cards ?? []).map(c => `card-${c.id}`)]
  const stamp = srcs.map(c => { const f = join(CLIPS, c.startsWith('card-') ? `${c}.mov` : `${c}.mp4`); return existsSync(f) ? statSync(f).mtimeMs : 0 })
  const key = createHash('sha1').update(JSON.stringify([p, stamp])).digest('hex').slice(0, 10)
  const file = join(EDIT, `plan-${key}.mp4`)
  if (force || !existsSync(file)) {
    const t0 = Date.now()
    const r = renderPlan(p, i, file)
    log(`plan ${i} ${p.name} : ${r.frames} images (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  }
  return file
}

if (!only || only.has('video')) {
  for (const v of VARIANTS) {
    const plans = buildEdl(v.tag).plans
    const list = plans.map((p, i) => `file '${planFile(p, i)}'`)
    writeFileSync(join(EDIT, `list-${v.tag}.txt`), list.join('\n') + '\n')
    ff(['-f', 'concat', '-safe', '0', '-i', join(EDIT, `list-${v.tag}.txt`), '-c', 'copy', join(EDIT, `video-${v.tag}.mp4`)], 'concat')
    log(`vidéo ${v.tag} prête`)
  }
}
if (!only || only.has('audio')) {
  // ponctuations du jeu (gong de victoire, notes des joueurs, harpe) : rendues par le moteur audio du jeu
  writeFileSync(join(EDIT, 'cues.json'), JSON.stringify(edl.cues))
  execFileSync('node', [join(import.meta.dirname, 'audio-render.mjs'), `--cues=${join(EDIT, 'cues.json')}`, `--seconds=${(total + 3).toFixed(1)}`, '--out=cues.wav'], { stdio: 'inherit' })
  const audio = buildEdl('A').audio
  renderAudio(total, audio, join(EDIT, 'mix.wav'))
  const r = master(join(EDIT, 'mix.wav'), join(EDIT, 'master.wav'))
  log(`bande-son : avant ${JSON.stringify(r.before)} → après ${JSON.stringify(r.after)}`)
  writeFileSync(join(EDIT, 'loudness.json'), JSON.stringify(r, null, 1))
}
if (!only || only.has('master')) {
  const outs = []
  for (const variant of VARIANTS) {
    const out = join(ROOT, 'marketing', variant.file)
    ff(['-i', join(EDIT, `video-${variant.tag}.mp4`), '-i', join(EDIT, 'master.wav'),
      '-map', '0:v', '-map', '1:a', '-vf', 'scale=out_range=tv', '-color_range', 'tv', '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2', '-preset', 'slow', '-crf', '17',
      '-maxrate', '20M', '-bufsize', '40M', '-pix_fmt', 'yuv420p', '-g', '120', '-bf', '2', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', out], `livrable ${variant.file}`)
    outs.push(out)
    log(`${variant.file} : ${(statSync(out).size / 1048576).toFixed(1)} Mo`)
  }
  // 720p (variante A) pour la page mobile : ≤ 12 Mo, deux passes
  const A = join(EDIT, 'video-A.mp4')
  const out720 = join(ROOT, 'public/media/trailer-720.mp4')
  mkdirSync(join(ROOT, 'public/media'), { recursive: true })
  const aBits = 112000
  // 9,5 Mo : sous la limite de 10 Mo des envois Discord sans abonnement (la page mobile en accepte 12)
  const budget = (Number(opt.mb720 ?? 9.5) * 1048576 * 8) / total
  const vBits = Math.floor(budget - aBits - 20000)
  const common = ['-i', A, '-i', join(EDIT, 'master.wav'), '-map', '0:v', '-map', '1:a', '-vf', 'scale=1280:720:flags=lanczos:out_range=tv,fps=30', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-b:v', String(vBits), '-maxrate', String(Math.round(vBits * 1.8)), '-bufsize', String(vBits * 3), '-pix_fmt', 'yuv420p', '-g', '60']
  const plog = join(EDIT, 'x264-720')
  ff([...common, '-pass', '1', '-passlogfile', plog, '-an', '-f', 'mp4', '/dev/null'], '720 passe 1')
  ff([...common, '-pass', '2', '-passlogfile', plog, '-c:a', 'aac', '-b:a', String(aBits), '-ar', '48000', '-shortest', '-movflags', '+faststart', out720], '720 passe 2')
  log(`trailer-720.mp4 : ${(statSync(out720).size / 1048576).toFixed(2)} Mo (vidéo ${(vBits / 1000).toFixed(0)} kb/s)`)
  // affiche : une image du carton final (variante A)
  const posterAt = edl.posterAt
  ff(['-ss', posterAt.toFixed(3), '-i', A, '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos:out_range=pc', '-q:v', '2', join(ROOT, 'public/media/trailer-poster.jpg')], 'affiche')
  log('trailer-poster.jpg')
}

// ─── Contrôle du mixage : voix seule contre le reste, fenêtre par fenêtre ────
if (only?.has('stems')) {
  const audio = buildEdl('A').audio
  const voice = { ...audio, clips: audio.clips.filter(c => c.bus === 'voice') }
  const bed = { ...audio, clips: audio.clips.filter(c => c.bus !== 'voice') }
  renderAudio(total, voice, join(EDIT, 'stem-voice.wav'))
  renderAudio(total, bed, join(EDIT, 'stem-bed.wav'))
  if (process.env.TRAILER_NODUCK) renderAudio(total, { ...bed, duck: { music: [], fx: [] } }, join(EDIT, 'stem-bed-noduck.wav'))
  for (const c of audio.clips.filter(x => x.bus === 'voice')) {
    const win = f => {
      const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-ss', c.at.toFixed(2), '-t', '2.4', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' })
      return Number(/I:\s+(-?[\d.]+) LUFS/.exec(r.stderr.slice(r.stderr.lastIndexOf('Summary')))?.[1])
    }
    log(`voix ${c.file.split('/').pop()} à ${c.at.toFixed(1)} s : voix ${win(join(EDIT, 'stem-voice.wav'))} LUFS, reste ${win(join(EDIT, 'stem-bed.wav'))} LUFS`)
  }
}

// ─── Version verticale (1080 × 1920) ───────────────────────────────────────
if (only?.has('vertical')) {
  const V = buildVertical()
  const list = V.plans.map((p, i) => `file '${planFile(p, 100 + i)}'`)
  writeFileSync(join(EDIT, 'list-vertical.txt'), list.join('\n') + '\n')
  const vmain = join(EDIT, 'vertical-main.mp4')
  ff(['-f', 'concat', '-safe', '0', '-i', join(EDIT, 'list-vertical.txt'), '-c', 'copy', vmain], 'concat vertical')
  const frames = Math.round(V.total * FPS)
  const ph = V.phone
  const Lm = { x: 40, y: 380, w: 1000, h: 750 }
  const Ls = { x: 188, y: 1444, w: 704, h: 325 }
  const vis = `between(t\\,${ph.at.toFixed(3)}\\,${(ph.at + ph.n / 30).toFixed(3)})`
  const chains = [
    `color=c=0xF7F0E3:s=1080x1920:r=${FPS}:d=${(V.total + 0.1).toFixed(3)},format=yuv444p[bg]`,
    `[0:v]crop=1440:1080:240:0,scale=${Lm.w}:${Lm.h}:flags=lanczos,format=yuv444p[m]`,
    `[1:v]trim=end_frame=${ph.n},setpts=N/30/TB+${ph.at.toFixed(4)}/TB,fps=${FPS},scale=${Ls.w}:${Ls.h}:flags=lanczos,format=yuv444p[ph]`,
    `[2:v]fps=${FPS},format=yuva444p[page]`,
    `[bg][m]overlay=${Lm.x}:${Lm.y}:eof_action=repeat[a]`,
    `[a][ph]overlay=${Ls.x}:${Ls.y}:eof_action=pass:enable='${vis}'[b]`,
    `[b][page]overlay=0:0:eof_action=repeat,trim=end_frame=${frames},format=yuv444p[out]`,
  ]
  const vvid = join(EDIT, 'video-vertical.mp4')
  ff(['-i', vmain, '-ss', ((ph.from - 0.5) / 30).toFixed(4), '-i', join(CLIPS, `${ph.clip}.mp4`), '-i', join(CLIPS, 'card-vertical.mov'),
    '-filter_complex', chains.join(';'), '-map', '[out]', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', '-pix_fmt', 'yuv444p', vvid], 'composition verticale')
  renderAudio(V.total, V.audio, join(EDIT, 'vmix.wav'))
  const r = master(join(EDIT, 'vmix.wav'), join(EDIT, 'vmaster.wav'))
  const out = join(ROOT, 'marketing', 'trailer-vertical.mp4')
  ff(['-i', vvid, '-i', join(EDIT, 'vmaster.wav'), '-map', '0:v', '-map', '1:a', '-vf', 'scale=out_range=tv', '-color_range', 'tv', '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2', '-preset', 'slow', '-crf', '18',
    '-maxrate', '16M', '-bufsize', '32M', '-pix_fmt', 'yuv420p', '-g', '120', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out], 'livrable vertical')
  log(`trailer-vertical.mp4 : ${V.total.toFixed(2)} s, ${(statSync(out).size / 1048576).toFixed(1)} Mo, son ${JSON.stringify(r.after)}`)
}
