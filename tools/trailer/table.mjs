// Découpage de la bande-annonce en tableau Markdown (pour docs/launch/trailer.md), tiré de edl.mjs et des
// textes de src/dev/trailer/cards.ts.
//   node tools/trailer/table.mjs [--variant=A]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildEdl } from './edl.mjs'
import { ROOT } from './lib/stage.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const src = readFileSync(join(ROOT, 'src/dev/trailer/cards.ts'), 'utf8')
/** Texte d'un carton : `text: '…'` ou les `text` de ses lignes. */
function cardText(id) {
  const re = new RegExp(`\\n  '?${id.replace(/-/g, '\\-')}'?: `)
  const m = re.exec(src)
  if (!m) return id
  const i = m.index + 1
  const next = /\n  ['a-z]|\n}/g
  next.lastIndex = i + 1
  const block = src.slice(i, next.exec(src)?.index ?? src.length)
  const t = [...block.matchAll(/text: '([^']*)'/g)].map(m => m[1].replace('{color}', 'Lagoon'))
  if (/kind: 'final'/.test(block)) return 'logo OMBRES · « A party game for 1–12 players · your phone is the controller » · « Play free in your browser » · ombres.deploy.breizhware.com' + (/credit: true/.test(block) ? ' · crédit IA' : '')
  if (/kind: 'howto'/.test(block)) return '« Grab your phones » · « Scan the QR code » · « Join in seconds » · « Your phone is the controller » · « 1–12 players » · « No app, no install » · « Free in your browser »'
  return t.length ? t.map(x => `« ${x} »`).join(' ') : id
}
const E = buildEdl(opt.variant ?? 'A')
const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
const rows = ['| # | Début | Durée | Image | Texte à l\'écran |', '|---|---|---|---|---|']
for (const [i, p] of E.plans.entries()) {
  const d = p.pieces.reduce((a, x) => a + x.n, 0) / 60
  const cards = [...new Set([...(p.cards ?? []).filter(c => !c.offset).map(c => cardText(c.id)), ...(p.howto ? [cardText('howto')] : [])])].join(' ; ')
  rows.push(`| ${i + 1} | ${fmt(p.start)} | ${d.toFixed(2)} s | ${p.name} | ${cards || '—'} |`)
}
console.log(rows.join('\n'))
console.log(`\nDurée totale : ${E.total.toFixed(2)} s. Sections musicales (s) : midi 0 · heure dorée ${E.sections.B.toFixed(2)} · couchant ${E.sections.C.toFixed(2)} · Grande Ombre ${E.sections.GS.toFixed(2)} · nuit ${E.sections.night.toFixed(2)}.`)
