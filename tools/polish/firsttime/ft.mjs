// Aides du critique « premier joueur » (polish) : contextes localisés, captures, textes visibles.
//   PORT=8823 ; captures dans shots/polish/firsttime/<scénario>/.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { devices } from 'playwright-core'
import { launch } from '../../lib/browser.mjs'
import { collectLogs, problems, sleep, waitFor, state, center } from '../../e2e/qa/lib.mjs'

export const PORT = Number(process.env.PORT ?? 8823)
export const ORIGIN = `http://localhost:${PORT}`
export { launch, collectLogs, problems, sleep, waitFor, state, center }

export function makeShots(name) {
  const dir = join(import.meta.dirname, '../../../shots/polish/firsttime', name)
  mkdirSync(dir, { recursive: true })
  const logFile = join(dir, '_log.txt')
  writeFileSync(logFile, '')
  let n = 0
  const t0 = Date.now()
  const stamp = () => ((Date.now() - t0) / 1000).toFixed(1)
  const log = m => {
    const l = `[${stamp()} s] ${m}`
    console.log(l)
    appendFileSync(logFile, l + '\n')
  }
  const shot = async (page, label, opts = {}) => {
    const f = join(dir, `${String(++n).padStart(3, '0')}-${label}.jpg`)
    try {
      await page.screenshot({ path: f, type: 'jpeg', quality: 82, ...opts })
      log(`shot ${f.split('/').slice(-2).join('/')}`)
    } catch (e) {
      log(`shot FAILED ${label}: ${e.message}`)
    }
    return f
  }
  return { dir, shot, log, stamp }
}

export async function pcContext(browser, locale = 'fr-FR', w = 1920, h = 1080) {
  return browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale })
}

export async function phoneContext(browser, device, locale = 'fr-FR', landscape = true) {
  const { defaultBrowserType: _i, ...d } = devices[device]
  const ctx = { ...d, locale }
  if (landscape) ctx.viewport = { width: d.viewport.height, height: d.viewport.width }
  return browser.newContext(ctx)
}

export async function newPhoneFT(browser, device, tag, locale = 'fr-FR', landscape = true) {
  const ctx = await phoneContext(browser, device, locale, landscape)
  const page = await ctx.newPage()
  const logs = collectLogs(page, tag)
  const cdp = await ctx.newCDPSession(page)
  return { ctx, page, logs, cdp, device, tag }
}

/** Texte visible de la page (lignes non vides, dédoublonnées). */
export async function visibleText(page) {
  return page.evaluate(() => document.body.innerText.split('\n').map(s => s.trim()).filter(Boolean).join(' | '))
}

/** Éléments qui débordent de la fenêtre (ou de leur parent) : sélecteurs donnés. */
export async function overflowCheck(page, sels) {
  return page.evaluate(sels => {
    const vw = innerWidth
    const vh = innerHeight
    const out = []
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect()
        if (!r.width) continue
        out.push({ sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom), outX: r.x < 0 || r.right > vw, outY: r.y < 0 || r.bottom > vh, vw, vh })
      }
    }
    return out
  }, sels)
}

/** Recouvrement de deux rectangles (fraction de la plus petite aire). */
export function overlap(a, b) {
  if (!a || !b) return 0
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return (x * y) / Math.min(a.width * a.height, b.width * b.height)
}

/** Sonde textes (récitatif, bannières, bulles, toasts) et images. */
export { installProbe, drainLog, frameStats } from '../../e2e/qa/probe.mjs'
