// Correcteur « climax » (polish vague 2) : captures de manche sur la page de mise en scène
// (vraie sim, vrais bots, vraie caméra, vraie UI) à 55, 85, 98,5, 101, 104 et 108 s, avec mesures :
// envergure médiane affichée, largeur cadrée, tangage, couverture des tours (estimation de la
// caméra au-dessus de 20 m, et tours entières), plus grosse tour à l'écran, oiseaux derrière une
// tour (géométrie exacte des TowerDef, fût compris) et partie de tour qui les cache.
//   PORT=8851 node --import ./tools/polish/staging/nohmr.mjs tools/polish/climax/shots.mjs \
//        --tag=before [--maps=parasols,aiguilles,geantes,cadran] [--ns=4,6,12] [--seed=7]
//        [--times=55,85,98.5,101,104,108] [--burst=98.5] [--w=1920 --h=1080] [--humans=0 (slots joués « au clavier »)]
// Sorties : shots/polish2/climax/<tag>/<carte>-n<N>-s<graine>/<t>.jpg, planches <tag>/sheet-*.jpg,
// mesures <tag>/metrics.json (+ résumé en console).
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext, collectLogs } from '../../lib/browser.mjs'

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const PORT = process.env.PORT ?? '8851'
const tag = opt.tag ?? 'run'
const maps = String(opt.maps ?? 'parasols,aiguilles,geantes,cadran').split(',')
const ns = String(opt.ns ?? '4,6,12').split(',').map(Number)
const seeds = String(opt.seed ?? '7').split(',').map(Number)
const times = String(opt.times ?? '55,85,98.5,101,104,108').split(',').map(Number)
const burstAt = opt.burst ? String(opt.burst).split(',').map(Number) : []
const humansOpt = String(opt.humans ?? '0').split(',').filter((x) => x !== '').map(Number)
const W = +(opt.w ?? 1920)
const H = +(opt.h ?? 1080)
const ROOT = new URL('../../../', import.meta.url).pathname
const out = join(ROOT, 'shots/polish2/climax', tag)
mkdirSync(out, { recursive: true })

