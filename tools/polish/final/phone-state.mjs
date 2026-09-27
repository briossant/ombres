// Passe finale, correcteur phone : place de l'état de jeu (« Décroché ! », « Caché », « Dans la nuit »,
// « Intouchable ») sur la manette. Page de dev (vraie app + faux PC), statut posé dans le store de l'app.
// Pour chaque format (les 11 de phone-toasts.mjs), chaque langue et chaque état (seul ou combiné), sans puis
// avec message (indication la plus longue et indication du contexte), avec tampon, « ! », appel et
// « Maintiens pour la pause » : vérifie que l'état est VU (elementFromPoint : rien ne le recouvre), qu'il tient
// dans l'écran sans texte coupé, et mesure (getBoundingClientRect) son recouvrement avec le bandeau et ses
// pastilles, le socle du joystick, PLONGER, COUP D'AILE (anneau compris), le panneau du portrait, les messages,
// le tampon, le « ! », l'appel, l'indication de pause et le niveau à bulle.
// Captures des cas extrêmes seulement : shots/polish3/final/phone-state/<tag>/.
//   PORT=8883 node --import ./tools/polish/staging/nohmr.mjs tools/polish/final/phone-state.mjs [--tag=after] [--shots=0|1|all] [--only=SE,Pixel]
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
const dir = join(import.meta.dirname, '../../../shots/polish3/final/phone-state', TAG)
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

// États (PhoneStatus) : hidden et night s'excluent (simulation.ts) ; stun masque hidden et immune.
const STATES = {
  stun: { stun: 1.2 },
  hidden: { hidden: true },
  night: { night: true },
  immune: { immune: true },
  'stun+night': { stun: 1.2, night: true },
  'hidden+immune': { hidden: true, immune: true },
  'night+immune': { night: true, immune: true },
}
// Indication propre au contexte de chaque état (en plus de « golden », la plus longue).
const CONTEXT_HINT = { stun: 'dodge', hidden: 'towerShade', night: 'greatShadow', immune: 'crown' }
const LONG_COLOR = { fr: 8, en: 5 }
// Cas extrêmes capturés (--shots=1) : les formats les plus serrés, message long + tampon.
const SHOT_FORMATS = ['SE-568x320', '667x340', '15Pro-659x393', 'SE-portrait', 'Pixel7-portrait']

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
    const all = (sel, grow) => [...document.querySelectorAll(sel)].map(el => box(el, grow)).filter(Boolean)
    // L'état est-il vu ? Cinq points (centre et coins rentrés de 6 px) : l'élément peint au-dessus doit être
    // l'état. elementFromPoint ignore pointer-events: none (l'état, les messages, les tampons) : tout redevient
    // touchable le temps de la mesure, sauf les calques plein écran transparents et les conteneurs.
    const probe = document.createElement('style')
    probe.textContent =
      '*{pointer-events:auto!important}.fx,.fx__border,.fx__alert,.fx__white,.toasts,.play-top,.play-state{pointer-events:none!important}'
    document.head.appendChild(probe)
    const states = [...document.querySelectorAll('.play-state > *')].map(el => {
      const r = box(el)
      let seen = 0
      if (r) {
        const pts = [
          [(r.left + r.right) / 2, (r.top + r.bottom) / 2],
          [r.left + 6, r.top + 6],
          [r.right - 6, r.top + 6],
          [r.left + 6, r.bottom - 6],
          [r.right - 6, r.bottom - 6],
        ]
        for (const [x, y] of pts) {
          const hit = document.elementFromPoint(x, y)
          if (hit && (hit === el || el.contains(hit))) seen++
        }
      }
      return {
        r,
        text: el.textContent,
        font: getComputedStyle(el).fontSize,
        seen,
        clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
      }
    })
    probe.remove()
    const stick = document.querySelector('.stick')
    return {
      vw: innerWidth,
      vh: innerHeight,
      states,
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
        stamp: box(document.querySelector('.fx__stamp')),
        tilt: box(document.querySelector('.tilt-pad')),
        toasts: all('.toast'),
      },
    }
  })
}

