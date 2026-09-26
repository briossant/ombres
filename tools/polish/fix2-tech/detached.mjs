// Polish vague 2 (tech, ordre 5) : qui retient les nœuds DOM détachés qui s'accumulent d'une partie à
// l'autre (~20 par partie) ? Deux instantanés du tas (CDP) après 1 puis 2 cycles (parties + salon + titre),
// nœuds détachés NOUVEAUX dans le 2e, chemin de rétention le plus court vers une racine.
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/detached.mjs [--matches=2] [--analyze] [--only=audio]
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, newContext } from '../../lib/browser.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { ORIGIN, sleep, waitFor, presetSettings, lobbyWith, startMatch, kbSlot } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const MATCHES = Number(arg('matches', '2'))
// instantanés de 50 à 100 Mo : hors du dépôt (HEAP_DIR pour les garder ailleurs)
const TMP = process.env.HEAP_DIR ?? join(tmpdir(), 'ombres-heap')
mkdirSync(TMP, { recursive: true })
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await presetSettings(pc, { lang: 'fr', quality: 'low', narrator: 'text' }, 'low')
const cdp = await ctx.newCDPSession(pc)
await cdp.send('HeapProfiler.enable')
await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=8`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await lobbyWith(pc, 6, { rounds: 1 })
await pc.mouse.click(5, 5)
let slot = await kbSlot(pc)
const pilot = new KeyboardPilot(pc, 1, () => slot, 17)

async function cycle(c) {
  if (c > 1) {
    if (!(await pc.evaluate(() => window.__ombres.runner.roster.players.some(p => p.kind === 'keyboard')))) {
      await pc.keyboard.press('Space')
      await sleep(400)
    }
    await pc.evaluate(() => {
      const r = window.__ombres.runner
      r.setMatchSetting('rounds', 1)
      let g = 12
      while (r.roster.size < 6 && g--) if (!r.addBot(null, 1)) break
    })
    slot = await kbSlot(pc)
  }
  for (let m = 1; m <= MATCHES; m++) {
    if (m === 1) await startMatch(pc)
    else {
      await pc.keyboard.press('Enter')
      await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 30000, 'revanche')
    }
    await pilot.start()
    await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'matchResults', null, 300000, 'podium')
    await pilot.stop()
    await sleep(4000)
  }
  await pc.keyboard.press('Escape')
  await waitFor(pc, () => window.__ombres.runner.phase === 'lobby', null, 20000, 'salon')
  await sleep(1500)
  await pc.evaluate(() => window.__ombres.runner.enterTitle())
  await sleep(1500)
  await pc.evaluate(() => window.__ombres.runner.enterCredits())
  await sleep(3000)
  await pc.keyboard.press('Escape')
  await sleep(1500)
  await pc.evaluate(() => window.__ombres.runner.enterLobby())
  await sleep(2500)
  await pc.mouse.click(5, 5)
}

async function snapshot(name) {
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  const chunks = []
  const on = e => chunks.push(e.chunk)
  cdp.on('HeapProfiler.addHeapSnapshotChunk', on)
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false })
  cdp.off('HeapProfiler.addHeapSnapshotChunk', on)
  const f = join(TMP, `${name}.heapsnapshot`)
  writeFileSync(f, chunks.join(''))
  return f
}

function parse(f) {
  const s = JSON.parse(readFileSync(f, 'utf8'))
  const m = s.snapshot.meta
  const NF = m.node_fields.length
  const EF = m.edge_fields.length
  const iType = m.node_fields.indexOf('type')
  const iName = m.node_fields.indexOf('name')
  const iId = m.node_fields.indexOf('id')
  const iEc = m.node_fields.indexOf('edge_count')
  const iDet = m.node_fields.indexOf('detachedness')
  const eType = m.edge_fields.indexOf('type')
  const eName = m.edge_fields.indexOf('name_or_index')
  const eTo = m.edge_fields.indexOf('to_node')
  const nodeTypes = m.node_types[iType]
  const edgeTypes = m.edge_types[eType]
  const N = s.nodes.length / NF
  const firstEdge = new Uint32Array(N + 1)
  for (let i = 0, e = 0; i < N; i++) {
    firstEdge[i] = e
    e += s.nodes[i * NF + iEc] * EF
    firstEdge[i + 1] = e
  }
  // arêtes inverses (sans les faibles)
  const rev = new Map()
  for (let i = 0; i < N; i++) {
    for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += EF) {
      if (edgeTypes[s.edges[e + eType]] === 'weak') continue
      const to = s.edges[e + eTo] / NF
      let a = rev.get(to)
      if (!a) rev.set(to, (a = []))
      a.push([i, e])
    }
  }
  const name = i => s.strings[s.nodes[i * NF + iName]]
  const type = i => nodeTypes[s.nodes[i * NF + iType]]
  const id = i => s.nodes[i * NF + iId]
  const det = i => (iDet >= 0 ? s.nodes[i * NF + iDet] : 0)
  const edgeLabel = e => {
    const t = edgeTypes[s.edges[e + eType]]
    const n = s.edges[e + eName]
    return t === 'element' || t === 'hidden' ? `[${n}]` : String(s.strings[n])
  }
  return { N, name, type, id, det, rev, edgeLabel }
}

const ANALYZE = process.argv.includes('--analyze') // relit les instantanés existants, sans navigateur
let f1 = join(TMP, 'c1.heapsnapshot')
let f2 = join(TMP, 'c2.heapsnapshot')
if (!ANALYZE) {
  await cycle(1)
  f1 = await snapshot('c1')
  log('instantané 1', f1)
  await cycle(2)
  f2 = await snapshot('c2')
  log('instantané 2', f2)
}
await browser.close()

const A = parse(f1)
const idsA = new Set()
for (let i = 0; i < A.N; i++) if (A.det(i) === 2 || /^Detached /.test(A.name(i))) idsA.add(A.id(i))
const B = parse(f2)
const fresh = []
const counts = new Map()
for (let i = 0; i < B.N; i++) {
  const isDet = B.det(i) === 2 || /^Detached /.test(B.name(i))
  if (!isDet) continue
  const k = B.name(i)
  counts.set(k, (counts.get(k) ?? 0) + 1)
  if (!idsA.has(B.id(i))) fresh.push(i)
}
log(`détachés : ${idsA.size} (cycle 1) → ${[...counts.values()].reduce((a, b) => a + b, 0)} (cycle 2), nouveaux ${fresh.length}`)
const fc = new Map()
for (const i of fresh) fc.set(B.name(i), (fc.get(B.name(i)) ?? 0) + 1)
log('nouveaux par nom :', JSON.stringify([...fc].sort((a, b) => b[1] - a[1]).slice(0, 15)))
const ca = new Map()
for (let i = 0; i < A.N; i++) if (A.det(i) === 2 || /^Detached /.test(A.name(i))) ca.set(A.name(i), (ca.get(A.name(i)) ?? 0) + 1)
const grew = [...counts].map(([k, v]) => [k, (ca.get(k) ?? 0), v]).filter(([, a, b]) => b !== a)
log('détachés par nom, cycle 1 → cycle 2 (seulement ceux qui changent) :', JSON.stringify(grew))
// chemin de rétention le plus court (BFS inverse) vers un nœud non détaché « visible » (système/racine)
const paths = new Map()
const ONLY = arg('only', '') // --only=audio : seulement les nœuds dont le nom contient ce texte
for (const start of fresh.filter(i => !ONLY || B.name(i).includes(ONLY)).slice(0, 400)) {
  const prev = new Map([[start, null]])
  const q = [start]
  let found = -1
  while (q.length && found < 0) {
    const n = q.shift()
    for (const [from, e] of B.rev.get(n) ?? []) {
      if (prev.has(from)) continue
      prev.set(from, [n, e])
      const nm = B.name(from)
      const ty = B.type(from)
      // on s'arrête sur un objet JS nommé qui n'est ni du DOM détaché ni interne à React/V8
      if (ty === 'object' && B.det(from) !== 2 && !/^Detached |^(system|Object|Array|\(|Fiber|FiberNode|HTML|Text|SVG|Comment|CSS)/.test(nm)) {
        found = from
        break
      }
      if (prev.size > 20000) break
      q.push(from)
    }
  }
  if (found < 0) continue
  const chain = []
  let cur = found
  while (cur !== start && chain.length < 14) {
    const [next, e] = prev.get(cur) ?? [null, null]
    if (next === null) break
    chain.push(`${B.name(cur)}.${B.edgeLabel(e)}`)
    cur = next
  }
  chain.push(B.name(start))
  const key = chain.join(' → ')
  paths.set(key, (paths.get(key) ?? 0) + 1)
}
console.log('--- chemins de rétention (nombre de nœuds nouveaux) ---')
for (const [k, v] of [...paths].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(String(v).padStart(4), k.slice(0, 600))