/** Mesures dans la page (modules de l'app par leur URL réelle). */
async function installProbe(page) {
  await page.evaluate(async () => {
    const urlOf = (path) => {
      const e = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => new URL(n).pathname === path)
      return e.length ? e[e.length - 1] : path
    }
    const an = await import(urlOf('/src/host/render/bird/anchors.ts'))
    const fr = await import(urlOf('/src/host/camera/framingRig.ts'))
    const tc = await import(urlOf('/src/host/camera/towerCover.ts'))
    const fiber = await import(urlOf('/node_modules/.vite/deps/@react-three_fiber.js'))
    const THREE = await import(urlOf('/node_modules/.vite/deps/three.js'))
    const root = fiber._roots.get(document.querySelector('canvas'))
    let rt = null
    let buf = null
    /**
     * Rendu des seules tours (vrai matériau, trame comprise) dans une cible de la taille du tampon :
     * part de l'écran réellement peinte par des tours, et masque pour tester chaque oiseau.
     */
    const renderTowers = () => {
      const { gl, scene, camera } = root.store.getState()
      const w = gl.domElement.width
      const h = gl.domElement.height
      if (!rt || rt.width !== w || rt.height !== h) {
        rt?.dispose()
        rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true })
        buf = new Uint8Array(w * h * 4)
      }
      const towers = scene.getObjectByName('towers')
      if (!towers) return null
      const keep = new Set()
      towers.traverse((o) => keep.add(o))
      const hidden = []
      scene.traverse((o) => {
        if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && !keep.has(o) && o.visible) {
          o.visible = false
          hidden.push(o)
        }
      })
      const prevT = gl.getRenderTarget()
      const prevC = new THREE.Color()
      gl.getClearColor(prevC)
      const prevA = gl.getClearAlpha()
      gl.setRenderTarget(rt)
      gl.setClearColor(0x000000, 0)
      gl.clear(true, true, false)
      gl.render(scene, camera)
      gl.readRenderTargetPixels(rt, 0, 0, w, h, buf)
      gl.setRenderTarget(prevT)
      gl.setClearColor(prevC, prevA)
      for (const o of hidden) o.visible = true
      return { w, h, camera }
    }
    window.__climax = () => {
      const c = window.__cam
      const d = c.director()
      const sim = c.gameView.sim
      const view = c.gameView
      const pose = d.pose
      const cam = { x: pose.pos.x, y: -pose.pos.z, z: pose.pos.y }
      const rig = d.framing.rig
      const aspect = innerWidth / innerHeight
      const spans = []
      const birds = []
      for (const b of sim.birds) {
        const p = view.prevBirds[b.slot] ?? b
        const a = view.alpha
        const bx = p.x + (b.x - p.x) * a
        const by = p.y + (b.y - p.y) * a
        const bz = p.z + (b.z - p.z) * a
        const span = an.birdAnchors.spanPx[b.slot]
        spans.push(span)
        // tour entre la caméra et l'oiseau (échantillonnage du rayon, géométrie exacte)
        let occ = null
        const L = Math.hypot(bx - cam.x, by - cam.y, bz - cam.z)
        for (let k = 1; k < 120 && !occ; k++) {
          const u = k / 120
          const x = cam.x + (bx - cam.x) * u
          const y = cam.y + (by - cam.y) * u
          const z = cam.z + (bz - cam.z) * u
          if (L * (1 - u) < 3) break
          for (const t of sim.towers) {
            for (const g of t.segments) {
              if (z < g.z0 || z > g.z1) continue
              const k0 = g.z1 > g.z0 ? (z - g.z0) / (g.z1 - g.z0) : 0
              const r = g.r0 + (g.r1 - g.r0) * k0
              const ox = (g.ox0 ?? 0) + ((g.ox1 ?? 0) - (g.ox0 ?? 0)) * k0
              const oy = (g.oy0 ?? 0) + ((g.oy1 ?? 0) - (g.oy0 ?? 0)) * k0
              if (Math.hypot(x - t.x - ox, y - t.y - oy) < r) {
                occ = { tower: t.id, z: +z.toFixed(1), dCam: +(L * u).toFixed(1) }
                break
              }
            }
            if (occ) break
          }
        }
        birds.push({ s: b.slot, span: Math.round(span), z: +bz.toFixed(1), occ })
      }
      // couverture réellement peinte (tours seules, trame comprise) et oiseaux cachés à l'image
      const R = renderTowers()
      let painted = null
      if (R) {
        let n = 0
        for (let i = 3; i < buf.length; i += 4) if (buf[i] > 0) n++
        painted = n / (R.w * R.h)
        const v = new THREE.Vector3()
        for (const b of birds) {
          if (!b.occ) continue
          const bb = sim.bySlot[b.s]
          v.set(bb.x, bb.z, -bb.y).project(R.camera)
          const cx = ((v.x + 1) / 2) * R.w
          const cy = ((v.y + 1) / 2) * R.h
          const rad = Math.max(4, b.span * 0.22)
          let tot = 0
          let hit = 0
          for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
            for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
              if (x < 0 || y < 0 || x >= R.w || y >= R.h || (x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue
              tot++
              if (buf[(y * R.w + x) * 4 + 3] > 0) hit++
            }
          b.occ.painted = tot ? +(hit / tot).toFixed(2) : 0
        }
      }
      spans.sort((a, b) => a - b)
      const med = spans.length ? spans[Math.floor(spans.length / 2)] : 0
      const cover20 = fr.towerCoverage(sim, rig, aspect, 20)
      const coverAll = fr.towerCoverage(sim, rig, aspect, 0.5)
      const maxW = tc.towerCoverStats.maxWidth
      const f = c.state.frame
      const nearest = Math.min(...sim.towers.map((t) => Math.hypot(t.x - cam.x, t.y - cam.y)))
      return {
        t: +sim.sun.t.toFixed(2),
        phase: sim.sun.phase,
        span: Math.round(med),
        spanMin: Math.round(spans[0] ?? 0),
        width: Math.round(d.framing.width),
        frameW: Math.round(2 * f.halfWidth),
        pitch: +((rig.pitch * 180) / Math.PI).toFixed(1),
        camZ: Math.round(cam.z),
        cover: +c.state.towerCover.toFixed(3),
        cover20: +cover20.toFixed(3),
        coverAll: +coverAll.toFixed(3),
        painted: painted === null ? null : +painted.toFixed(3),
        maxTowerW: +maxW.toFixed(3),
        nearestTower: Math.round(nearest),
        punch: +c.state.punch.toFixed(2),
        night: sim.night.active ? +sim.night.s.toFixed(0) : null,
        occluded: birds.filter((b) => b.occ).map((b) => ({ s: b.s, ...b.occ })),
        birds,
      }
    }
  })
}

