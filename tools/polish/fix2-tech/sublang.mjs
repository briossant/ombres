// Polish vague 2 (tech, ordre 4) : réplique du narrateur commencée avant un changement de langue.
//   Voix (FR) : le sous-titre finit dans la langue de la voix, NOM DE COULEUR COMPRIS (avant : phrase
//   française + nom de couleur anglais, « Crimson ouvre les hostilités. ») ; la réplique suivante est en EN.
//   Texte seul : le sous-titre bascule entier dans la nouvelle langue (retraduit).
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/sublang.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, sleep, waitFor, presetSettings, collect } from '../tech/common.mjs'

const SHOTS = join(import.meta.dirname, '../../../shots/polish2/tech')
mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const ok = (cond, what) => {
  log(cond ? 'OK  ' : 'ÉCHEC', what)
  if (!cond) process.exitCode = 1
}
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await presetSettings(pc, { lang: 'fr', quality: 'low', narrator: 'voice' }, 'low')
await pc.goto(`${ORIGIN}/?debug=nosave,fast&speed=1`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await pc.keyboard.press('Enter') // geste : déverrouille l'audio
await pc.evaluate(() => window.__ombres.runner.enterLobby())
await sleep(400)
await pc.keyboard.press('Space')
await sleep(300)
await pc.evaluate(() => {
  const r = window.__ombres.runner
  r.setMatchSetting('rounds', 3)
  let guard = 12
  while (r.roster.size < 4 && guard--) if (!r.addBot(null, 1)) break
  r.startMatch()
})
await waitFor(pc, () => ['rules', 'round'].includes(window.__ombres.runner.phase), null, 10000, 'lancement')
if ((await pc.evaluate(() => window.__ombres.runner.phase)) === 'rules') await pc.evaluate(() => window.__ombres.runner.finishRules())
await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? 0) > 6, null, 60000, 'manche t>6')
// la manche ne doit pas bouger pendant les essais (le narrateur de la manche se tait en pause)
await pc.evaluate(() => window.__ombres.runner.pause(-1))
await sleep(400)

const sub = () =>
  pc.evaluate(() => {
    const p = document.querySelector('.subtitle-wrap .recitatif')
    return p ? { text: p.innerText.replace(/\s+/g, ' ').trim(), lang: p.getAttribute('lang'), docLang: document.documentElement.lang } : null
  })
const play = (lineId, colorIndex) =>
  pc.evaluate(([lineId, colorIndex]) => {
    const pb = window.__ombresAudio.system.narrator.play({ lineId, colorIndex })
    return { voiced: pb.voiced, duration: +pb.duration.toFixed(2) }
  }, [lineId, colorIndex])
const setLang = lang => pc.evaluate(lang => window.__ombres.useSettings.getState().set('lang', lang), lang)
const setNarrator = m => pc.evaluate(m => window.__ombres.useSettings.getState().set('narrator', m), m)
const waitGone = () => waitFor(pc, () => !document.querySelector('.subtitle-wrap .recitatif'), null, 15000, 'fin du sous-titre')
// Safran / Saffron (index 3) : noms FR et EN différents, le mélange se verrait
const COLOR = 3

// ─── 1. voix : la réplique commencée en FR finit en FR, nom de couleur compris ───
const pb1 = await play('firstHit', COLOR)
await sleep(350)
const v0 = await sub()
await setLang('en')
await sleep(250)
const v1 = await sub()
await pc.screenshot({ path: `${SHOTS}/sublang-1-voice-after-switch.jpg`, type: 'jpeg', quality: 85 })
log('voix', JSON.stringify(pb1), 'avant', JSON.stringify(v0), '| après bascule', JSON.stringify(v1))
ok(pb1.voiced, 'réplique voisée')
ok(!!v1 && v1.text === v0?.text && /^Safran ouvre/.test(v1.text) && v1.lang === 'fr', `voix : le sous-titre finit en FR, nom de couleur compris (« ${v1?.text} »)`)
await waitGone()
const pb2 = await play('firstHit', COLOR)
await sleep(350)
const v2 = await sub()
await pc.screenshot({ path: `${SHOTS}/sublang-2-voice-next-en.jpg`, type: 'jpeg', quality: 85 })
log('réplique suivante', JSON.stringify(pb2), JSON.stringify(v2))
ok(!!v2 && /opens the hunt/.test(v2.text) && v2.lang === 'en', `voix : la réplique suivante est en EN (« ${v2?.text} »)`)
await waitGone()

// ─── 2. texte seul : le sous-titre bascule entier dans la nouvelle langue ───
await setNarrator('text')
await setLang('fr')
await sleep(200)
const pb3 = await play('hitVictim', COLOR)
await sleep(300)
const t0 = await sub()
await setLang('en')
await sleep(250)
const t1 = await sub()
await pc.screenshot({ path: `${SHOTS}/sublang-3-text-after-switch.jpg`, type: 'jpeg', quality: 85 })
log('texte', JSON.stringify(pb3), 'avant', JSON.stringify(t0), '| après bascule', JSON.stringify(t1))
ok(!pb3.voiced && /en voit de toutes les couleurs/.test(t0?.text ?? ''), 'texte seul : réplique affichée en FR')
ok(!!t1 && /gets a taste of sand/.test(t1.text) && !/couleurs/.test(t1.text), `texte seul : bascule entière en EN (« ${t1?.text} »)`)
ok(/^Safran /.test(t0?.text ?? '') && /^Saffron /.test(t1?.text ?? ''), `texte seul : nom de couleur retraduit avec la phrase (${(t0?.text ?? '').split(' ')[0]} → ${(t1?.text ?? '').split(' ')[0]})`)
log('console :', logs.length ? logs.slice(0, 10).join('\n') : 'propre')
await browser.close()