function check(m, { expectState = true } = {}) {
  const issues = []
  const o = m.obstacles
  const shown = m.states.filter(s => s.r)
  if (expectState && !shown.length) issues.push('état absent')
  shown.forEach((s, i) => {
    const tag = `état${i}`
    const out = outside(s.r, m.vw, m.vh)
    if (out) issues.push(`${tag}: hors écran ${out}px`)
    if (s.clipped) issues.push(`${tag}: texte coupé`)
    // L'indication de pause (réponse à un geste) prend la place : l'état peut s'effacer pendant 1,6 s.
    if (s.seen < 5) issues.push(`${tag}: recouvert (${5 - s.seen}/5 points)`)
    const pairs = { band: o.band, stick: o.stick, flap: o.flap, dive: o.dive, callout: o.callout, bang: o.bang, pauseHint: o.pauseHint, playInfo: o.playInfo, stamp: o.stamp, tilt: o.tilt }
    for (const [k, b] of Object.entries(pairs)) {
      const a = area(s.r, b)
      if (a) issues.push(`${tag}×${k}: ${a}px²`)
    }
    o.bandChips.forEach((b, j) => {
      const a = area(s.r, b)
      if (a) issues.push(`${tag}×bandChip${j}: ${a}px²`)
    })
    o.toasts.forEach((b, j) => {
      const a = area(s.r, b)
      if (a) issues.push(`${tag}×toast${j}: ${a}px²`)
    })
    shown.forEach((u, k) => {
      if (k > i && area(s.r, u.r)) issues.push(`${tag}×état${k}: ${area(s.r, u.r)}px²`)
    })
  })
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
    for (const scheme of ['absolute', 'tilt']) {
      const page = await ctx.newPage()
      const errs = []
      page.on('pageerror', e => errs.push(e.message))
      page.on('console', m => m.type() === 'error' && !/favicon/.test(m.location().url) && errs.push(m.text()))
      await page.goto(`${ORIGIN}/dev/phone.html?s=play&scheme=${scheme}&lang=${lang}&color=3`, { waitUntil: 'load' })
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 })
      await page.evaluate(() => document.fonts.ready)
      await sleep(600)
      const setState = patch =>
        page.evaluate(async patch => {
          const m = await import('/src/phone/store.ts')
          const s = m.usePhone.getState()
          m.usePhone.setState({ status: { ...s.status, stun: 0, hidden: false, night: false, immune: false, ...patch }, statusAt: performance.now() })
        }, patch)
      const push = key =>
        page.evaluate(
          async ({ key, params }) => {
            const m = await import('/src/phone/store.ts')
            m.pushToast(`hints.${key}`, params, 'hint')
          },
          { key, params: key === 'firstLock' ? { color: LONG_COLOR[lang] } : undefined },
        )
      const cue = c =>
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
        const row = {
          format: f.id,
          lang,
          scheme,
          case: label,
          vw: m.vw,
          vh: m.vh,
          states: m.states.map(s => (s.r ? { ...s.r, text: s.text, font: s.font, seen: s.seen } : { text: s.text, shown: false })),
          issues,
        }
        if (shot) row.shot = shot
        report.push(row)
      }
      const wantShot = label =>
        SHOTS === 'all' || (SHOTS === '1' && scheme === 'absolute' && SHOT_FORMATS.includes(f.id) && /^(stun\+night|stun|night\+immune|hidden)( \+ (golden|stamp\+golden))?$/.test(label) && (label.includes('golden') || label === 'hidden'))

      // Sans état : aucun reste à l'écran.
      await setState({})
      await sleep(120)
      {
        const m = await measure(page)
        const issues = m.states.some(s => s.r) ? ['état affiché sans état'] : []
        record('aucun', m, issues, null)
      }
      const names = scheme === 'tilt' ? ['stun', 'night+immune'] : Object.keys(STATES)
      for (const name of names) {
        await clear()
        await setState(STATES[name])
        await sleep(260)
        let m = await measure(page)
        record(name, m, check(m), wantShot(name) ? await snap(name) : null)
        const hints = scheme === 'tilt' ? ['golden'] : ['golden', CONTEXT_HINT[name.split('+')[0]]]
        for (const h of hints) {
          await clear()
          await sleep(60)
          await push(h)
          await sleep(420)
          m = await measure(page)
          const issues = check(m)
          if (!m.obstacles.toasts.length) issues.push('message absent')
          const label = `${name} + ${h}`
          record(label, m, issues, wantShot(label) ? await snap(label.replace(/ \+ /g, '+')) : null)
        }
        if (name.startsWith('stun')) {
          // Tampon « DÉCROCHÉ ! » pendant l'état, avec et sans message ; le message revient après le tampon.
          for (const withToast of [false, true]) {
            await clear()
            await sleep(1000)
            if (withToast) {
              await push('golden')
              await sleep(250)
            }
            await cue('stunned')
            await sleep(300)
            m = await measure(page)
            const issues = check(m)
            if (!m.obstacles.stamp) issues.push('tampon absent')
            const label = `${name} + stamp${withToast ? '+golden' : ''}`
            record(label, m, issues, wantShot(label) ? await snap(label.replace(/ \+ /g, '+')) : null)
          }
          await sleep(700) // fin du tampon (0,95 s) avant l'état suivant
        }
      }
      if (scheme === 'absolute') {
        // « ! » et appel (impossibles en jeu pendant ces états, vérifiés quand même) : jamais sur l'état.
        await setState(STATES.immune)
        for (const [c, wait] of [
          ['windup', 160],
          ['clac', 200],
        ]) {
          await clear()
          await sleep(900)
          await cue(c)
          await sleep(wait)
          const m = await measure(page)
          record(`immune + ${c}`, m, check(m), SHOTS === 'all' ? await snap(`immune+${c}`) : null)
        }
        // « Maintiens pour la pause » (appui court) : réponse à un geste, prioritaire ; l'état revient ensuite.
        await setState(STATES.night)
        await clear()
        await sleep(900)
        const pb = await page.locator('.pause-btn').boundingBox()
        await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2)
        await page.mouse.down()
        await sleep(80)
        await page.mouse.up()
        await sleep(300)
        let m = await measure(page)
        let issues = check(m, { expectState: false })
        if (!m.obstacles.pauseHint) issues.push('« Maintiens pour la pause » absent')
        record('night + pauseHint', m, issues, SHOTS === 'all' || (SHOTS === '1' && SHOT_FORMATS.includes(f.id)) ? await snap('night+pauseHint') : null)
        await sleep(1700)
        m = await measure(page)
        record('night (après pauseHint)', m, check(m), null)
      }
      if (errs.length) report.push({ format: f.id, lang, scheme, case: 'console', issues: errs })
      await page.close()
    }
  }
  await ctx.close()
}
await browser.close()

writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 1))
const bad = report.filter(r => r.issues.length)
for (const r of report) {
  const s = (r.states ?? []).filter(x => x.left !== undefined).map(x => `${x.text} ${Math.round(x.left)},${Math.round(x.top)}→${Math.round(x.right)},${Math.round(x.bottom)}`).join(' | ')
  if (r.issues.length || r.case === 'stun') console.log(`${r.issues.length ? '✗' : '✓'} ${r.format} ${r.lang} ${r.scheme ?? ''} ${r.case}  [${s}]  ${r.issues.join('; ')}`)
}
console.log(`\n${report.length} cas, ${bad.length} avec recouvrement/défaut. Rapport : ${join(dir, 'report.json')}`)
