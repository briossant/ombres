// Polish vague 2 (tech, ordre 3) : coût réel (hors profileur) des constructions du décor à chaque carte,
// mesuré dans la page (mêmes modules que le jeu, servis par Vite) : tours, sol, cailloux, simulation.
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/buildcost.mjs
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, sleep, waitFor, presetSettings } from '../tech/common.mjs'

const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await presetSettings(pc, { lang: 'fr', quality: 'high', narrator: 'off' }, 'high')
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(2000)
const r = await pc.evaluate(async () => {
  const sim = await import('/src/sim/index.ts')
  const tg = await import('/src/host/render/world/towerGeometry.ts')
  const terrain = await import('/src/host/render/world/terrain.ts')
  const THREE = await import('/node_modules/.vite/deps/three.js')
  const out = {}
  const time = (k, fn, n = 3) => {
    const v = []
    for (let i = 0; i < n; i++) {
      const t = performance.now()
      fn()
      v.push(performance.now() - t)
    }
    v.sort((a, b) => a - b)
    out[k] = +v[Math.floor(v.length / 2)].toFixed(1)
  }
  for (const id of ['parasols', 'aiguilles', 'geantes', 'cadran']) {
    const map = sim.getMap(id, 6)
    time(`${id}.towers`, () => {
      const g = tg.buildTowerGeometries(map.towers)
      g.body.dispose()
      g.decor.dispose()
    })
    time(`${id}.createSimulation`, () => sim.createSimulation({ mode: 'demo', seed: 1, mapId: id, birds: [0, 1, 2, 3, 4, 5].map(slot => ({ slot, assist: false })), sunSeconds: 45, countdown: false }))
  }
  const map = sim.getMap('parasols', 6)
  const arena = map.arena
  time('ground.plane200', () => new THREE.PlaneGeometry(1800, 1800, 200, 200).rotateX(-Math.PI / 2).dispose())
  time('ground.dunes200', () => {
    const s = { h: 0, phase: 0, amp: 0 }
    for (let i = 0; i <= 200; i++) for (let j = 0; j <= 200; j++) terrain.duneAt(-900 + i * 9, -900 + j * 9, arena, s)
  })
  time('ground.normals200', () => {
    const g = new THREE.PlaneGeometry(1800, 1800, 200, 200)
    const t = performance.now()
    g.computeVertexNormals()
    out._n = (out._n ?? 0) + performance.now() - t
    g.dispose()
  })
  return out
})
console.log(JSON.stringify(r, null, 1))
await browser.close()
