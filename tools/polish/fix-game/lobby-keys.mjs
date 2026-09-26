// Vérification G7 (correcteur game) : clavier au salon.
// Retour arrière ne quitte pas le salon ; Échap retire d'abord le joueur au clavier ; avec un
// téléphone, un Échap arme la sortie (toast), le second dans les 2 s ramène au titre ; le
// téléphone passe alors en attente de l'écran (« La partie se lance depuis l'écran »).
//   PORT=8836 node tools/polish/fix-game/lobby-keys.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, sleep, waitFor, state, newPhone, joinPhone } from '../../e2e/qa/lib.mjs'

const SHOTS = join(import.meta.dirname, '../../../shots/polish/fix-game')
mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await pc.addInitScript(() => {
  try {
    localStorage.setItem('ombres.settings.v1', JSON.stringify({ lang: 'fr', quality: 'low', narrator: 'text' }))
  } catch {}
})
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await pc.evaluate(() => window.__ombres.runner.enterLobby())
await sleep(800)
const toasts = () => pc.evaluate(() => window.__ombres.useHud.getState().toasts.map(t => t.key).join(', '))
const S = async () => {
  const s = await state(pc)
  return `écran ${s.screen}, joueurs ${s.roster.filter(r => r.kind !== 'bot').map(r => r.kind).join('+') || '∅'}`
}
await pc.keyboard.press('Space')
await sleep(1000)
log('clavier rejoint :', await S())
await pc.keyboard.press('Backspace')
await sleep(600)
log('après Retour arrière :', await S())
const s0 = await state(pc)
const P = await newPhone(browser, 'Pixel 7', 'pixel')
const u = new URL(s0.joinUrl)
await joinPhone(P, `${ORIGIN}${u.pathname}${u.search}`, 'Brieuc', 3)
await sleep(1200)
await pc.keyboard.press('Escape')
await sleep(500)
log('après Échap (clavier + téléphone) :', await S(), '| toasts :', await toasts())
await pc.screenshot({ path: join(SHOTS, 'g7-esc1-keyboard-left.jpg'), type: 'jpeg', quality: 80 })
await sleep(2600)
await pc.keyboard.press('Escape')
await sleep(400)
log('après Échap (téléphone seul) :', await S(), '| toasts :', await toasts())
await pc.screenshot({ path: join(SHOTS, 'g7-esc2-armed.jpg'), type: 'jpeg', quality: 80 })
await sleep(500)
await pc.keyboard.press('Escape')
await sleep(1500)
log('après second Échap (< 2 s) :', await S())
await pc.screenshot({ path: join(SHOTS, 'g7-esc3-title.jpg'), type: 'jpeg', quality: 80 })
await P.page.screenshot({ path: join(SHOTS, 'g7-phone-after-title.jpg'), type: 'jpeg', quality: 80 })
const phoneText = await P.page.evaluate(() => document.querySelector('.band__wait')?.textContent ?? '(pas de texte d’attente)')
const startBtn = await P.page.locator('.band__start').count()
log('téléphone :', JSON.stringify(phoneText), '| bouton « Lancer » affiché :', startBtn > 0)
await browser.close()
