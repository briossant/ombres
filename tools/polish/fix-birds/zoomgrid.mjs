// Agrandit une zone d'une capture (×8, pixels nets) avec une grille tous les 5 px d'origine,
// pour relever des coordonnées exactes avant sample-oklch.
//   node tools/polish/fix-birds/zoomgrid.mjs <capture.jpg> x,y,w,h <sortie.png>
import { execFileSync } from 'node:child_process'
const FONT = execFileSync('fc-match', ['-f', '%{file}', 'monospace']).toString().trim()
const [file, rect, out] = process.argv.slice(2)
const [x, y, w, h] = rect.split(',').map(Number)
const Z = 8
const draw = []
for (let i = 0; i <= w; i += 5) draw.push('-draw', `line ${i * Z},0 ${i * Z},${h * Z}`)
for (let j = 0; j <= h; j += 5) draw.push('-draw', `line 0,${j * Z} ${w * Z},${j * Z}`)
const labels = []
for (let i = 0; i <= w; i += 10) labels.push('-annotate', `+${i * Z + 2}+12`, String(x + i))
for (let j = 10; j <= h; j += 10) labels.push('-annotate', `+2+${j * Z - 2}`, String(y + j))
execFileSync('magick', [file, '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-filter', 'point', '-resize', `${Z * 100}%`, '-stroke', '#00000055', ...draw, '-stroke', 'none', '-fill', '#ffffff', '-undercolor', '#000000aa', '-font', FONT, '-pointsize', '12', ...labels, out])
console.log(out)
