// Polish vague 2 (tech, ordre 5) : fuites sur une session complète.
//   titre → salon (12 oiseaux : 1 clavier + 11 bots) → partie 1 → revanche → revanche (3 manches chacune)
//   → retour au salon → titre → crédits → titre → salon.
// Points de contrôle (mêmes écrans au début et à la fin) : tas JS après GC (CDP), objets GPU de three
// (renderer.info.memory, programmes), objets WebGL vivants (sonde), nœuds DOM, écouteurs, minuteries.
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/leaks.mjs [--speed=6] [--birds=12] [--rounds=3] [--cycles=1]
import { launch, newContext } from '../../lib/browser.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings, lobbyWith, startMatch, kbSlot, collect, glCounts, heap } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const SPEED = Number(arg('speed', '6'))
const BIRDS = Number(arg('birds', '12'))
const ROUNDS = Number(arg('rounds', '3'))
/** Nombre de cycles complets (3 parties + salon + titre + crédits + salon) : la tendance se lit au 2e */
const CYCLES = Number(arg('cycles', '1'))
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const browser = await launch({ extraArgs: ['--enable-precise-memory-info'] })
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: 'medium', narrator: 'voice' }, 'medium')
const cdp = await ctx.newCDPSession(pc)
await cdp.send('HeapProfiler.enable')
await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=${SPEED}`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await pc.keyboard.press('Enter') // geste : son déverrouillé (les voix et la musique tournent pour de vrai)

const rows = []
async function checkpoint(label) {
  await sleep(2500)
  const gl = await glCounts(pc)
  const h = await heap(pc, cdp)
  const x = await pc.evaluate(() => {
    const info = window.__ombres.gl?.info
    return {
      phase: window.__ombres.runner.phase,
      geo: info?.memory.geometries,
      texInfo: info?.memory.textures,
      progInfo: info?.programs?.length,
      calls: info?.render.calls,
      dom: document.getElementsByTagName('*').length,
      audio: document.getElementsByTagName('audio').length,
    }
  })
  const row = { label, ...x, heapMB: h.usedMB, domNodes: h.dom?.nodes, listeners: h.dom?.jsEventListeners, tex: gl.texture, buf: gl.buffer, prog: gl.program, fbo: gl.framebuffer, vao: gl.vertexArray, timeouts: gl.timers.timeouts, intervals: gl.timers.intervals }
  rows.push(row)
  log(label.padEnd(20), JSON.stringify(row))
  return row
}

await sleep(3000)
const T0 = await checkpoint('titre (début)')
await lobbyWith(pc, BIRDS, { rounds: ROUNDS })
const L0 = await checkpoint('salon (début)')
await pc.mouse.click(5, 5)
let slotNow = await kbSlot(pc)
const pilot = new KeyboardPilot(pc, 1, () => slotNow, 17)
const ends = []
let L1 = null
let T1 = null
let L2 = null
for (let c = 1; c <= CYCLES; c++) {
  if (c > 1) {
    // salon retrouvé : joueur clavier (Espace) et N oiseaux, comme au premier cycle
    if (!(await pc.evaluate(() => window.__ombres.runner.roster.players.some(p => p.kind === 'keyboard')))) {
      await pc.keyboard.press('Space')
      await sleep(400)
    }
    await pc.evaluate(
      ([total, rounds]) => {
        const r = window.__ombres.runner
        r.setMatchSetting('rounds', rounds)
        let guard = 20
        while (r.roster.size < total && guard--) if (!r.addBot(null, 1)) break
      },
      [BIRDS, ROUNDS],
    )
    slotNow = await kbSlot(pc)
  }
  for (let m = 1; m <= 3; m++) {
    if (m === 1) await startMatch(pc)
    else {
      await pc.keyboard.press('Enter') // revanche
      await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 30000, 'revanche')
    }
    await pilot.start()
    for (let r = 1; r <= ROUNDS; r++) {
      await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres.runner.phase), null, 300000, `fin manche ${m}.${r}`)
      if (r < ROUNDS) {
        await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'roundResults', null, 30000, 'résultats')
        await sleep(1200)
        await pc.keyboard.press('Enter')
        await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 30000, 'manche suivante')
      }
    }
    await pilot.stop()
    await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'matchResults', null, 30000, 'podium')
    await checkpoint(`c${c} partie ${m} podium`)
  }
  await pc.keyboard.press('Escape')
  await waitFor(pc, () => window.__ombres.runner.phase === 'lobby', null, 20000, 'salon')
  L1 = await checkpoint(`c${c} salon (retour)`)
  await pc.evaluate(() => window.__ombres.runner.enterTitle())
  await sleep(1500)
  await pc.evaluate(() => window.__ombres.runner.enterCredits())
  await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'credits', null, 10000, 'crédits')
  await sleep(6000)
  await checkpoint(`c${c} crédits`)
  await pc.keyboard.press('Escape')
  await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'title', null, 10000, 'titre')
  T1 = await checkpoint(`c${c} titre (fin)`)
  await pc.evaluate(() => window.__ombres.runner.enterLobby())
  L2 = await checkpoint(`c${c} salon (fin)`)
  ends.push(L2)
  await pc.mouse.click(5, 5)
}
const d = (a, b, k) => `${k} ${a[k]} → ${b[k]} (${b[k] - a[k] >= 0 ? '+' : ''}${typeof a[k] === 'number' ? +(b[k] - a[k]).toFixed(1) : '?'})`
console.log('--- titre début → titre fin ---')
for (const k of ['heapMB', 'geo', 'texInfo', 'progInfo', 'tex', 'buf', 'prog', 'fbo', 'vao', 'domNodes', 'listeners', 'dom', 'audio', 'timeouts', 'intervals']) console.log('  ' + d(T0, T1, k))
console.log('--- salon début → salon fin ---')
for (const k of ['heapMB', 'geo', 'texInfo', 'progInfo', 'tex', 'buf', 'prog', 'fbo', 'vao', 'domNodes', 'listeners', 'dom', 'audio', 'timeouts', 'intervals']) console.log('  ' + d(L0, L2, k))
console.log('--- salon (retour) → salon fin ---')
for (const k of ['heapMB', 'geo', 'texInfo', 'tex', 'buf', 'domNodes', 'listeners']) console.log('  ' + d(L1, L2, k))
if (ends.length > 1) {
  console.log('--- salon fin cycle 1 → salon fin dernier cycle ---')
  for (const k of ['heapMB', 'geo', 'texInfo', 'progInfo', 'tex', 'buf', 'prog', 'fbo', 'vao', 'domNodes', 'listeners', 'timeouts', 'intervals']) console.log('  ' + d(ends[0], ends.at(-1), k))
}
console.log('--- console ---\n' + (logs.length ? logs.slice(0, 30).join('\n') : 'propre'))
console.log('JSON ' + JSON.stringify(rows))
await browser.close()
