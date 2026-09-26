// Exporte les glyphes des joueurs en fichiers servis :
//   public/ui/glyphs/<clé>.svg        (currentColor : <img>, CSS mask-image, téléphone)
//   public/ui/glyphs-atlas.png        (12 × 64 px, blanc sur transparent, pour les sprites 3D ;
//                                      ordre = index de couleur, voir GLYPH_KEYS)
// Usage : npx tsx src/dev/ui/exportGlyphs.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { GLYPH_KEYS, GLYPH_INNER, GLYPH_VIEWBOX, glyphSvg } from '../../host/ui/glyphShapes.ts'
// @ts-expect-error module JS sans types (outillage partagé du lead)
import { launch } from '../../../tools/lib/browser.mjs'

const OUT = 'public/ui'
mkdirSync(`${OUT}/glyphs`, { recursive: true })
for (const key of GLYPH_KEYS) writeFileSync(`${OUT}/glyphs/${key}.svg`, glyphSvg(key, { size: 64 }) + '\n')

const cell = 64
const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div id="a" style="display:flex;width:${cell * GLYPH_KEYS.length}px;height:${cell}px;color:#fff">
${GLYPH_KEYS.map(k => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${GLYPH_VIEWBOX}" width="${cell}" height="${cell}" style="padding:4px;box-sizing:border-box">${GLYPH_INNER[k]}</svg>`).join('')}
</div></body></html>`

const browser = await launch()
const page = await browser.newPage({ viewport: { width: cell * GLYPH_KEYS.length, height: cell } })
await page.setContent(html)
await page.locator('#a').screenshot({ path: `${OUT}/glyphs-atlas.png`, omitBackground: true })
await browser.close()
console.log(`écrit : ${GLYPH_KEYS.length} SVG + ${OUT}/glyphs-atlas.png`)
