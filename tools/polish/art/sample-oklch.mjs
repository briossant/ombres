// Revue DA : OKLCH moyen (9×9 px) de points d'une capture.
//   node tools/polish/art/sample-oklch.mjs <capture.jpg> x,y [x,y …]
import { execSync } from 'node:child_process'
const s2l=c=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4}
const lab=(r,g,b)=>{r=s2l(r);g=s2l(g);b=s2l(b);const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b),m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b),s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);return [0.2104542553*l+0.7936177850*m-0.0040720468*s,1.9779984951*l-2.4285922050*m+0.4505937099*s,0.0259040371*l+0.7827717662*m-0.8086757660*s]}
const [file,...pts]=process.argv.slice(2)
for(const p of pts){const out=execSync(`magick ${file} -crop 9x9+${p.split(',')[0]-4}+${p.split(',')[1]-4} -scale 1x1! -format "%[fx:round(255*r)],%[fx:round(255*g)],%[fx:round(255*b)]" info:`).toString();const [r,g,b]=out.split(',').map(Number);const [L,a,bb]=lab(r,g,b);const C=Math.hypot(a,bb);let h=Math.atan2(bb,a)*180/Math.PI;if(h<0)h+=360;console.log(p,`rgb(${r},${g},${b})`,`#${[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('')}`,`L ${L.toFixed(3)} C ${C.toFixed(3)} h ${h.toFixed(0)}`)}
