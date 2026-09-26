// Test fonctionnel de la navigation clavier / souris de l'UI (page dev/ui.html).
//   node src/dev/ui/navtest.mjs
import { launch, newContext, collectLogs } from '../../../tools/lib/browser.mjs'

const BASE = process.env.UI_BASE ?? 'http://localhost:8805/dev/ui.html'
const browser = await launch()
let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` (${extra})` : ''}`)
  if (!ok) failures++
}

async function open(q) {
  const ctx = await newContext(browser, { w: 1280, h: 720 })
  const page = await ctx.newPage()
  const logs = collectLogs(page)
  await page.goto(`${BASE}?${q}`)
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 })
  await page.waitForTimeout(300)
  return { page, ctx, logs }
}
const focused = page => page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 40) ?? '')
const screen = page => page.evaluate(() => window.__ui.useUi.getState().screen)

// 1. Titre → menu → réglages → curseur → fermeture
{
  const { page, ctx, logs } = await open('screen=title&lang=fr')
  await page.keyboard.press('KeyA')
  await page.waitForTimeout(350)
  check('titre : une touche ouvre le menu', await page.evaluate(() => window.__ui.useUi.getState().titleMenuOpen))
  check('titre : focus initial sur Jouer', (await focused(page)).includes('Jouer'), await focused(page))
  await page.keyboard.press('ArrowDown')
  check('titre : ↓ va sur Réglages', (await focused(page)).includes('Réglages'), await focused(page))
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)
  check('réglages : Entrée ouvre la surcouche', await page.evaluate(() => window.__ui.useUi.getState().overlay === 'settings'))
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('ombres.settings.v1') ?? '{}').volMaster ?? 0.9)
  await page.keyboard.press('ArrowLeft')
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('ombres.settings.v1') ?? '{}').volMaster)
  check('réglages : ← baisse le volume général', after < before, `${before} → ${after}`)
  // langue : descendre jusqu'à la ligne Langue (colonne droite) puis → English
  await page.keyboard.press('ArrowRight')
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('[data-nav]')].find(e => e.textContent?.includes('Langue'))
    row?.focus()
  })
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(250)
  check('réglages : → sur Langue passe en anglais', await page.evaluate(() => document.querySelector('.settings__title')?.textContent?.trim() === 'Settings'))
  check('réglages : le focus reste dans les réglages après le changement de langue', await page.evaluate(() => !!document.activeElement?.closest('.settings')))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('réglages : Échap ferme', await page.evaluate(() => window.__ui.useUi.getState().overlay === null))
  check('titre : focus rendu au menu', (await focused(page)).length > 0, await focused(page))
  const errs = logs.filter(l => /pageerror|\[error\]/.test(l) && !/404/.test(l))
  check('titre : aucune erreur console', errs.length === 0, errs.join(' | '))
  await ctx.close()
}

// 2. Salon : Espace n'active pas de bouton, Entrée lance, bot : ←/→ niveau
{
  const { page, ctx } = await open('screen=lobby&n=5&lang=fr')
  check('salon : focus initial sur Lancer', (await focused(page)).includes('Lancer'), await focused(page))
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  check('salon : Espace ne lance pas la partie', (await screen(page)) === 'lobby')
  // n=5 → un joueur au clavier : les flèches ne déplacent pas le focus
  await page.keyboard.press('ArrowUp')
  check('salon : flèches ignorées quand un joueur joue au clavier', (await focused(page)).includes('Lancer'), await focused(page))
  // bot : clic sur le nom → personnalité suivante ; ←/→ niveau
  const botBefore = await page.evaluate(() => JSON.stringify(window.__ui.useRoster.getState().slots.find(s => s.kind === 'bot')?.bot))
  await page.locator('.slot__main--bot').first().click()
  await page.locator('.slot__main--bot').first().press('ArrowRight')
  const botAfter = await page.evaluate(() => JSON.stringify(window.__ui.useRoster.getState().slots.find(s => s.kind === 'bot')?.bot))
  check('salon : clic + → changent caractère et niveau du bot', botBefore !== botAfter, `${botBefore} → ${botAfter}`)
  const n0 = await page.evaluate(() => window.__ui.useRoster.getState().slots.length)
  await page.locator('.roster__add').click()
  const n1 = await page.evaluate(() => window.__ui.useRoster.getState().slots.length)
  check('salon : « Ajouter un bot » ajoute un slot', n1 === n0 + 1, `${n0} → ${n1}`)
  await page.locator('.slot__remove').last().click()
  const n2 = await page.evaluate(() => window.__ui.useRoster.getState().slots.length)
  check('salon : ✕ retire le bot', n2 === n1 - 1)
  await page.locator('.start .btn').focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check('salon : Entrée lance (cartes des règles)', (await screen(page)) === 'rules', await screen(page))
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check('règles : Entrée passe (manche)', (await screen(page)) === 'game', await screen(page))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  check('manche : Échap met en pause', await page.evaluate(() => window.__ui.useUi.getState().paused))
  check('pause : focus sur Reprendre', (await focused(page)).includes('Reprendre'), await focused(page))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  check('pause : Échap reprend', await page.evaluate(() => !window.__ui.useUi.getState().paused))
  await ctx.close()
}

// 3. Salon sans joueur au clavier : flèches actives
{
  const { page, ctx } = await open('screen=lobby&n=2&lang=en')
  await page.keyboard.press('ArrowUp')
  const f = await focused(page)
  check('lobby : ↑ quitte Start quand personne ne joue au clavier', !f.includes('Start'), f)
  await ctx.close()
}

// 4. HUD : événements de simulation → compte à rebours, bannière, 5 dernières secondes
{
  const { page, ctx } = await open('screen=hud&phase=noon&n=4&lang=fr')
  await page.evaluate(() => window.__ui.simEvents.emit({ type: 'countdown', n: 3 }))
  await page.waitForTimeout(100)
  check('HUD : événement countdown affiche 3', (await page.locator('.countdown').textContent())?.trim() === '3')
  await page.evaluate(() => {
    const simEvents = window.__ui.simEvents
    simEvents.emit({ type: 'phase', phase: 'golden' })
    simEvents.emit({ type: 'lastSeconds', n: 4 })
    simEvents.emit({ type: 'bigSteal', slot: 1, frac: 0.041, victim: 2 })
  })
  await page.waitForTimeout(150)
  check('HUD : bannière de phase', ((await page.locator('.banner__title').textContent()) ?? '').includes('Heure'))
  check('HUD : « 4 » des dernières secondes', (await page.locator('.last-seconds').textContent())?.trim() === '4')
  check('HUD : flash du gros voleur', (await page.locator('.sandbar__flash').count()) === 1)
  check('HUD : « +4,1 % » s\'envole', ((await page.locator('.gain').textContent()) ?? '').includes('4,1'))
  await ctx.close()
}

// 5. Manette (Gamepad API simulée) : croix bas puis A dans le menu du titre
{
  const ctx = await newContext(browser, { w: 1280, h: 720 })
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    // Manette factice : l'état des boutons est piloté par window.__pad.
    const mk = () => ({ index: 0, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: !!window.__pad?.[i], value: 0 })) })
    Object.defineProperty(navigator, 'getGamepads', { value: () => [mk()] })
  })
  await page.goto(`${BASE}?screen=title-menu&lang=fr`)
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 })
  await page.waitForTimeout(300)
  const press = async i => {
    await page.evaluate(i => (window.__pad = { [i]: true }), i)
    await page.waitForTimeout(80)
    await page.evaluate(() => (window.__pad = {}))
    await page.waitForTimeout(80)
  }
  await press(13) // croix bas
  check('manette : croix bas → Réglages', (await focused(page)).includes('Réglages'), await focused(page))
  await press(0) // A
  await page.waitForTimeout(250)
  check('manette : A ouvre les réglages', await page.evaluate(() => window.__ui.useUi.getState().overlay === 'settings'))
  await press(1) // B
  await page.waitForTimeout(250)
  check('manette : B ferme les réglages', await page.evaluate(() => window.__ui.useUi.getState().overlay === null))
  await ctx.close()
}

await browser.close()
console.log(failures ? `${failures} échec(s)` : 'tout est vert')
process.exit(failures ? 1 : 0)
