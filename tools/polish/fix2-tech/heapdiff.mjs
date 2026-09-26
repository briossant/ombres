// Polish vague 2 (tech, ordre 5) : ce qui grossit dans le tas JS entre deux instantanés de detached.mjs
// (même session, 1 puis 2 cycles) : nombre et taille propre par constructeur, plus gros écarts d'abord.
//   node --max-old-space-size=8000 tools/polish/fix2-tech/heapdiff.mjs [dossier des instantanés]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dir = process.argv[2] ?? process.env.HEAP_DIR ?? join(tmpdir(), 'ombres-heap')
function agg(f) {
  const s = JSON.parse(readFileSync(f, 'utf8'))
  const m = s.snapshot.meta
  const NF = m.node_fields.length
  const [iType, iName, iSize] = ['type', 'name', 'self_size'].map(k => m.node_fields.indexOf(k))
  const nt = m.node_types[iType]
  const out = new Map()
  let total = 0
  for (let i = 0; i < s.nodes.length; i += NF) {
    const t = nt[s.nodes[i + iType]]
    let n = s.strings[s.nodes[i + iName]]
    if (t === 'string' || t === 'concatenated string' || t === 'sliced string') n = '(chaînes)'
    else if (t === 'code') n = '(code)'
    else if (t === 'hidden' || t === 'array') n = `(${t}) ${n}`.slice(0, 60)
    else n = `${t}:${n}`.slice(0, 80)
    const size = s.nodes[i + iSize]
    total += size
    const e = out.get(n) ?? { c: 0, b: 0 }
    e.c++
    e.b += size
    out.set(n, e)
  }
  return { out, total }
}
const A = agg(join(dir, 'c1.heapsnapshot'))
const B = agg(join(dir, 'c2.heapsnapshot'))
console.log(`taille propre totale : ${(A.total / 1048576).toFixed(2)} → ${(B.total / 1048576).toFixed(2)} Mo`)
const rows = []
for (const k of new Set([...A.out.keys(), ...B.out.keys()])) {
  const a = A.out.get(k) ?? { c: 0, b: 0 }
  const b = B.out.get(k) ?? { c: 0, b: 0 }
  rows.push([k, b.c - a.c, b.b - a.b, a.c, b.c])
}
rows.sort((x, y) => y[2] - x[2])
for (const [k, dc, db, ac, bc] of rows.slice(0, 25)) console.log(`${(db / 1024).toFixed(1).padStart(9)} Ko ${String(dc).padStart(7)} obj  (${ac} → ${bc})  ${k}`)
