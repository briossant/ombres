// QA technique : session longue — 3 parties de 3 manches enchaînées par des revanches (12 oiseaux :
// 1 clavier + 11 bots), puis salon, titre, bascules de qualité et de langue. À chaque point de contrôle :
// objets WebGL vivants (textures, buffers, programmes, FBO…), tas JS après GC, nœuds DOM, écouteurs,
// minuteries vivantes, draw calls, éléments <audio>.
//   PORT=8824 node tools/polish/tech/longsession.mjs [--speed=6] [--birds=12]
import { launch, newContext } from '../../lib/browser.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings, lobbyWith, startMatch, kbSlot, collect, glCounts, heap } from './common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const SPEED = Number(arg('speed', '6'))
const BIRDS = Number(arg('birds', '12'))
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const browser = await launch({ extraArgs: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] })
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await pc.addInitScript(PROBE)
await pc.addInitScript(() => {
  const A = window.Audio
  window.__audioCount = 0
  window.Audio = function (...a) {
    window.__audioCount++
    return new A(...a)
  }
  window.Audio.prototype = A.prototype
  // nœuds WebAudio créés (approximation des fuites de graphe)
  window.__nodes = 0
  const AC = window.AudioContext
  for (const m of ['createGain', 'createBufferSource', 'createBiquadFilter', 'createOscillator', 'createStereoPanner', 'createMediaElementSource', 'createDelay', 'createConvolver', 'createWaveShaper', 'createDynamicsCompressor']) {
    const f = AC.prototype[m]
    if (f)
      AC.prototype[m] = function (...a) {
        window.__nodes++
        return f.apply(this, a)
      }
  }
})
await presetSettings(pc, { lang: 'fr', quality: 'medium', narrator: 'voice' })
const cdp = await ctx.newCDPSession(pc)
await cdp.send('HeapProfiler.enable')
await pc.goto(`${ORIGIN}/?debug=fast,nosave,perf&speed=${SPEED}`, { waitUntil: 'load' })

const rows = []
async function checkpoint(label) {
  await sleep(1500)
  const gl = await glCounts(pc)
  const h = await heap(pc, cdp)
  const x = await pc.evaluate(() => ({ calls: window.__nprInfo?.calls, tri: window.__nprInfo?.triangles, prog: window.__nprInfo?.programs, audios: window.__audioCount, nodes: window.__nodes, phase: window.__ombres.runner.phase, level: window.__ombres.useRenderQuality.getState().level, dom: document.getElementsByTagName('*').length }))
  const row = { label, ...x, heapMB: h.usedMB, domNodes: h.dom?.nodes, listeners: h.dom?.jsEventListeners, docs: h.dom?.documents, tex: gl.texture, buf: gl.buffer, prog: gl.program, fbo: gl.framebuffer, rbo: gl.renderbuffer, vao: gl.vertexArray, q: gl.query, timeouts: gl.timers.timeouts, intervals: gl.timers.intervals }
  rows.push(row)
  log(label.padEnd(18), JSON.stringify(row))
}

await lobbyWith(pc, BIRDS, { rounds: 3 })
await checkpoint('lobby')
await pc.mouse.click(5, 5)
const slot = await kbSlot(pc)
const pilot = new KeyboardPilot(pc, 1, () => slot, 17)
for (let m = 1; m <= 3; m++) {
  if (m === 1) await startMatch(pc)
  else {
    await pc.keyboard.press('Enter') // revanche
    await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 20000, 'revanche')
  }
  await pilot.start()
  for (let r = 1; r <= 3; r++) {
    await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres.runner.phase), null, 240000, `fin manche ${m}.${r}`)
    if (r < 3) {
      await sleep(1500)
      if (m === 1 && r === 1) await checkpoint(`m${m} r${r} résultats`)
      await pc.keyboard.press('Enter')
      await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 30000, 'manche suivante')
    }
  }
  await pilot.stop()
  await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'matchResults', null, 30000, 'podium')
  await checkpoint(`partie ${m} podium`)
}
// retour au salon, titre
await pc.keyboard.press('Escape')
await waitFor(pc, () => window.__ombres.runner.phase === 'lobby', null, 20000, 'salon')
await checkpoint('salon (retour)')
await pc.evaluate(() => window.__ombres.runner.enterTitle())
await sleep(3000)
await checkpoint('titre')
// bascules de qualité et de langue ×3
for (let i = 0; i < 3; i++) {
  for (const q of ['low', 'high', 'medium']) {
    await pc.evaluate(q => window.__ombres.useSettings.getState().set('quality', q), q)
    await sleep(700)
  }
  await pc.evaluate(() => window.__ombres.useSettings.getState().set('lang', 'en'))
  await sleep(500)
  await pc.evaluate(() => window.__ombres.useSettings.getState().set('lang', 'fr'))
  await sleep(500)
}
await checkpoint('après 9 bascules qualité')
console.log('--- console ---\n' + logs.slice(0, 30).join('\n'))
console.log('JSON ' + JSON.stringify(rows))
await browser.close()
