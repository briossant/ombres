// Écart de variantes à une référence SSAA (tools/polish/aa/shots.mjs, variante `__aa.ssaa(q)`), mesuré
// seulement AUTOUR DES BORDS de la référence (là où l'antialiasing se joue ; les aplats sont identiques).
//   node tools/polish/aa/metric.mjs --dir=shots/polish-aa/v3 --t=12 --ref=ref --vars=oldL,newL,newH [--crop=x,y,w,h]
// Sortie : erreur absolue moyenne (0..255) sur le masque des bords, et RMSE de l'image entière.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const DIR = resolve(arg('dir', '.'))
const T = arg('t', '12')
const REF = arg('ref', 'ref')
const VARS = arg('vars', '').split(',').filter(Boolean)
const CROP = arg('crop', '')
const tmp = mkdtempSync(join(tmpdir(), 'aa-metric-'))
const mk = a => execFileSync('magick', a, { encoding: 'utf8' }).trim()
const src = v => {
  const f = join(DIR, `${T}-${v}.png`)
  if (!CROP) return f
  const [x, y, w, h] = CROP.split(',')
  const o = join(tmp, `${v}.png`)
  mk([f, '-crop', `${w}x${h}+${x}+${y}`, '+repage', o])
  return o
}
const ref = src(REF)
// masque : gradient morphologique (Edge) de la luminance de la référence > 6 %, dilaté de 2 px
const mask = join(tmp, 'mask.png')
mk([ref, '-colorspace', 'gray', '-morphology', 'Edge', 'Square:1', '-threshold', '6%', '-morphology', 'Dilate', 'Disk:2', mask])
const cover = Number(mk([mask, '-format', '%[fx:mean]', 'info:']))
console.log(`référence ${REF} ; masque des bords : ${(cover * 100).toFixed(1)} % des pixels`)
for (const v of VARS) {
  const a = src(v)
  const diff = join(tmp, `d-${v}.png`)
  mk([a, ref, '-compose', 'difference', '-composite', '-colorspace', 'gray', diff])
  const m = Number(mk([diff, mask, '-compose', 'multiply', '-composite', '-format', '%[fx:mean]', 'info:']))
  let rmse = ''
  try {
    execFileSync('magick', ['compare', '-metric', 'RMSE', a, ref, 'null:'], { stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (e) {
    rmse = String(e.stderr).match(/\(([\d.e-]+)\)/)?.[1] ?? ''
  }
  console.log(`${v.padEnd(14)} bords : ${((m / cover) * 255).toFixed(2)} / 255   image : RMSE ${(Number(rmse) * 255).toFixed(2)} / 255`)
}
rmSync(tmp, { recursive: true, force: true })
