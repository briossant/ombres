// Polish vague 2 (tech, ordre 2) : onglet PC dupliqué (sessionStorage copié, comme « Dupliquer l'onglet »).
//   L'onglet B reprend la salle et la partie ; l'onglet A doit afficher « Ombres est ouvert dans un autre
//   onglet » (pas le faux « on réessaie sans cesse ») avec « Reprendre ici », manche figée dessous.
//   « Reprendre ici » (clavier : Entrée) : A reprend la salle, le téléphone revient sur A, la manche de A
//   repart en « 3, 2, 1 » ; B passe à son tour en « ouvert dans un autre onglet ».
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/duptab.mjs [--lang=fr|en]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext } from '../../lib/browser.mjs'
import { joinPhone, newPhone } from '../../e2e/qa/lib.mjs'
import { ORIGIN, sleep, waitFor, presetSettings, collect } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const LANG = arg('lang', 'fr')
const SHOTS = join(import.meta.dirname, '../../../shots/polish2/tech')
mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const ok = (cond, what) => {
  log(cond ? 'OK  ' : 'ÉCHEC', what)
  if (!cond) process.exitCode = 1
}
const URL_ = `${ORIGIN}/?debug=fast&speed=2`

const browser = await launch()
const ctx = await newContext(browser)
const a = await ctx.newPage()
const logsA = collect(a, 'A')
const t0 = Date.now()
const where = page => page.on('console', m => m.type() === 'error' && console.log(`  [console ${((Date.now() - t0) / 1000).toFixed(1)} s] ${m.text().slice(0, 120)} @ ${JSON.stringify(m.location())}`))
where(a)
let stackShown = 0
a.on('pageerror', e => stackShown++ < 2 && console.log(`  [pageerror ${((Date.now() - t0) / 1000).toFixed(1)} s] ${e.stack?.split('\n').slice(0, 8).join(' | ')}`))
await presetSettings(a, { lang: LANG, quality: 'low', narrator: 'text' }, 'low')
await a.goto(URL_, { waitUntil: 'load' })
await waitFor(a, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await a.keyboard.press('Enter') // geste : son déverrouillé
await a.evaluate(() => window.__ombres.runner.enterLobby())
await waitFor(a, () => !!window.__ombres.useLobby.getState().joinUrl, null, 20000, 'salle')
const joinUrl = await a.evaluate(() => window.__ombres.useLobby.getState().joinUrl.replace(/^https?:\/\/[^/]+/, location.origin))
const ph = await newPhone(browser, 'Pixel 7', 'phone')
await joinPhone(ph, joinUrl, 'Brieuc', 4)
await a.evaluate(() => {
  const r = window.__ombres.runner
  r.setMatchSetting('rounds', 1)
  let guard = 12
  while (r.roster.size < 4 && guard--) if (!r.addBot(null, 1)) break
  r.startMatch()
})
await waitFor(a, () => ['rules', 'round'].includes(window.__ombres.runner.phase), null, 10000, 'lancement')
if ((await a.evaluate(() => window.__ombres.runner.phase)) === 'rules') await a.evaluate(() => window.__ombres.runner.finishRules())
await waitFor(a, () => (window.__ombres.runner.sim?.state.sun.t ?? 0) > 15, null, 120000, 'manche t>15')

const st = page =>
  page.evaluate(() => {
    const o = window.__ombres
    const phone = o.useRoster.getState().slots.find(s => s.kind === 'phone')
    return {
      t: +(o.runner.sim?.state.sun.t ?? -1).toFixed(2),
      phase: o.runner.phase,
      session: o.runner.session.status,
      hostLink: o.useUi.getState().hostLink,
      phoneConnected: phone?.connected ?? null,
      overlay: document.querySelector('.reconnect')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
      focus: document.activeElement?.textContent?.trim() ?? null,
      countdown: o.useHud.getState().countdown,
      // gain d'entrée du master : 0 = onglet remplacé réduit au silence
      gain: +(window.__ombresAudio?.system.engine.masterIn.gain.value ?? -1).toFixed(2),
    }
  })
const phoneState = () =>
  ph.page.evaluate(() => ({
    play: !!document.querySelector('.act--dive'),
    overlay: document.querySelector('.overlay')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 120) ?? null,
  }))

