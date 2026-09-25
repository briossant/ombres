import { execFileSync } from 'child_process';
const s2l = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const LUT = new Float32Array(256).map((_, i) => s2l(i / 255));
for (const f of process.argv.slice(2)) {
  const buf = execFileSync('magick', [f, '-resize', '960x540', '-depth', '8', 'rgb:-'], { maxBuffer: 1 << 26 });
  const n = buf.length / 3, Ls = new Float32Array(n);
  for (let i = 0; i < n; i++) { const r = LUT[buf[3*i]], g = LUT[buf[3*i+1]], b = LUT[buf[3*i+2]];
    const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b), m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b), s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
    Ls[i] = 0.2104542553*l + 0.7936177850*m - 0.0040720468*s; }
  const sorted = Float32Array.from(Ls).sort(); let above = 0, dark = 0; for (const v of Ls) { if (v > 0.6) above++; if (v < 0.3) dark++; }
  console.log(f.padEnd(10), 'L>0.6:', (100*above/n).toFixed(1)+'%', 'median:', sorted[n>>1].toFixed(3), 'p10:', sorted[Math.floor(n*0.1)].toFixed(3), 'L<0.3:', (100*dark/n).toFixed(2)+'%');
}
