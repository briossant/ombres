// Vérificateur antialiasing : planche de recadrages agrandis (filtre « point ») en JPEG.
// Colonnes = images (même cadre), lignes = régions. Régions en px de l'image (--r), ou lues dans un JSON de
// cibles (--targets, écrit par verify-shots.mjs / shots.mjs). Nécessite ImageMagick (`magick`).
//   node tools/polish/aa/verify-sheets.mjs --out=sheet.jpg --img=label=file.png [--img=…] \
//     [--targets=file-targets.json] [--r='nom=x,y,w,h'] [--scale=3] [--k=1]
//   --k : facteur appliqué aux régions (ex. 2 pour des régions 1080p sur une image 4K).
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const args = k => process.argv.filter(a => a.startsWith(`--${k}=`)).map(a => a.split('=').slice(1).join('='))
const OUT = arg('out', 'sheet.jpg')
const SCALE = Number(arg('scale', '3'))
const K = Number(arg('k', '1'))
const IMGS = args('img').map(v => { const i = v.indexOf('='); return { label: v.slice(0, i), file: v.slice(i + 1) } })
const REG = args('r').map(r => { const [n, v] = r.split('='); const [x, y, w, h] = v.split(',').map(Number); return { n, x, y, w, h } })
const tf = arg('targets', '')
if (tf && existsSync(tf)) for (const [n, b] of Object.entries(JSON.parse(readFileSync(tf, 'utf8')))) REG.push({ n, ...b })
const FONT = (() => { try { return execFileSync('fc-match', ['-f', '%{file}', 'DejaVu Sans'], { encoding: 'utf8' }).trim() } catch { return '' } })()
const tmp = join(tmpdir(), `aa-vsheet-${process.pid}`)
mkdirSync(tmp, { recursive: true })
mkdirSync(dirname(OUT), { recursive: true })
const mk = a => execFileSync('magick', a, { stdio: ['ignore', 'ignore', 'inherit'] })
const rows = []
for (const [ri, r] of REG.entries()) {
  const tiles = []
  for (const [ci, im] of IMGS.entries()) {
    const t = join(tmp, `${ri}-${ci}.png`)
    const g = `${Math.round(r.w * K)}x${Math.round(r.h * K)}+${Math.round(r.x * K)}+${Math.round(r.y * K)}`
    mk([im.file, '-crop', g, '+repage', '-filter', 'point', '-resize', `${(SCALE * 100) / K}%`, '-gravity', 'north', '-background', '#222', '-splice', '0x22', ...(FONT ? ['-font', FONT] : []), '-pointsize', '15', '-fill', '#eee', '-annotate', '+0+3', `${im.label} · ${r.n}`, '-bordercolor', '#222', '-border', '3', t])
    tiles.push(t)
  }
  const row = join(tmp, `row-${ri}.png`)
  mk([...tiles, '+append', row])
  rows.push(row)
}
mk([...rows, '-append', '-quality', '90', OUT])
rmSync(tmp, { recursive: true, force: true })
console.log(OUT)
