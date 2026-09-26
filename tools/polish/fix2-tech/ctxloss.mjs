// Polish vague 2 (tech, ordre 1) : perte du contexte WebGL en pleine manche (WEBGL_lose_context).
//   1. perte puis retour après 2 s : manche en pause pendant la perte (temps de soleil figé),
//      surcouche « L'image s'est interrompue », téléphone en pause sans « Reprendre » ; au retour,
//      surcouche retirée, « 3, 2, 1 », la manche repart ;
//   2. perte définitive : au bout de 3 s, bouton « Recharger » ; clic → la page se recharge et la
//      manche reprend au même instant (sauvegarde de session), en « 3, 2, 1 ».
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/ctxloss.mjs [--lang=fr|en]
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

const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await presetSettings(pc, { lang: LANG, quality: 'medium', narrator: 'text' }, 'medium')
await pc.goto(`${ORIGIN}/?debug=fast&speed=2`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await pc.evaluate(() => window.__ombres.runner.enterLobby())
await waitFor(pc, () => !!window.__ombres.useLobby.getState().joinUrl, null, 20000, 'salle')
const joinUrl = await pc.evaluate(() => window.__ombres.useLobby.getState().joinUrl.replace(/^https?:\/\/[^/]+/, location.origin))
const ph = await newPhone(browser, 'iPhone 15 Pro', 'phone')
await joinPhone(ph, joinUrl, 'Brieuc', 2)
await pc.evaluate(() => {
  const r = window.__ombres.runner
  r.setMatchSetting('rounds', 1)
  let guard = 12
  while (r.roster.size < 4 && guard--) if (!r.addBot(null, 1)) break
  r.startMatch()
})
await waitFor(pc, () => ['rules', 'round'].includes(window.__ombres.runner.phase), null, 10000, 'lancement')
if ((await pc.evaluate(() => window.__ombres.runner.phase)) === 'rules') await pc.evaluate(() => window.__ombres.runner.finishRules())
await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? 0) > 25, null, 120000, 'manche t>25')

const st = () =>
  pc.evaluate(() => {
    const o = window.__ombres
    return {
      t: +(o.runner.sim?.state.sun.t ?? -1).toFixed(2),
      phase: o.runner.phase,
      paused: o.runner.paused,
      display: o.useUi.getState().display,
      lost: o.gl?.getContext().isContextLost() ?? null,
      overlay: document.querySelector('.display-lost')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
      reload: !!document.querySelector('.display-lost .btn'),
      countdown: o.useHud.getState().countdown,
    }
  })
const phoneView = () =>
  ph.page.evaluate(() => ({
    pause: document.querySelector('.overlay--dim')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 160) ?? null,
    resumeBtn: [...document.querySelectorAll('button')].some(b => /reprendre|resume/i.test(b.innerText)),
  }))
const shotPc = async label => pc.screenshot({ path: `${SHOTS}/ctx-${LANG}-${label}.jpg`, type: 'jpeg', quality: 80 })
const shotPh = async label => ph.page.screenshot({ path: `${SHOTS}/ctx-${LANG}-${label}-phone.jpg`, type: 'jpeg', quality: 80 })

// ─── 1. perte puis retour ───
const s0 = await st()
log('avant', JSON.stringify(s0))
await shotPc('0-before')
await pc.evaluate(() => {
  window.__loseExt = window.__ombres.gl.getContext().getExtension('WEBGL_lose_context')
  window.__loseExt.loseContext()
})
await sleep(900)
const s1 = await st()
await shotPc('1-lost-wait')
await sleep(1100)
const s1b = await st()
const pv1 = await phoneView()
await shotPh('1-lost')
log('perdu', JSON.stringify(s1), '→ +1,1 s', JSON.stringify(s1b), 'téléphone', JSON.stringify(pv1))
ok(s1.display === 'lost' && s1.paused, 'perte : surcouche affichée et manche en pause')
ok(Math.abs(s1b.t - s1.t) < 0.05, `perte : temps du soleil figé (${s1.t} → ${s1b.t})`)
ok(!s1.reload, 'perte : pas encore de « Recharger » (on attend le retour de l’image)')
ok(!pv1.resumeBtn, 'téléphone : pause sans « Reprendre »')
await pc.evaluate(() => window.__loseExt.restoreContext())
await sleep(600)
const s2 = await st()
await shotPc('2-restored-count')
await sleep(3600)
const s3 = await st()
await shotPc('3-restored-play')
log('rendu', JSON.stringify(s2), '→ +3,6 s', JSON.stringify(s3))
ok(s2.display === 'ok' && !s2.paused && s2.lost === false, 'retour : surcouche retirée, pause levée, contexte vivant')
ok(s2.countdown !== null && s2.countdown > 0, `retour : compte « 3, 2, 1 » (${s2.countdown})`)
ok(s3.t > s2.t + 0.5, `retour : la manche repart (${s2.t} → ${s3.t})`)

// ─── 2. perte définitive → Recharger ───
await pc.evaluate(() => window.__ombres.gl.getContext().getExtension('WEBGL_lose_context').loseContext())
await sleep(3600)
const s4 = await st()
await shotPc('4-lost-stuck')
await shotPh('4-lost-stuck')
log('perte définitive', JSON.stringify(s4))
ok(s4.reload && s4.paused, 'perte définitive : « Recharger » proposé, manche en pause')
const tLost = s4.t
await Promise.all([pc.waitForEvent('load', { timeout: 60000 }), pc.locator('.display-lost .btn').click()])
await waitFor(pc, () => window.__ombres?.runner.phase === 'round' && window.__ombres.useUi.getState().screen === 'game', null, 120000, 'reprise après rechargement')
await sleep(700)
const s5 = await st()
await shotPc('5-reloaded-count')
await sleep(4000)
const s6 = await st()
await shotPc('6-reloaded-play')
await shotPh('6-reloaded')
const pv6 = await phoneView()
log('rechargé', JSON.stringify(s5), '→ +4 s', JSON.stringify(s6), 'téléphone', JSON.stringify(pv6))
ok(Math.abs(s5.t - tLost) < 0.3, `rechargement : même instant de manche (${tLost} → ${s5.t})`)
ok(!s5.paused && s5.countdown !== null, 'rechargement : reprise en « 3, 2, 1 », pas de pause à lever')
ok(s6.t > s5.t + 0.5 && s6.display === 'ok', 'rechargement : la manche repart, image présente')
const errs = logs.filter(l => !/contexte WebGL|CONTEXT_LOST|context lost|WebGL: /i.test(l))
log('console PC (hors messages de perte de contexte attendus) :', errs.length ? '\n' + errs.join('\n') : 'propre')
log('console PC complète :', logs.length, 'lignes')
for (const l of logs.slice(0, 12)) log('  ', l)
log('console téléphone :', ph.logs.length ? ph.logs.slice(0, 10).join('\n') : 'propre')
await browser.close()
