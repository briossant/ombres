// Correcteur phone (polish vague 1) : galerie mesurée des écrans du téléphone (page de dev = vraie app
// + faux PC), sur les formats de la revue : iPhone 15 Pro, Pixel 7, iPhone SE (568 × 320), 667 × 340,
// et iPhone 15 Pro en portrait. Mesures (getBoundingClientRect) :
//   - salon : recouvrements carte des règles / boutons / socle (au repos et en pilotage), objectifs / COUP D'AILE,
//     « Pouce ici » dans l'écran ;
//   - PIQUER : boîte de l'étoile dans l'écran, sans croiser COUP D'AILE ; « TOUCHÉ ! » hors des boutons ;
//   - tous les écrans : boutons et textes dans l'écran, textes coupés.
//   PORT=8835 node tools/polish/phone/gallery.mjs [--tag=after] [--lang=fr|en|both] [--only=lobby,intro]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { devices } from 'playwright-core'
import { launch } from '../../lib/browser.mjs'

const PORT = Number(process.env.PORT ?? 8835)
const ORIGIN = `http://localhost:${PORT}`
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const sleep = ms => new Promise(r => setTimeout(r, ms))
const TAG = arg('tag', 'after')
const LANGS = arg('lang', 'fr') === 'both' ? ['fr', 'en'] : [arg('lang', 'fr')]
const ONLY = arg('only', '')
  .split(',')
  .filter(Boolean)
const COLOR = Number(arg('color', '3'))
const dir = join(import.meta.dirname, '../../../shots/polish/fix-phone', TAG)
mkdirSync(dir, { recursive: true })

const FORMATS = [
  { id: 'iPhone15Pro', dev: 'iPhone 15 Pro', land: true },
  { id: 'Pixel7', dev: 'Pixel 7', land: true },
  { id: 'SE-568x320', dev: 'iPhone SE', land: true },
  { id: '667x340', dev: 'iPhone 8', viewport: { width: 667, height: 340 } },
  { id: 'iPhone15Pro-portrait', dev: 'iPhone 15 Pro', land: false },
]
const SCEN = ['lobby', 'lobby-guest', 'intro', 'play', 'play-target', 'play-hit', 'roundEnd', 'roundEnd-winner', 'matchEnd', 'matchEnd-winner', 'paused', 'reconnect', 'spectate', 'settings', 'profile']
const PORTRAIT = new Set(['lobby', 'lobby-guest', 'intro', 'play', 'play-target', 'roundEnd', 'matchEnd', 'matchEnd-winner', 'profile'])

const area = (a, b) => {
  if (!a || !b) return 0
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  return Math.round(x * y)
}
const out = (r, vw, vh) => (r ? Math.max(0, -r.left, -r.top, r.right - vw, r.bottom - vh) : 0)

async function rects(page) {
  return page.evaluate(() => {
    const q = sel => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      if (!r.width) return null
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height, opacity: Number(getComputedStyle(el).opacity) }
    }
    return {
      vw: innerWidth,
      vh: innerHeight,
      rules: q('.lobby-rules'),
      goals: q('.lobby-goals'),
      wait: q('.lobby-wait .recitatif') ?? q('.lobby-wait'),
      dive: q('.act--dive'),
      flap: q('.act--flap'),
      ring: q('.act--flap .act__ring'),
      star: q('.act__star'),
      stick: q('.stick'),
      hint: q('.stick-hint'),
      stamp: q('.fx__stamp'),
      toast: q('.toast'),
      // Tampon : distance mini au bord de l'anneau de COUP D'AILE (px, > 0 = libre).
      stampGap: (() => {
        const f = document.querySelector('.act--flap')?.getBoundingClientRect()
        const r = document.querySelector('.fx__stamp')?.getBoundingClientRect()
        if (!f || !r) return null
        const cx = f.left + f.width / 2
        const cy = f.top + f.height / 2
        const dx = Math.max(r.left - cx, 0, cx - r.right)
        const dy = Math.max(r.top - cy, 0, cy - r.bottom)
        return Math.round(Math.hypot(dx, dy) - (f.width / 2 + 15))
      })(),
      // Rayons de l'étoile : distance mini de chaque rayon au bord de l'anneau de COUP D'AILE (px, > 0 = libre).
      rayGap: (() => {
        const f = document.querySelector('.act--flap')?.getBoundingClientRect()
        const rays = [...document.querySelectorAll('.act__star path')]
        if (!f || !rays.length) return null
        const cx = f.left + f.width / 2
        const cy = f.top + f.height / 2
        const rr = f.width / 2 + 15
        return Math.round(
          Math.min(
            ...rays.map(p => {
              const r = p.getBoundingClientRect()
              const dx = Math.max(r.left - cx, 0, cx - r.right)
              const dy = Math.max(r.top - cy, 0, cy - r.bottom)
              return Math.hypot(dx, dy) - rr
            }),
          ),
        )
      })(),
    }
  })
}

