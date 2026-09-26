// Passe finale, correcteur phone : place des messages (toasts « hints.* ») sur le téléphone.
// Page de dev (vraie app + faux PC), toasts poussés par le store de l'app. Pour chaque format (paysage
// étroit 320 à 412 px de haut, portrait), chaque langue et chaque indication (paramètres les plus longs),
// mesure (getBoundingClientRect) le recouvrement du message avec le bandeau et ses pastilles, le socle du
// joystick, PLONGER, COUP D'AILE (anneau compris), l'appel « ! », le panneau du portrait, l'état de jeu et
// le tampon ; vérifie qu'il tient dans l'écran et que son texte n'est pas coupé. Cas à deux messages
// (une indication générale arrive pendant une indication personnelle) et message + tampon.
// Captures des cas extrêmes seulement : shots/polish3/final/phone-toasts/<tag>/.
//   PORT=8881 node --import ./tools/polish/staging/nohmr.mjs tools/polish/final/phone-toasts.mjs [--tag=after] [--shots=0|1|all]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { devices } from 'playwright-core'
import { launch } from '../../lib/browser.mjs'

const PORT = Number(process.env.PORT ?? 8881)
const ORIGIN = `http://localhost:${PORT}`
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const sleep = ms => new Promise(r => setTimeout(r, ms))
const TAG = arg('tag', 'after')
const SHOTS = arg('shots', '1')
const ONLY = arg('only', '')
const dir = join(import.meta.dirname, '../../../shots/polish3/final/phone-toasts', TAG)
mkdirSync(dir, { recursive: true })

const FORMATS = [
  { id: 'SE-568x320', dev: 'iPhone SE', land: true },
  { id: '667x340', dev: 'iPhone 8', viewport: { width: 667, height: 340 } },
  { id: 'mini-629x375', dev: 'iPhone 13 Mini', land: true },
  { id: 'mini-812x375', dev: 'iPhone 13 Mini', viewport: { width: 812, height: 375 } },
  { id: '15Pro-659x393', dev: 'iPhone 15 Pro', land: true },
  { id: '15Pro-852x393', dev: 'iPhone 15 Pro', viewport: { width: 852, height: 393 } },
  { id: 'Pixel7-839x412', dev: 'Pixel 7', land: true },
  { id: 'SE-portrait', dev: 'iPhone SE', land: false },
  { id: 'mini-portrait', dev: 'iPhone 13 Mini', land: false },
  { id: '15Pro-portrait', dev: 'iPhone 15 Pro', land: false },
  { id: 'Pixel7-portrait', dev: 'Pixel 7', land: false },
].filter(f => !ONLY || ONLY.split(',').some(o => f.id.includes(o)))

// Indications envoyées au téléphone (src/shared/strings/hints.ts) ; couleur au nom le plus long.
const LONG_COLOR = { fr: 8, en: 5 } // Sarcelle, Carmine
const KEYS = ['holdDive', 'releaseClimb', 'firstLock', 'dodge', 'paleOnStrong', 'towerShade', 'aimShadow', 'crown', 'golden', 'greatShadow']
// Deux messages à la fois : indication personnelle puis indication générale (golden/crown ne respectent pas l'écart).
const PAIRS = [
  ['aimShadow', 'golden'],
  ['towerShade', 'golden'],
  ['firstLock', 'crown'],
  ['dodge', 'crown'],
]

const area = (a, b) => {
  if (!a || !b) return 0
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  return Math.round(x * y)
}
const outside = (r, vw, vh) => (r ? Math.round(Math.max(0, -r.left, -r.top, r.right - vw, r.bottom - vh)) : 0)

