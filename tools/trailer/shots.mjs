// Repérage des plans de la démo du titre : coupes détectées (ffmpeg scdet) et planche de la première,
// du milieu et de la dernière image de chaque plan, pour choisir tools/trailer/title-shots.json.
//   node tools/trailer/shots.mjs [--clip=title-demo] [--threshold=4]
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { CLIPS, WORK, FFMPEG } from './lib/stage.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const clip = opt.clip ?? 'title-demo'
const src = join(CLIPS, `${clip}.mp4`)
const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', src, '-vf', `scale=480:-1,scdet=threshold=${opt.threshold ?? 4}`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 })
const cuts = [...r.stderr.matchAll(/lavfi\.scd\.time:\s*([\d.]+)/g)].map(m => Math.round(Number(m[1]) * 60))
const n = Number(/frame=\s*(\d+)/.exec(r.stderr.split('\n').reverse().find(l => /frame=/.test(l)) ?? '')?.[1] ?? 0)
const bounds = [0, ...cuts.filter(c => c > 0)]
const shots = bounds.map((a, i) => ({ from: a, to: (bounds[i + 1] ?? n) - 1 }))
console.log(shots.map((s, i) => `${String(i).padStart(2)}  ${String(s.from).padStart(5)} → ${String(s.to).padStart(5)}  (${((s.to - s.from + 1) / 60).toFixed(2)} s)`).join('\n'))
writeFileSync(join(WORK, `${clip}-shots.json`), JSON.stringify(shots, null, 1))
// planche : début, milieu, fin de chaque plan
const pick = shots.flatMap(s => [s.from, Math.round((s.from + s.to) / 2), s.to])
const expr = pick.map(f => `eq(n\\,${f})`).join('+')
const out = join(WORK, `${clip}-shots.jpg`)
spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vf', `select='${expr}',scale=320:-1,drawtext=text='%{eif\\:n\\:d}':x=4:y=4:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6,tile=9x${Math.ceil(pick.length / 9)}`, '-frames:v', '1', out], { stdio: 'inherit' })
console.log(`planche : ${out} (index de vignette = 3 × plan + 0/1/2 pour début/milieu/fin)`)
