// QA technique : formats d'écran — 720p, 4:3, ultra-large 21:9, 4K (dpr 1) et 1080p à dpr 2 ; titre,
// salon, manche, résultats, podium ; dimension du canvas, échelle de l'UI, débordements, éléments du
// HUD hors cadre. Redimensionnement à chaud en pleine manche.
//   PORT=8824 node tools/polish/tech/aspects.mjs [--only=1280x720,...]
import { launch } from '../../lib/browser.mjs'
import { ORIGIN, SHOTS, sleep, waitFor, presetSettings, lobbyWith, startMatch, collect } from './common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const FORMATS = [
  { name: '1280x720', w: 1280, h: 720, dpr: 1 },
  { name: '1024x768', w: 1024, h: 768, dpr: 1 },
  { name: '2560x1080', w: 2560, h: 1080, dpr: 1 },
  { name: '3840x2160', w: 3840, h: 2160, dpr: 1 },
  { name: '1920x1080@2', w: 1920, h: 1080, dpr: 2 },
  { name: '1366x768', w: 1366, h: 768, dpr: 1 },
].filter(f => !arg('only') || arg('only').split(',').includes(f.name))
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)

const inspect = page =>
  page.evaluate(() => {
    const c = document.querySelector('canvas')
    const out = []
    const W = innerWidth
    const H = innerHeight
    for (const el of document.querySelectorAll('.ui-root *')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue
      // éléments de texte ou panneaux coupés par le bord
      if ((r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) && (el.children.length === 0 || /case|panel|hud|bar|dial/.test(el.className))) {
        if (!el.closest('.world')) out.push(`${el.className || el.tagName}@${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`)
      }
    }
    return {
      canvas: `${c?.width}x${c?.height}`,
      css: `${W}x${H}`,
      dpr: devicePixelRatio,
      scale: getComputedStyle(document.querySelector('.ui-root') ?? document.body).getPropertyValue('--ui-scale') || document.querySelector('.ui-root')?.style.cssText.slice(0, 80),
      hscroll: document.documentElement.scrollWidth > W || document.documentElement.scrollHeight > H,
      offscreen: [...new Set(out)].slice(0, 8),
    }
  })

const browser = await launch()
for (const f of FORMATS) {
  const ctx = await browser.newContext({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: f.dpr })
  const pc = await ctx.newPage()
  const logs = collect(pc, f.name)
  await presetSettings(pc, { lang: 'fr', quality: 'high', narrator: 'text' })
  await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=5`, { waitUntil: 'load' })
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
  await sleep(3500)
  const shot = async label => {
    await pc.screenshot({ path: `${SHOTS}/aspect-${f.name}-${label}.jpg`, type: 'jpeg', quality: 72 })
    log(f.name, label.padEnd(12), JSON.stringify(await inspect(pc)))
  }
  await shot('title')
  await lobbyWith(pc, 6, { rounds: 1 })
  await sleep(1500)
  await shot('lobby')
  await startMatch(pc)
  await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? 0) > 50, null, 120000, 'mi-manche')
  await shot('round')
  await waitFor(pc, () => window.__ombres.runner.sim?.state.sun.phase === 'greatShadow', null, 120000, 'grande ombre')
  await sleep(600)
  await shot('greatshadow')
  await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'matchResults', null, 120000, 'podium')
  await sleep(2500)
  await shot('podium')
  if (logs.length) console.log(logs.slice(0, 6).join('\n'))
  await ctx.close()
}

// redimensionnement à chaud en pleine manche (fenêtre qu'on étire, plein écran simulé)
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const pc = await ctx.newPage()
  const logs = collect(pc, 'resize')
  await presetSettings(pc, { lang: 'fr', quality: 'high', narrator: 'text' })
  await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=2`, { waitUntil: 'load' })
  await lobbyWith(pc, 6, { rounds: 1 })
  await startMatch(pc)
  await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? 0) > 20, null, 120000, 'manche')
  for (const [w, h] of [[1280, 720], [900, 1000], [2560, 1080], [800, 450], [1920, 1080]]) {
    await pc.setViewportSize({ width: w, height: h })
    await sleep(900)
    await pc.screenshot({ path: `${SHOTS}/resize-${w}x${h}.jpg`, type: 'jpeg', quality: 72 })
    log('resize', `${w}x${h}`, JSON.stringify(await inspect(pc)))
  }
  if (logs.length) console.log(logs.slice(0, 6).join('\n'))
  await ctx.close()
}
await browser.close()
