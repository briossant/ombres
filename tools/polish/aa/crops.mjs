// Recadrages agrandis (pixels nets, filtre « point ») de captures de tools/polish/aa/shots.mjs, côte à côte
// par variante, étiquetés ; JPEG. Nécessite ImageMagick (`magick`).
//   node tools/polish/aa/crops.mjs --dir=shots/polish-aa/midi --t=10 --vars=avant,apres \
//     --r='disque=590,145,200,130' --r='oiseau=1400,760,160,110' [--scale=4] [--out=shots/polish-aa/sheets] [--stack]
//   --stack : variantes les unes sous les autres (défaut : côte à côte).
//   --auto : régions lues dans <dir>/<t>-targets.json (écrit par shots.mjs : chapeau, fut, oiseau, icones,
//   simoun), en plus des --r ; --sheet : toutes les régions dans UNE planche (lignes = régions, colonnes =
//   variantes) au lieu d'un fichier par région.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const args = k => process.argv.filter(a => a.startsWith(`--${k}=`)).map(a => a.split('=').slice(1).join('='))
const DIR = resolve(arg('dir', '.'))
const T = arg('t', '10')
const VARS = arg('vars', '').split(',').filter(Boolean)
const SCALE = Number(arg('scale', '4'))
const OUT = resolve(arg('out', join(DIR, 'sheets')))
const NAME = arg('name', '')
const STACK = process.argv.includes('--stack')
const REGIONS = args('r').map(r => {
  const [n, v] = r.split('=')
  const [x, y, w, h] = v.split(',').map(Number)
  return { n, x, y, w, h }
})
if (process.argv.includes('--auto')) {
  const f = join(DIR, `${T}-targets.json`)
  if (existsSync(f)) for (const [n, b] of Object.entries(JSON.parse(readFileSync(f, 'utf8')))) REGIONS.push({ n, ...b })
}
const SHEET = process.argv.includes('--sheet')
mkdirSync(OUT, { recursive: true })
const tmp = join(tmpdir(), `aa-crops-${process.pid}`)
mkdirSync(tmp, { recursive: true })
// police : première trouvée par fontconfig (sinon ImageMagick échoue sans police par défaut)
const FONT = (() => {
  try {
    return execFileSync('fc-match', ['-f', '%{file}', 'DejaVu Sans'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
})()
const mk = a => execFileSync('magick', a, { stdio: ['ignore', 'ignore', 'inherit'] })

const rows = []
for (const r of REGIONS) {
  const tiles = []
  for (const v of VARS) {
    const src = join(DIR, `${T}-${v}.png`)
    if (!existsSync(src)) {
      console.log(`!! ${src} introuvable`)
      continue
    }
    // la capture peut être en 4K : les coordonnées suivent la capture (donner les px de CETTE image)
    const f = join(tmp, `${r.n}-${v}.png`)
    mk([src, '-crop', `${r.w}x${r.h}+${r.x}+${r.y}`, '+repage', '-filter', 'point', '-resize', `${SCALE * 100}%`,
      '-gravity', 'North', '-background', '#222', '-splice', '0x26', ...(FONT ? ['-font', FONT] : []), '-fill', 'white', '-pointsize', '18', '-annotate', '+0+3', `${v}  (×${SCALE})`, f])
    tiles.push(f)
  }
  if (!tiles.length) continue
  if (SHEET) {
    const row = join(tmp, `row-${r.n}.png`)
    mk([...tiles, '-background', '#222', '-bordercolor', '#222', '-border', '3', '+append', row])
    rows.push(row)
    continue
  }
  const out = join(OUT, `${NAME ? NAME + '-' : ''}${T}-${r.n}-x${SCALE}.jpg`)
  mk([...tiles, '-background', '#222', '-bordercolor', '#222', '-border', '3', STACK ? '-append' : '+append', '-quality', '88', out])
  console.log(out)
}
if (SHEET && rows.length) {
  const out = join(OUT, `${NAME ? NAME + '-' : ''}${T}-x${SCALE}.jpg`)
  mk([...rows, '-background', '#222', '-gravity', 'West', '-append', '-quality', '86', out])
  console.log(out)
}
rmSync(tmp, { recursive: true, force: true })
