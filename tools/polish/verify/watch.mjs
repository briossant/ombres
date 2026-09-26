// Préchargement de non-régression : coupe le HMR de Vite (comme staging/nohmr.mjs) et journalise
// TOUTE la console (avertissements compris) de toutes les pages de tous les contextes dans
// $CONSOLE_LOG (JSONL : {t, type, url, text}). Usage :
//   CONSOLE_LOG=out.jsonl node --import ./tools/polish/verify/watch.mjs <script>
import pw from 'playwright-core'
import { appendFileSync } from 'node:fs'

const OUT = process.env.CONSOLE_LOG
const log = (o) => { if (OUT) appendFileSync(OUT, JSON.stringify({ t: Date.now(), ...o }) + '\n') }
const isHmr = (u) => {
  try {
    const url = typeof u === 'string' ? new URL(u) : u
    return url.searchParams.has('token') && !url.pathname.startsWith('/ws')
  } catch {
    return false
  }
}
const watchPage = (page) => {
  page.on('console', m => {
    const type = m.type()
    if (type === 'error' || type === 'warning' || type === 'assert') log({ type, url: page.url(), text: m.text() })
  })
  page.on('pageerror', e => log({ type: 'pageerror', url: page.url(), text: String(e?.stack ?? e) }))
  page.on('crash', () => log({ type: 'crash', url: page.url(), text: 'page crashed' }))
  page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) log({ type: 'http', url: page.url(), text: `${r.status()} ${r.url()}` }) })
}
const launch = pw.chromium.launch.bind(pw.chromium)
pw.chromium.launch = async (...args) => {
  const browser = await launch(...args)
  const newContext = browser.newContext.bind(browser)
  browser.newContext = async (...opts) => {
    const ctx = await newContext(...opts)
    if (!process.env.KEEP_HMR) await ctx.routeWebSocket(isHmr, () => {})
    ctx.on('page', watchPage)
    return ctx
  }
  const newPage = browser.newPage.bind(browser)
  browser.newPage = async (...opts) => {
    const p = await newPage(...opts)
    if (!process.env.KEEP_HMR) await p.context().routeWebSocket(isHmr, () => {})
    watchPage(p)
    return p
  }
  return browser
}
