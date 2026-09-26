// Correcteur « climax » (polish vague 2) : VRAIE partie (runner, UI, bots par défaut), un joueur au
// clavier piloté, N oiseaux. Captures à 55, 85, 98,5, 101, 104, 108 s de chaque manche, rafale de
// 10 images consécutives (screencast) à 101 s, mesures (envergure médiane, largeur cadrée,
// couverture des tours estimée par la caméra, oiseaux cadrés).
//   PORT=8851 node --import ./tools/polish/staging/nohmr.mjs tools/polish/climax/realgame.mjs --n=4 [--rounds=3] [--tag=real]
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { openPC, toLobby, setupRoster, sleep, waitFor, arg, ROOT } from '../feel/lib.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { state, problems } from '../../e2e/qa/lib.mjs'

const N = Number(arg('n', '4'))
const ROUNDS = Number(arg('rounds', '3'))
const TAG = arg('tag', 'real')
const dir = join(ROOT, 'shots/polish2/climax', TAG, `n${N}`)
mkdirSync(dir, { recursive: true })
const logFile = join(dir, '_log.txt')
writeFileSync(logFile, '')
const t0 = Date.now()
const log = (m) => {
  const l = `[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`
  console.log(l)
  appendFileSync(logFile, l + '\n')
}
const TIMES = [55, 85, 98.5, 101, 104, 108]
const FONT = (() => { try { return execFileSync('sh', ['-c', "fc-list : file | grep -iE 'Mono.*Regular.*\\.ttf' | head -1"]).toString().trim().replace(/:\s*$/, '') } catch { return '' } })()

const { browser, ctx, pc, logs } = await openPC({ query: '?debug=nosave', settings: { quality: 'high' } })
await pc.evaluate(async () => {
  const urlOf = (path) => {
    const e = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => new URL(n).pathname === path)
    return e.length ? e[e.length - 1] : path
  }
  const an = await import(urlOf('/src/host/render/bird/anchors.ts'))
  const cue = await import(urlOf('/src/host/camera/cue.ts'))
  window.__climaxReal = () => {
    const st = window.__ombres.runner.sim?.state
    if (!st) return null
    const spans = st.birds.map((b) => an.birdAnchors.spanPx[b.slot]).sort((a, b) => a - b)
    const f = cue.cameraState.frame
    return { t: +st.sun.t.toFixed(2), phase: st.sun.phase, map: st.config.mapId, span: Math.round(spans[Math.floor(spans.length / 2)] ?? 0), width: Math.round(2 * f.halfWidth), cover: +cue.cameraState.towerCover.toFixed(3), punch: +cue.cameraState.punch.toFixed(2), night: st.night.active ? Math.round(st.night.s) : null }
  }
})
await toLobby(pc)
const roster = await setupRoster(pc, { groups: [1], bots: Array.from({ length: N - 1 }, () => ({ lv: 1 })) })
log(`salon : ${JSON.stringify(roster.map((r) => [r.slot, r.kind, r.bot?.personality]))}`)
const kb = roster.find((r) => r.kind === 'keyboard')?.slot ?? 0
const pilot = new KeyboardPilot(pc, 1, () => kb, 5)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 10000, 'cartes')
await sleep(1500)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 20000, 'manche')
const rows = []
for (let r = 1; r <= ROUNDS; r++) {
  await pilot.start()
  let ti = 0
  const files = []
  while (true) {
    const s = await state(pc)
    if (s.phase !== 'round' || s.sunT === null || s.over) break
    while (ti < TIMES.length && s.sunT >= TIMES[ti]) {
      if (s.sunT - TIMES[ti] < 1.2) {
        const m = await pc.evaluate(() => window.__climaxReal())
        const f = join(dir, `r${r}-${TIMES[ti]}.jpg`)
        await pc.screenshot({ path: f, type: 'jpeg', quality: 84 })
        files.push({ f, m })
        rows.push({ r, ...m })
        log(`r${r} ${m.map} t=${m.t} ${m.phase} envergure ${m.span} px largeur ${m.width} m tours ${(100 * m.cover).toFixed(1)} %${m.punch > 0.02 ? ' punch' : ''}`)
        if (TIMES[ti] === 101) {
          const cdp = await ctx.newCDPSession(pc)
          const frames = []
          await new Promise((resolve) => {
            cdp.on('Page.screencastFrame', async (fr) => {
              frames.push(fr.data)
              await cdp.send('Page.screencastFrameAck', { sessionId: fr.sessionId }).catch(() => {})
              if (frames.length >= 10) resolve()
            })
            cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
          })
          await cdp.send('Page.stopScreencast').catch(() => {})
          await cdp.detach().catch(() => {})
          frames.forEach((d, k) => writeFileSync(join(dir, `r${r}-101-b${k}.jpg`), Buffer.from(d, 'base64')))
        }
      }
      ti++
    }
    await sleep(60)
  }
  await pilot.stop()
  const args = []
  for (const { f, m } of files) args.push('-label', `r${r} ${m.map} ${m.t}s env ${m.span}px larg ${m.width}m tours ${(100 * m.cover).toFixed(0)}%`, f)
  try {
    execFileSync('montage', [...(FONT ? ['-font', FONT] : []), ...args, '-tile', '3x', '-geometry', '640x360+3+3', '-pointsize', '18', join(dir, `sheet-r${r}.jpg`)])
  } catch (e) {
    log(`montage : ${e.message}`)
  }
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres?.useUi.getState().screen), null, 40000, 'résultats')
  if (r === ROUNDS || (await state(pc)).phase === 'matchResults') break
  await sleep(1500)
  await pc.keyboard.press('Enter')
  await waitFor(pc, () => window.__ombres?.runner.phase === 'round', null, 40000, 'manche suivante')
}
writeFileSync(join(dir, 'metrics.json'), JSON.stringify(rows, null, 1))
const gs = rows.filter((x) => x.phase === 'greatShadow')
const sp = gs.map((x) => x.span).sort((a, b) => a - b)
log(`Grande Ombre (${gs.length} images) : envergure médiane ${sp[Math.floor(sp.length / 2)]} px (min ${sp[0]}), largeur ${gs.map((x) => x.width).join(' ')} m, tours max ${(100 * Math.max(...gs.map((x) => x.cover))).toFixed(1)} %`)
const p = problems(logs)
log(p.length ? `PROBLÈMES : ${[...new Set(p)].slice(0, 12).join(' | ')}` : 'console propre')
await browser.close()