// ─── duplication ───
const ss = await a.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))))
const b = await ctx.newPage()
const logsB = collect(b, 'B')
await b.addInitScript(s => {
  if (!sessionStorage.length) for (const [k, v] of Object.entries(JSON.parse(s))) sessionStorage.setItem(k, v)
}, ss)
await b.goto(URL_, { waitUntil: 'load' })
await waitFor(a, () => window.__ombres.useUi.getState().hostLink === 'replaced', null, 60000, 'A remplacé')
await waitFor(b, () => window.__ombres?.runner.phase === 'round', null, 120000, 'B en manche')
await sleep(5000)
const a1 = await st(a)
await sleep(1500)
const a1b = await st(a)
const b1 = await st(b)
const p1 = await phoneState()
await a.screenshot({ path: `${SHOTS}/dup-${LANG}-1-tabA-replaced.jpg`, type: 'jpeg', quality: 80 })
await b.screenshot({ path: `${SHOTS}/dup-${LANG}-1-tabB-playing.jpg`, type: 'jpeg', quality: 80 })
log('étape : duplication faite')
log('A', JSON.stringify(a1), '| B', JSON.stringify(b1), '| téléphone', JSON.stringify(p1))
ok(a1.session === 'replaced' && a1.hostLink === 'replaced', 'A : statut « replaced », surcouche dédiée')
ok(/autre onglet|another tab/i.test(a1.overlay ?? '') && !/réessaie|retrying/i.test(a1.overlay ?? ''), 'A : texte « ouvert dans un autre onglet », plus de faux « on réessaie »')
ok(/reprendre ici|continue here/i.test(a1.focus ?? ''), `A : « Reprendre ici » a le focus (${a1.focus})`)
ok(Math.abs(a1b.t - a1.t) < 0.05, `A : manche figée dessous (${a1.t} → ${a1b.t})`)
ok(a1.gain === 0 && b1.gain === 1, `son : A se tait (gain ${a1.gain}), B joue (gain ${b1.gain})`)
ok(b1.session === 'online' && b1.phoneConnected === true, 'B : en ligne, téléphone connecté')

// ─── « Reprendre ici » sur A (Entrée) ───
await a.bringToFront()
log('étape : Entrée sur « Reprendre ici »')
await a.keyboard.press('Enter')
await waitFor(a, () => window.__ombres.runner.session.status === 'online', null, 20000, 'A en ligne')
await waitFor(b, () => window.__ombres.useUi.getState().hostLink === 'replaced', null, 20000, 'B remplacé')
await sleep(800)
const a2 = await st(a)
await a.screenshot({ path: `${SHOTS}/dup-${LANG}-2-tabA-takeover-count.jpg`, type: 'jpeg', quality: 80 })
await b.screenshot({ path: `${SHOTS}/dup-${LANG}-2-tabB-replaced.jpg`, type: 'jpeg', quality: 80 })
await sleep(4500)
const a3 = await st(a)
const b3 = await st(b)
const p3 = await phoneState()
await a.screenshot({ path: `${SHOTS}/dup-${LANG}-3-tabA-playing.jpg`, type: 'jpeg', quality: 80 })
await ph.page.screenshot({ path: `${SHOTS}/dup-${LANG}-3-phone.jpg`, type: 'jpeg', quality: 80 })
log('après reprise : A', JSON.stringify(a2), '→', JSON.stringify(a3), '| B', JSON.stringify(b3), '| téléphone', JSON.stringify(p3))
ok(a2.hostLink === 'ok' && a2.overlay === null, 'A : surcouche retirée')
ok(a2.countdown !== null && a2.countdown > 0, `A : reprise en « 3, 2, 1 » (${a2.countdown})`)
ok(a3.t > a2.t + 0.5 && a3.phoneConnected === true, `A : la manche repart (${a2.t} → ${a3.t}), téléphone reconnecté`)
ok(b3.hostLink === 'replaced', 'B : à son tour « ouvert dans un autre onglet »')
ok(a3.gain === 1 && b3.gain === 0, `son : A rejoue (gain ${a3.gain}), B se tait (gain ${b3.gain})`)
ok(p3.play && !p3.overlay, 'téléphone : manette active, sans surcouche')
await b.close()
await sleep(3000)
const a4 = await st(a)
log('B fermé : A', JSON.stringify(a4))
ok(a4.session === 'online' && a4.hostLink === 'ok', 'A : reste en ligne après la fermeture de B')
const probs = [...logsA, ...logsB].filter(l => !/ERR_ABORTED|net::ERR/.test(l))
log('console A + B :', probs.length ? '\n' + probs.slice(0, 20).join('\n') : 'propre')
log('console téléphone :', ph.logs.filter(l => /error|warning/.test(l)).slice(0, 10).join('\n') || 'propre')
await browser.close()