async function measure(page) {
  return page.evaluate(() => {
    const box = (el, grow = 0) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return null
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null
      return { left: r.left - grow, top: r.top - grow, right: r.right + grow, bottom: r.bottom + grow }
    }
    const all = (sel, grow) =>
      [...document.querySelectorAll(sel)].map(el => box(el, grow)).filter(Boolean)
    const toasts = [...document.querySelectorAll('.toast')].map(el => {
      const r = box(el)
      const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.1
      // hauteur du texte seul (Range) → nombre de lignes
      const range = document.createRange()
      range.selectNodeContents(el)
      const tr = range.getBoundingClientRect()
      return {
        r,
        text: el.textContent,
        font: getComputedStyle(el).fontSize,
        lines: Math.round(tr.height / lh),
        clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
      }
    })
    const stick = document.querySelector('.stick')
    return {
      vw: innerWidth,
      vh: innerHeight,
      toasts,
      obstacles: {
        band: box(document.querySelector('.band')),
        bandChips: all('.band__id, .band__chip, .band__sunwrap, .band__status > *, .pause-btn, .band__cb-glyph, .band > svg'),
        stick: stick && !stick.classList.contains('is-hidden') ? box(stick) : null,
        flap: box(document.querySelector('.act--flap'), 15),
        dive: box(document.querySelector('.act--dive')),
        callout: box(document.querySelector('.act-callout')),
        bang: box(document.querySelector('.fx__bang')),
        pauseHint: box(document.querySelector('.pause-hint')),
        playInfo: box(document.querySelector('.play-info')),
        playState: all('.play-state > *'),
        stamp: box(document.querySelector('.fx__stamp')),
        goals: box(document.querySelector('.lobby-goals')),
        rules: box(document.querySelector('.lobby-rules')),
        tilt: box(document.querySelector('.tilt-pad')),
      },
    }
  })
}

function check(m) {
  const issues = []
  const o = m.obstacles
  m.toasts.forEach((t, i) => {
    const tag = `toast${i}`
    if (!t.r) return
    const out = outside(t.r, m.vw, m.vh)
    if (out) issues.push(`${tag}: hors écran ${out}px`)
    if (t.clipped) issues.push(`${tag}: texte coupé`)
    const pairs = { band: o.band, stick: o.stick, flap: o.flap, dive: o.dive, callout: o.callout, bang: o.bang, pauseHint: o.pauseHint, playInfo: o.playInfo, stamp: o.stamp, goals: o.goals, rules: o.rules, tilt: o.tilt }
    for (const [k, b] of Object.entries(pairs)) {
      const a = area(t.r, b)
      if (a) issues.push(`${tag}×${k}: ${a}px²`)
    }
    o.bandChips.forEach((b, j) => {
      const a = area(t.r, b)
      if (a) issues.push(`${tag}×bandChip${j}: ${a}px²`)
    })
    o.playState.forEach((b, j) => {
      const a = area(t.r, b)
      if (a) issues.push(`${tag}×playState${j}: ${a}px²`)
    })
    m.toasts.forEach((u, k) => {
      if (k > i && area(t.r, u.r)) issues.push(`${tag}×toast${k}: ${area(t.r, u.r)}px²`)
    })
  })
  if (!m.toasts.some(t => t.r)) issues.push('aucun message visible')
  return issues
}

