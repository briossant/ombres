// Lisibilité des 12 couleurs dans le vrai rendu, à chaque heure : la grille de territoire est
// remplacée (manche en pause, surcouche de pause masquée) par 12 bandes verticales, une par
// joueur, chacune FORT en haut, PÂLE au milieu, NEUTRE en bas. Capture à midi, heure dorée,
// couchant, Grande Ombre. Aucun code du jeu modifié (écriture dans la sim sous ?debug).
//   PORT=8823 node tools/polish/firsttime/swatches.mjs
import { ORIGIN, launch, pcContext, makeShots, sleep, waitFor, state } from './ft.mjs'

const { shot, log } = makeShots('swatches')
const browser = await launch()
const pc = await (await pcContext(browser, 'fr-FR')).newPage()
await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=2`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await pc.keyboard.press('Enter')
await sleep(400)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 15000, 'salon')
await pc.evaluate(() => window.__ombres.runner.setMatchSetting('rounds', 1))
await pc.keyboard.press('Space')
await sleep(800)
await pc.evaluate(() => {
  const r = window.__ombres.runner
  for (let i = 0; i < 11; i++) r.addBot(null, 1)
})
await sleep(800)
log(`oiseaux : ${(await state(pc)).roster.length}`)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.runner.phase === 'round', null, 15000, 'manche')
await pc.addStyleTag({ content: '.pause, .overlay, .scrim, [class*="pause"] { opacity: 0 !important; }' })
const paint = () =>
  pc.evaluate(() => { window.__paintSw = () => {
    const r = window.__ombres.runner
    const st = r.sim.state
    const g = st.grid
    const slots = st.birds.map(b => b.slot).sort((a, b) => a - b)
    const colorOf = s => window.__ombres.useRoster.getState().slots.find(x => x.slot === s)?.colorIndex
    const n = slots.length
    for (let y = 0; y < g.rows; y++) {
      const band = y > g.rows * 0.62 ? 2 : y > g.rows * 0.36 ? 1 : 0 // ligne 0 = sud : 2 (nord) = fort
      for (let x = 0; x < g.cols; x++) {
        const i = y * g.cols + x
        const s = slots[Math.min(n - 1, Math.floor((x / g.cols) * n))]
        g.prevOwner[i] = g.owner[i]
        g.owner[i] = band === 0 ? 0 : s + 1
        g.level[i] = band
        g.changedAt[i] = st.time - 5
      }
    }
    g.version++
    g.dirty = { x0: 0, y0: 0, x1: g.cols - 1, y1: g.rows - 1 }
    return slots.map(s => colorOf(s))
  }; return window.__paintSw() })
for (const [label, f] of [['midi', 0.06], ['apres-midi', 0.36], ['heure-doree', 0.64], ['couchant', 0.8], ['grande-ombre', 0.9]]) {
  await waitFor(pc, f => { const s = window.__ombres?.runner.sim?.state.sun; return (s && s.t >= f * s.T) || window.__ombres?.runner.phase !== 'round' }, f, 120000, label)
  if ((await state(pc)).phase !== 'round') break
  // repeint en continu (la texture ne s'envoie que si le temps de sim avance : pas de pause)
  const colors = await paint()
  await pc.evaluate(() => { window.__swp = setInterval(() => window.__paintSw(), 25) })
  await sleep(500)
  log(`${label} : couleurs de gauche à droite ${JSON.stringify(colors)} ; t=${(await state(pc)).sunT}`)
  await shot(pc, `swatch-${label}`)
  await pc.evaluate(() => clearInterval(window.__swp))
}
await browser.close()
