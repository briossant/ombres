// Sonie de chaque couche de la partition, seule, sur une portion de manche (vraie simulation).
//   node tools/audio-stems.mjs --from=60 --seconds=10 [--port=8804]
// Écrit shots/audio/stems_<début>/<couche>.wav et imprime la sonie intégrée de chacune.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))
const from = opt.from ?? 60, secs = opt.seconds ?? 10, port = opt.port ?? 8804
const layers = ['drone', 'pad', 'glass', 'melody', 'bass', 'perc', 'duduk', 'seq', 'strings', 'heart', 'riser', 'braam', 'stab']
const dir = `shots/audio/stems_${from}`
mkdirSync(dir, { recursive: true })
for (const l of layers) {
  const mute = layers.filter(x => x !== l).join(',')
  const out = execFileSync('node', ['tools/audio-render.mjs', `--port=${port}`, '--real', '--buses=music', `--from=${from}`, `--seconds=${secs}`, `--mute=${mute}`, `--out=${dir}/${l}.wav`], { encoding: 'utf8' })
  const j = JSON.parse(out.slice(out.indexOf('{')))
  console.log(`${l.padEnd(8)} LUFS ${String(j.integrated).padStart(6)}  crête ${j.peak}`)
}