const browser = await launch()
const report = []
let shotN = 0
for (const f of FORMATS) {
  const d = devices[f.dev]
  const { defaultBrowserType: _ignored, ...ctxOpts } = d
  ctxOpts.deviceScaleFactor = 2
  if (f.viewport) ctxOpts.viewport = f.viewport
  else if (f.land) ctxOpts.viewport = { width: d.viewport.height, height: d.viewport.width }
  const ctx = await browser.newContext(ctxOpts)
  for (const lang of ['fr', 'en']) {
    for (const scen of ['play', 'play-hunted', 'play-stunned', 'play&scheme=tilt']) {
      const page = await ctx.newPage()
      const errs = []
      page.on('pageerror', e => errs.push(e.message))
      // (la page de dev n'a pas de favicon : 404 sans rapport avec le jeu)
      page.on('console', m => m.type() === 'error' && !/favicon/.test(m.location().url) && errs.push(m.text()))
      await page.goto(`${ORIGIN}/dev/phone.html?s=${scen.includes('scheme') ? scen : `${scen}&scheme=absolute`}&lang=${lang}&color=3`, { waitUntil: 'load' })
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 })
      await page.evaluate(() => document.fonts.ready)
      await sleep(700)
      const sname = scen.replace('&scheme=', '-')
      const push = async key =>
        page.evaluate(
          async ({ key, params }) => {
            const m = await import('/src/phone/store.ts')
            m.pushToast(`hints.${key}`, params, 'hint')
          },
          { key, params: key === 'firstLock' ? { color: LONG_COLOR[lang] } : undefined },
        )
      const cue = async c =>
        page.evaluate(async c => {
          const m = await import('/src/phone/fx.ts')
          m.fx.cue(c)
        }, c)
      const clear = () =>
        page.evaluate(async () => {
          const m = await import('/src/phone/store.ts')
          m.usePhone.setState({ toasts: [] })
        })
      const snap = async label => {
        const file = join(dir, `${String(++shotN).padStart(3, '0')}-${f.id}-${lang}-${label}.jpg`)
        await page.screenshot({ path: file, type: 'jpeg', quality: 72 })
        return file
      }
      const record = (label, m, issues, shot) => {
        const row = { format: f.id, lang, case: `${sname}:${label}`, vw: m.vw, vh: m.vh, toasts: m.toasts.map(t => ({ ...t.r, lines: t.lines, font: t.font })), issues }
        if (shot) row.shot = shot
        report.push(row)
        return row
      }
      const cases = scen === 'play' ? [...KEYS.map(k => [k]), ...PAIRS] : [['golden'], ['towerShade', 'golden']]
      for (const c of cases) {
        await clear()
        await sleep(60)
        for (let i = 0; i < c.length; i++) {
          await push(c[i])
          await sleep(i < c.length - 1 ? 500 : 420)
        }
        const m = await measure(page)
        const issues = check(m)
        const extreme = scen !== 'play' || c.length > 1 ? c.join('+') === 'towerShade+golden' : c[0] === 'golden'
        const shot = SHOTS === 'all' || (SHOTS === '1' && extreme) ? await snap(`${sname}-${c.join('+')}`) : null
        record(c.join('+'), m, issues, shot)
      }
      if (scen !== 'play') {
        if (errs.length) report.push({ format: f.id, lang, case: `${sname}:console`, issues: errs })
        await page.close()
        continue
      }
      // message + tampon le plus large (DÉCROCHÉ ! / KNOCKED OUT!) : jamais l'un sur l'autre ; le message revient
      await clear()
      await push('golden')
      await sleep(300)
      await cue('stunned')
      await sleep(300)
      let m = await measure(page)
      let issues = check(m).filter(x => x !== 'aucun message visible')
      if (!m.obstacles.stamp) issues.push('tampon absent')
      record('golden+stamp(pendant)', m, issues, SHOTS !== '0' ? await snap('play-golden+stamp') : null)
      await sleep(800)
      m = await measure(page)
      record('golden+stamp(après)', m, check(m), null)
      // appel « COUP D'AILE ! » (clac) et « ! » de la prise d'élan
      for (const [c, wait] of [['clac', 200], ['windup', 160]]) {
        await sleep(900) // l'effet précédent (appel : 800 ms) est retombé
        await clear()
        await push('golden')
        await sleep(300)
        await cue(c)
        await sleep(wait)
        m = await measure(page)
        issues = check(m)
        if (c === 'clac' && !m.obstacles.callout) issues.push('appel absent')
        if (c === 'windup' && !m.obstacles.bang) issues.push('« ! » absent')
        record(`golden+${c}`, m, issues, SHOTS === 'all' ? await snap(`play-golden+${c}`) : null)
      }
      // « Maintiens pour la pause » (appui court sur la pause)
      await clear()
      await sleep(900)
      await push('golden')
      const pb = await page.locator('.pause-btn').boundingBox()
      await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2)
      await page.mouse.down()
      await sleep(80)
      await page.mouse.up()
      await sleep(350)
      m = await measure(page)
      issues = check(m)
      if (!m.obstacles.pauseHint) issues.push('« Maintiens pour la pause » absent')
      record('golden+pauseHint', m, issues, SHOTS === 'all' ? await snap('play-golden+pauseHint') : null)
      if (errs.length) report.push({ format: f.id, lang, case: `${scen}:console`, issues: errs })
      await page.close()
    }
  }
  await ctx.close()
}
await browser.close()

writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 1))
const bad = report.filter(r => r.issues.length)
for (const r of report) {
  const t = (r.toasts ?? []).filter(x => x.left !== undefined).map(x => `${Math.round(x.left)},${Math.round(x.top)}→${Math.round(x.right)},${Math.round(x.bottom)} ${x.lines}l`).join(' | ')
  if (r.issues.length || r.case === 'play:golden') console.log(`${r.issues.length ? '✗' : '✓'} ${r.format} ${r.lang} ${r.case}  [${t}]  ${r.issues.join('; ')}`)
}
console.log(`\n${report.length} cas, ${bad.length} avec recouvrement/défaut. Rapport : ${join(dir, 'report.json')}`)
