// Page mobile en ligne : un téléphone qui ouvre la racine est redirigé vers /m ; le bouton
// « Ouvrir le jeu ici quand même » lance le vrai jeu et le choix est retenu sur l'appareil.
//   node tools/launch/here-check.mjs [origine]
import { launch, newContext, collectLogs } from '../lib/browser.mjs'

const base = (process.argv[2] ?? 'https://ombres.deploy.breizhware.com').replace(/\/$/, '')
const browser = await launch()
const ctx = await newContext(browser, { mobile: 'iPhone 15 Pro' })
const page = await ctx.newPage()
const logs = collectLogs(page)
const ok = (name, cond, detail = '') => console.log(`${cond ? '  OK' : '  KO'} ${name}${detail ? ` — ${detail}` : ''}`)
await page.goto(base + '/', { waitUntil: 'load' })
ok('téléphone redirigé vers /m', new URL(page.url()).pathname === '/m', page.url())
await page.waitForTimeout(1500)
await page.screenshot({ path: 'shots/launch/m-top.jpg', type: 'jpeg', quality: 80 })
const here = page.locator('#btn-here')
await here.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await page.screenshot({ path: 'shots/launch/m-here.jpg', type: 'jpeg', quality: 80 })
ok('bouton visible', await here.isVisible(), await here.innerText())
await here.click()
await page.waitForLoadState('load')
ok('le jeu s’ouvre ici', new URL(page.url()).pathname === '/', page.url())
await page.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 60000 }).catch(() => {})
await page.waitForTimeout(6000)
await page.screenshot({ path: 'shots/launch/m-game.jpg', type: 'jpeg', quality: 80 })
ok('canvas du jeu présent', await page.locator('canvas').count() > 0)
// Nouvel onglet sur le même appareil : le choix est retenu
const page2 = await ctx.newPage()
await page2.goto(base + '/', { waitUntil: 'load' })
ok('choix retenu (pas de redirection)', new URL(page2.url()).pathname === '/', page2.url())
const errs = logs.filter(l => /\[(error|pageerror)\]/.test(l))
ok('console sans erreur', errs.length === 0, errs.slice(0, 3).join(' | '))
await browser.close()