const FONT = process.env.SEQ_FONT ?? (() => { try { return execFileSync('sh', ['-c', "fc-list : file | grep -iE 'Mono.*Regular.*\\.ttf' | head -1"]).toString().trim().replace(/:\s*$/, '') } catch { return '' } })()
const results = []
const browser = await launch()
for (const map of maps)
  for (const n of ns)
    for (const seed of seeds) {
      const name = `${map}-n${n}-s${seed}`
      const dir = join(out, name)
      mkdirSync(dir, { recursive: true })
      const ctx = await newContext(browser, { w: W, h: H })
      const page = await ctx.newPage()
      const logs = collectLogs(page)
      const t0 = times[0] - 3
      await page.goto(`http://localhost:${PORT}/dev/camera.html?mode=round&t=${t0}&n=${n}&map=${map}&seed=${seed}&ui=1&shake=0&q=high`, { waitUntil: 'load' })
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 })
      await installProbe(page)
      // joueurs humains émulés (la page de dev ne met que des bots) : cadrage et HUD les traitent comme au jeu
      await page.evaluate((hs) => {
        for (const s of hs) {
          const p = window.__cam.gameView.players[s]
          if (p) p.kind = 'keyboard'
        }
      }, humansOpt)
      const rows = []
      let last = t0
      for (const t of times) {
        // longues attentes : saut (sans événements) jusqu'à 4 s avant, la caméra a le temps de se poser
        if (t - last > 8) await page.evaluate((j) => window.__cam.jump(j), t - 4)
        await page.waitForFunction((tt) => (window.__cam.gameView.sim?.sun.t ?? 0) >= tt, t, { timeout: 60000, polling: 16 })
        const m = await page.evaluate(() => window.__climax())
        const file = join(dir, `${t}.jpg`)
        await page.screenshot({ path: file, type: 'jpeg', quality: 84 })
        rows.push({ file, ...m })
        if (burstAt.includes(t)) {
          // rafale : 10 images consécutives du compositeur (screencast CDP), pour juger la stabilité de la trame
          const cdp = await ctx.newCDPSession(page)
          const frames = []
          await new Promise((resolve) => {
            cdp.on('Page.screencastFrame', async (f) => {
              frames.push(f.data)
              await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
              if (frames.length >= 10) resolve()
            })
            cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
          })
          await cdp.send('Page.stopScreencast').catch(() => {})
          await cdp.detach().catch(() => {})
          frames.forEach((d, k) => writeFileSync(join(dir, `${t}-b${k}.jpg`), Buffer.from(d, 'base64')))
        }
        last = t
      }
      const errs = logs.filter((l) => /error|pageerror/i.test(l) && !/DevTools|\[vite\]|status of 404/.test(l))
      results.push({ name, map, n, seed, rows, errs })
      for (const r of rows)
        console.log(
          `${name} t=${r.t} ${r.phase} env ${r.span}px (min ${r.spanMin}) larg ${r.width}m tang ${r.pitch}° camZ ${r.camZ} tours≥20 ${(100 * r.cover20).toFixed(1)}% entières ${(100 * r.coverAll).toFixed(1)}% peintes ${r.painted === null ? '?' : (100 * r.painted).toFixed(1)}% maxW ${(100 * r.maxTowerW).toFixed(0)}% proche ${r.nearestTower}m cachés ${r.occluded.map((o) => `${o.s}@z${o.z}/d${o.dCam}/vu${o.painted}`).join(',') || '-'}${r.punch > 0.02 ? ` punch ${r.punch}` : ''}`,
        )
      if (errs.length) console.log('  ERREURS', errs.slice(0, 5))
      // planche de la config
      const args = []
      for (const r of rows) args.push('-label', `${r.t}s env ${r.span}px larg ${r.width}m tours ${(100 * (r.painted ?? r.coverAll)).toFixed(0)}%`, r.file)
      try {
        execFileSync('montage', [...(FONT ? ['-font', FONT] : []), ...args, '-tile', '3x', '-geometry', '640x360+3+3', '-pointsize', '18', join(out, `sheet-${name}.jpg`)])
      } catch (e) {
        console.log('montage', e.message)
      }
      await ctx.close()
    }
await browser.close()
writeFileSync(join(out, 'metrics.json'), JSON.stringify(results, null, 1))
// résumé Grande Ombre
const gs = results.flatMap((r) => r.rows.filter((x) => x.phase === 'greatShadow').map((x) => ({ ...x, n: r.n, map: r.map })))
for (const n of ns) {
  const g = gs.filter((x) => x.n === n)
  if (!g.length) continue
  const sp = g.map((x) => x.span).sort((a, b) => a - b)
  const cov = g.map((x) => x.painted ?? x.coverAll)
  console.log(`n=${n} Grande Ombre : envergure médiane des images ${sp[Math.floor(sp.length / 2)]} px (min ${sp[0]}), couverture peinte des tours max ${(100 * Math.max(...cov)).toFixed(1)} %, images avec oiseau derrière une tour ${g.filter((x) => x.occluded.length).length}/${g.length}, dont caché à l'image (> 30 % de tour peinte sur l'oiseau) ${g.filter((x) => x.occluded.some((o) => o.painted > 0.3)).length}`)
}