/** Éléments visibles (boutons, textes) hors de l'écran, et textes coupés. */
async function offscreen(page) {
  return page.evaluate(() => {
    const vw = innerWidth
    const vh = innerHeight
    const bad = []
    const sels = 'button, .btn, .act, .recitatif, h1, h2, p, .t-title, .goal__label, .act__label, .rule-card__text, .toast, dd, dt, .podium li, .big-rank'
    for (const el of document.querySelectorAll(sels)) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
      // dans une zone qui défile : juger la zone, pas l'élément
      const scroller = el.closest('.scrollable, .intro__cards')
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) continue
      const o = Math.max(-r.left, -r.top, r.right - vw, r.bottom - vh)
      if (o > 0.5) bad.push({ el: (el.className || el.tagName).toString().slice(0, 40), text: (el.innerText || '').slice(0, 30), out: Math.round(o) })
    }
    const cut = [...document.querySelectorAll('button, .btn, .recitatif, h1, p, .t-title, .goal__label, .act__label')]
      .filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible')
      .map(e => e.innerText.slice(0, 40))
    return { bad, cut }
  })
}

const touch = (id, x, y) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })

const browser = await launch()
const report = []
for (const lang of LANGS) {
  for (const f of FORMATS) {
    const { defaultBrowserType: _i, ...d } = devices[f.dev]
    const viewport = f.viewport ?? (f.land ? { width: d.viewport.height, height: d.viewport.width } : d.viewport)
    const ctx = await browser.newContext({ ...d, viewport, locale: lang === 'fr' ? 'fr-FR' : 'en-US' })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && errors.push(m.text()))
    const cdp = await ctx.newCDPSession(page)
    for (const s of SCEN) {
      if (ONLY.length && !ONLY.includes(s)) continue
      if (f.id.endsWith('portrait') && !PORTRAIT.has(s)) continue
      await page.goto(`${ORIGIN}/dev/phone.html?s=${s}&lang=${lang}&color=${COLOR}`, { waitUntil: 'load' })
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 })
      const tag = `${lang}-${f.id}-${s}`
      let r
      if (s === 'play-hit') {
        // le tampon ne vit que 0,95 s : mesure dès qu'il est posé, capture ensuite
        await page.waitForSelector('.fx__stamp', { timeout: 5000 })
        await sleep(120)
        r = await rects(page)
        await page.screenshot({ path: join(dir, `${tag}.jpg`), type: 'jpeg', quality: 82 })
      } else {
        await sleep(900)
        await page.screenshot({ path: join(dir, `${tag}.jpg`), type: 'jpeg', quality: 82 })
        r = await rects(page)
      }
      const o = await offscreen(page)
      const row = { tag, vw: r.vw, vh: r.vh, offscreen: o.bad, cut: o.cut }
      if (s.startsWith('lobby')) {
        row.rest = {
          rules_dive: area(r.rules, r.dive),
          rules_flap: area(r.rules, r.flap),
          rules_ring: area(r.rules, r.ring),
          rules_stick: area(r.rules, r.stick),
          rules_goals: area(r.rules, r.goals),
          goals_ring: area(r.goals, r.ring),
          goals_stick: area(r.goals, r.stick),
          wait_stick: area(r.wait, r.stick),
          wait_dive: area(r.wait, r.dive),
          rules_out: out(r.rules, r.vw, r.vh),
          hint_out: out(r.hint, r.vw, r.vh),
          hint_stick: area(r.hint, r.dive),
          rulesBox: r.rules && [Math.round(r.rules.left), Math.round(r.rules.top), Math.round(r.rules.right), Math.round(r.rules.bottom)],
        }
        // Pilotage : pouce posé dans la zone du joystick, qui glisse vers la carte (le socle suit).
        if (r.stick) {
          const x0 = r.vw * 0.3
          const y0 = r.stick.top + r.stick.h / 2
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, x0, y0)] })
          for (let i = 1; i <= 6; i++) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, x0 + i * 25, y0 - i * 6)] })
            await sleep(16)
          }
          await sleep(260)
          const p = await rects(page)
          await page.screenshot({ path: join(dir, `${tag}-thumb.jpg`), type: 'jpeg', quality: 82 })
          row.thumb = { rules_stick: area(p.rules, p.stick), rulesOpacity: p.rules?.opacity ?? null, visibleOverlap: p.rules && p.rules.opacity > 0.05 ? area(p.rules, p.stick) : 0 }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
          await sleep(300)
          const back = await rects(page)
          row.thumb.rulesOpacityAfter = back.rules?.opacity ?? null
        }
      }
      if (s === 'play-target' || s === 'play-hit') {
        row.star = {
          box: r.star && [Math.round(r.star.left), Math.round(r.star.top), Math.round(r.star.right), Math.round(r.star.bottom)],
          out: out(r.star, r.vw, r.vh),
          star_flap: area(r.star, r.flap),
          star_ring: area(r.star, r.ring),
          dive_flap: area(r.dive, r.flap),
          rayGap: r.rayGap,
        }
        if (s === 'play-hit') row.stamp = { gapToFlapRing: r.stampGap, stamp_dive: area(r.stamp, r.dive), out: out(r.stamp, r.vw, r.vh), box: r.stamp && [Math.round(r.stamp.left), Math.round(r.stamp.top), Math.round(r.stamp.right), Math.round(r.stamp.bottom)] }
      }
      if (s === 'intro' && r) {
        row.ok = await page.evaluate(() => {
          const b = document.querySelector('.intro__foot .btn')?.getBoundingClientRect()
          return b ? { bottom: Math.round(b.bottom), vh: innerHeight } : null
        })
      }
      report.push(row)
      const flags = [
        row.offscreen.length ? `HORS ÉCRAN ${JSON.stringify(row.offscreen)}` : '',
        row.cut.length ? `COUPÉ ${JSON.stringify(row.cut)}` : '',
        row.rest ? `salon ${JSON.stringify(row.rest)} pilotage ${JSON.stringify(row.thumb)}` : '',
        row.star ? `étoile ${JSON.stringify(row.star)}` : '',
        row.stamp ? `tampon ${JSON.stringify(row.stamp)}` : '',
        row.ok ? `Compris ${JSON.stringify(row.ok)}` : '',
      ].filter(Boolean)
      console.log(`${tag} ${r.vw}×${r.vh} ${flags.join(' | ') || 'ok'}`)
    }
    if (errors.length) console.log(`${f.id} ERREURS ${JSON.stringify(errors.slice(0, 5))}`)
    await ctx.close()
  }
}
await browser.close()
writeFileSync(join(dir, '_report.json'), JSON.stringify(report, null, 1))
console.log(`→ ${dir}`)
