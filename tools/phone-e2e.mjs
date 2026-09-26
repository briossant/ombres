// Test de bout en bout de la manette : vrai serveur (port 8803), faux PC (tools/mock-host.ts),
// Chrome headless en émulation iPhone 15 Pro et Pixel 7.
//
//   npx tsx tools/phone-e2e.mjs [--only=flow|gallery] [--keep-server] [--dev]
//   (par défaut : build de production dans un dossier temporaire + relais en mode production)
//
// - Parcours complet (iPhone 15 Pro, paysage, FR) avec vérifications : profil, salon, multi-touch
//   (joystick + PLONGER simultanés, via CDP Input.dispatchTouchEvent), micro-objectifs, lancement,
//   cartes, manette (compte à rebours, PIQUER, prise d'élan, coup d'aile), pause par appui long,
//   coupure du socket, PC hors ligne puis rafraîchi, redémarrage du serveur, entre manches, fin
//   de partie et vote, erreurs (salle introuvable, pleine, retiré), saisie manuelle du code.
// - Galerie : chaque écran en FR et EN, iPhone 15 Pro et Pixel 7, paysage et portrait.
// Captures : shots/net-phone/e2e-*.jpg. Le port 8803 doit être libre (le script lance son serveur).
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { devices } from 'playwright-core'
import { launch, newContext, collectLogs } from './lib/browser.mjs'
import { MockHost } from './mock-host.ts'
import { memoryStore } from '../src/net/util.ts'
import { PhoneClient } from '../src/net/phoneClient.ts'

const ROOT = join(import.meta.dirname, '..')
const PORT = 8803
const HTTP = `http://localhost:${PORT}`
const WS = `ws://localhost:${PORT}/ws`
const SHOTS = join(ROOT, 'shots/net-phone')
mkdirSync(SHOTS, { recursive: true })
const args = Object.fromEntries(process.argv.slice(2).map(a => (a.includes('=') ? a.replace(/^--/, '').split('=') : [a.replace(/^--/, ''), true])))

// ─── Outils ────────────────────────────────────────────────────────────────

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function until(cond, ms = 8000, step = 50) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await cond()) return true
    await sleep(step)
  }
  return false
}

function portBusy(port) {
  return new Promise(resolve => {
    const s = createConnection({ port, host: '127.0.0.1' })
    s.once('connect', () => {
      s.destroy()
      resolve(true)
    })
    s.once('error', () => resolve(false))
  })
}

// Par défaut : build de production dans un dossier temporaire, servi par le relais en mode production
// (comme en déploiement ; pas de rechargement HMR de Vite quand le serveur redémarre). --dev : Vite.
const DEV = !!args.dev
const DIST = process.env.OMBRES_E2E_DIST ?? join(ROOT, 'node_modules/.cache/ombres-phone-e2e-dist')

async function buildOnce() {
  if (DEV) return
  await new Promise((resolve, reject) => {
    const b = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--config', join(ROOT, 'tools/phone-vite.config.mjs'), '--outDir', DIST, '--emptyOutDir'], { cwd: ROOT, stdio: 'inherit' })
    b.on('exit', code => (code === 0 ? resolve() : reject(new Error(`vite build : ${code}`))))
  })
}

let server = null
async function startServer() {
  const env = DEV ? { ...process.env, PORT: String(PORT) } : { ...process.env, PORT: String(PORT), NODE_ENV: 'production', OMBRES_DIST: DIST }
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  server.stdout.on('data', d => (out += d))
  server.stderr.on('data', d => (out += d))
  if (!(await until(() => /Ombres (dev|prod)/.test(out), 20000))) throw new Error(`serveur : ${out}`)
}
async function stopServer() {
  const s = server
  server = null
  if (!s || s.exitCode !== null) return
  await new Promise(resolve => {
    s.on('exit', resolve)
    s.kill('SIGKILL')
  })
}

/** Instrumente WebSocket dans la page : liste des sockets et coupure réseau simulée. */
const WS_HOOK = () => {
  // Espions : écran allumé, plein écran, vibrations.
  window.__wake = 0
  window.__fs = 0
  window.__vib = []
  if (navigator.wakeLock) {
    const orig = navigator.wakeLock.request.bind(navigator.wakeLock)
    navigator.wakeLock.request = type => {
      window.__wake++
      return orig(type)
    }
  }
  const ofs = Element.prototype.requestFullscreen
  Element.prototype.requestFullscreen = function (o) {
    window.__fs++
    return ofs.call(this, o).catch(() => undefined)
  }
  const ovib = navigator.vibrate?.bind(navigator)
  navigator.vibrate = p => {
    window.__vib.push(Array.isArray(p) ? p.join(',') : String(p))
    return ovib ? ovib(p) : true
  }
  window.__sockets = []
  window.__blockWs = false
  const Native = window.WebSocket
  window.WebSocket = class extends Native {
    constructor(url, protocols) {
      super(window.__blockWs ? String(url).replace(/:\d+\//, ':9/') : url, protocols)
      window.__sockets.push(this)
    }
  }
}

async function newPhone(browser, device = 'iPhone 15 Pro', landscape = true, locale = null) {
  let ctx
  if (locale) {
    // Langue du navigateur (écrans d'avant la connexion) : contexte construit ici pour fixer la locale.
    const { defaultBrowserType: _d, ...d } = devices[device]
    ctx = await browser.newContext({ ...d, locale, ...(landscape ? { viewport: { width: d.viewport.height, height: d.viewport.width } } : {}) })
  } else ctx = await newContext(browser, { mobile: device, landscape })
  const page = await ctx.newPage()
  await page.addInitScript(WS_HOOK)
  const logs = collectLogs(page)
  const cdp = await ctx.newCDPSession(page)
  return { ctx, page, logs, cdp }
}

async function shot(page, name, settleMs = 260) {
  // Laisse finir les fondus d'entrée (220 ms) : la capture montre l'état stable.
  if (settleMs) await sleep(settleMs)
  const path = join(SHOTS, `e2e-${name}.jpg`)
  await page.screenshot({ path, type: 'jpeg', quality: 86 })
  return path
}

async function center(page, selector) {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`introuvable : ${selector}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }
}

const tp = (id, x, y) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })

// ─── Parcours complet ──────────────────────────────────────────────────────

async function flow(browser) {
  console.log('\n— Parcours complet (iPhone 15 Pro, paysage, FR)')
  const hostStore = memoryStore()
  let host = new MockHost({ url: WS, lang: 'fr', log: () => {}, storage: hostStore })
  const room = await host.start()
  check('salle créée', /^[A-Z]{4}$/.test(room), room)

  const { page, cdp, logs } = await newPhone(browser)
  await page.goto(`${HTTP}/play?r=${room}`, { waitUntil: 'load' })
  check('écran de profil', await until(() => page.locator('.profile').count().then(n => n > 0), 10000))
  await sleep(400)
  await shot(page, 'flow-01-profile')
  const phoneId = [...host.players.keys()][0]
  check('téléphone annoncé au PC (hello reçu)', !!phoneId)

  // Nom + couleur
  await page.fill('#phone-name', 'Brieuc')
  await page.locator('.swatch').nth(3).click()
  const guards = await page.evaluate(() => ({
    wake: window.__wake,
    fs: window.__fs,
    touch: getComputedStyle(document.body).touchAction,
    select: getComputedStyle(document.body).userSelect,
  }))
  check('écran allumé demandé au premier appui (Wake Lock)', guards.wake >= 1, `requests=${guards.wake}`)
  check('plein écran demandé au premier appui', guards.fs >= 1)
  check('pas de zoom / défilement / sélection', guards.touch === 'none' && guards.select === 'none', `${guards.touch} ${guards.select}`)
  await page.locator('.profile__go').click()
  check('salon après le profil', await until(() => page.locator('.lobby-goals').count().then(n => n > 0), 5000))
  const p = host.players.get(phoneId)
  check('profil reçu par le PC', p?.profileSet === true && p.name === 'Brieuc' && p.color === 3, `${p?.name} couleur ${p?.color}`)
  await sleep(500)
  await shot(page, 'flow-02-lobby')

  // Multi-touch : joystick + PLONGER maintenus ensemble
  const zone = await center(page, '.stick-zone')
  const dive = await center(page, '.act--dive')
  const sx = zone.b.x + zone.b.width * 0.45
  const sy = zone.b.y + zone.b.height * 0.55
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, sx, sy)] })
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, sx + i * 8, sy - i * 8)] })
    await sleep(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, sx + 48, sy - 48), tp(2, dive.x, dive.y)] })
  const both = await until(() => {
    const info = host.hub.phone(phoneId)
    return info && info.x > 0.5 && info.y > 0.5 && (info.buttons & 1) === 1
  }, 3000)
  const info = host.hub.phone(phoneId)
  check('multi-touch : joystick et PLONGER simultanés', both, `x=${info?.x.toFixed(2)} y=${info?.y.toFixed(2)} b=${info?.buttons}`)
  await sleep(300)
  await shot(page, 'flow-03-lobby-multitouch')
  // Micro-objectifs : on garde le stick poussé 2 s et PLONGER 1 s
  await sleep(2300)
  const g = host.viewFor(host.players.get(phoneId)).lobby.goals
  check('micro-objectifs Vole + Plonge cochés par le PC', g.fly && g.dive)
  check('coches visibles sur le téléphone', (await page.locator('.goal.is-done').count()) >= 2)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [tp(1, sx + 48, sy - 48)] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  check('relâché : PLONGER et stick à zéro', await until(() => { const i = host.hub.phone(phoneId); return i.buttons === 0 && i.x === 0 && i.y === 0 }, 2000))
  // « Pique » (simulé par le faux PC : un appui de PLONGER après « Plonge »)
  await sleep(900)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(3, dive.x, dive.y)] })
  await sleep(60)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  check('les trois objectifs cochés', await until(() => page.locator('.goal.is-done').count().then(n => n === 3), 3000))
  await shot(page, 'flow-04-lobby-done')
  const presses = host.hub.phone(phoneId).divePresses
  check('compteur d’appuis PLONGER monotone', presses >= 2, `divePresses=${presses}`)

  // Réglages : type de contrôle, aide au vol, changement de nom et de couleur
  await page.locator('.band .icon-btn').last().click()
  check('réglages ouverts', await until(() => page.locator('.sheet__panel').count().then(n => n > 0), 2000))
  await page.locator('.segmented .btn').nth(1).click()
  check('contrôle Relatif transmis au PC', await until(() => host.players.get(phoneId)?.scheme === 'relative', 2000))
  await page.locator('.sheet .toggle').first().click()
  check('aide au vol transmise au PC', await until(() => host.players.get(phoneId)?.assist === true, 2000))
  await shot(page, 'flow-04b-settings')
  await page.locator('.segmented .btn').nth(0).click()
  await page.locator('.sheet__body > .btn').first().click()
  check('profil depuis les réglages', await until(() => page.locator('.sheet .profile').count().then(n => n > 0), 2000))
  await page.fill('#phone-name', 'Brieuc B.')
  await page.locator('.sheet .swatch').nth(4).click()
  await page.locator('.sheet .profile__go').click()
  check('nouveau nom et couleur reçus', await until(() => host.players.get(phoneId)?.name === 'Brieuc B.' && host.players.get(phoneId)?.color === 4, 2000))
  check('plume d’aide au vol dans le bandeau', await until(() => page.locator('.band__assist').count().then(n => n > 0), 2000))

  // Lancement par le meneur (bouton du bandeau)
  await page.locator('.band__start').click()
  check('cartes des règles', await until(() => page.locator('.intro__cards').count().then(n => n > 0), 4000))
  await sleep(1200)
  await shot(page, 'flow-05-intro')
  await page.locator('.intro__foot .btn').click()
  check('manette après « Compris »', await until(() => page.locator('.act--dive').count().then(n => n > 0) && host.screen === 'play', 4000))
  await sleep(250)
  await shot(page, 'flow-06-play-countdown')
  await sleep(3200)
  await shot(page, 'flow-07-play')
  check('bandeau : rang et part affichés', (await page.locator('.band__rank').innerText()).length > 0)

  // PIQUER à la couleur de la cible
  host.setStatusOverride({ target: 5 })
  check('PIQUER quand une cible est verrouillée', await until(() => page.locator('.act--dive.is-target').count().then(n => n > 0), 2000))
  await shot(page, 'flow-08-play-target')
  host.setStatusOverride({})

  // Prise d'élan contre le joueur : bordure rouge
  host.cue(phoneId, 'windup')
  check('bordure rouge à la prise d’élan', await until(() => page.locator('.fx__alert.is-on').count().then(n => n > 0), 1500))
  check('vibration [120] à la prise d’élan (GDD §12.3)', (await page.evaluate(() => window.__vib)).includes('120'))
  // iOS n'a pas navigator.vibrate : la vibration devient un flash du bandeau.
  await page.evaluate(() => {
    window.__flashes = 0
    window.__savedVibrate = navigator.vibrate
    navigator.vibrate = undefined
    new MutationObserver(ms => {
      for (const m of ms) if (m.target.classList?.contains('is-flash')) window.__flashes++
    }).observe(document.querySelector('.band'), { attributes: true, attributeFilter: ['class'] })
  })
  host.cue(phoneId, 'locked')
  check('sans vibration (iOS) : flash du bandeau à la place', await until(() => page.evaluate(() => window.__flashes > 0), 1500))
  await page.evaluate(() => (navigator.vibrate = window.__savedVibrate))
  await sleep(120)
  await shot(page, 'flow-09-play-windup')
  host.cue(phoneId, 'clac')
  await sleep(80)
  check('flash au clac + appel au COUP D’AILE', (await page.locator('.act-callout').count()) > 0)
  // Coup d'aile : prédiction locale immédiate de la recharge
  const flap = await center(page, '.act--flap')
  const f0 = host.hub.phone(phoneId).flapPresses
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(4, flap.x, flap.y)] })
  await sleep(30)
  const chargingNow = await page.locator('.act--flap.is-charging').count()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  check('recharge affichée à l’appui (sans attendre le PC)', chargingNow > 0)
  check('COUP D’AILE reçu par le PC', await until(() => host.hub.phone(phoneId).flapPresses === f0 + 1, 2000))
  await sleep(700)
  await shot(page, 'flow-10-play-flap-charging')

  // Pause par appui long d'une seconde
  const pause = await center(page, '.pause-btn')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(5, pause.x, pause.y)] })
  await sleep(400)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(300)
  check('appui court : pas de pause', host.paused === null)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(5, pause.x, pause.y)] })
  await sleep(1150)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  check('appui long : pause', await until(() => host.paused !== null && page.locator('.overlay .btn--primary').count().then(n => n > 0), 2000))
  await shot(page, 'flow-11-paused')
  await page.locator('.overlay .btn--primary').click()
  check('reprise', await until(() => host.paused === null, 2000))

  // Coupure du socket du téléphone : reconnexion silencieuse, même id
  const joinsBefore = [...host.players.keys()].length
  await page.evaluate(() => window.__sockets.at(-1).close())
  check('reconnexion silencieuse du téléphone', await until(() => page.evaluate(() => window.__sockets.at(-1).readyState === 1 && window.__sockets.length >= 2), 4000))
  check('même joueur côté PC', [...host.players.keys()].length === joinsBefore)
  // Réseau coupé plus longtemps : surcouche « Le vent t'a emporté… »
  await page.evaluate(() => {
    window.__blockWs = true
    window.__sockets.at(-1).close()
  })
  check('surcouche de reconnexion', await until(() => page.locator('.overlay[role=alert]').count().then(n => n > 0), 4000))
  await shot(page, 'flow-12-reconnecting')
  await page.evaluate(() => (window.__blockWs = false))
  check('retour dans la partie', await until(() => page.locator('.overlay[role=alert]').count().then(n => n === 0), 8000))

  // PC hors ligne puis rafraîchi (même salle, même partie)
  host.stop()
  check('« L’écran se reconnecte… »', await until(() => page.locator('.overlay[role=alert]').count().then(n => n > 0), 4000))
  await shot(page, 'flow-13-host-away')
  host = new MockHost({ url: WS, lang: 'fr', log: () => {}, storage: hostStore })
  const room2 = await host.start()
  check('PC rafraîchi : même salle', room2 === room, room2)
  check('téléphone repris sans rien faire', await until(() => page.locator('.overlay[role=alert]').count().then(n => n === 0) && host.hub.phone(phoneId)?.online, 6000))
  host.setScreen('play')

  // Redémarrage du serveur (redeploy) : salle recréée au même code, téléphone revenu
  const flapsBefore = host.hub.phone(phoneId).flapPresses
  const trace = []
  const t0 = Date.now()
  const tr = s => trace.push(`${((Date.now() - t0) / 1000).toFixed(2)} ${s}`)
  page.on('websocket', ws => {
    if (!ws.url().includes('role=phone')) return
    tr(`WS open`)
    ws.on('framesent', f => !/"ping"|"in"/.test(f.payload) && tr(`> ${String(f.payload).slice(0, 70)}`))
    ws.on('framereceived', f => !/pong|"st"/.test(f.payload) && tr(`< ${String(f.payload).slice(0, 70)}`))
    ws.on('close', () => tr('WS close'))
  })
  page.on('framenavigated', f => f === page.mainFrame() && tr('NAV'))
  host.session.on('status', s => tr(`host ${s}`))
  await stopServer()
  check('surcouche pendant la coupure du serveur', await until(() => page.locator('.overlay[role=alert]').count().then(n => n > 0), 6000))
  await shot(page, 'flow-14-server-down')
  await sleep(2500)
  await startServer()
  check('hôte revenu au même code', await until(() => host.session.status === 'online' && host.room === room, 12000))
  const back = await until(() => page.locator('.overlay[role=alert]').count().then(n => n === 0) && host.hub.phone(phoneId)?.online, 15000)
  if (!back) {
    await shot(page, 'flow-14b-restart-diag', 0)
    const diag = await page.evaluate(() => ({ nav: performance.getEntriesByType('navigation')[0]?.type, sockets: window.__sockets.map(s => s.readyState), body: document.body.innerText.slice(0, 120) }))
    console.log('    diag', JSON.stringify(diag), 'hub:', JSON.stringify(host.hub.phone(phoneId) && { online: host.hub.phone(phoneId).online }), 'host:', host.session.status)
    console.log(trace.map(l => `      ${l}`).join('\n'))
  }
  check('téléphone revenu après redémarrage', back)
  const flapNow = await center(page, '.act--flap')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(6, flapNow.x, flapNow.y)] })
  await sleep(40)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  check('entrées après redémarrage (compteur monotone)', await until(() => host.hub.phone(phoneId).flapPresses === flapsBefore + 1, 3000))

  // Entre les manches → Prêt ; fin de partie → Revanche
  host.setScreen('roundEnd')
  check('écran entre les manches', await until(() => page.locator('.stats').count().then(n => n > 0), 3000))
  await sleep(300)
  await shot(page, 'flow-15-roundEnd')
  await page.locator('.result__ready .btn').click()
  check('Prêt → manche suivante', await until(() => host.screen === 'play' && host.round === 2, 3000))
  host.setScreen('matchEnd')
  check('fin de partie', await until(() => page.locator('.vote-row').count().then(n => n > 0), 3000))
  await sleep(300)
  await shot(page, 'flow-16-matchEnd')
  await page.locator('.vote-row .btn').first().click()
  check('vote Revanche → nouvelle partie', await until(() => host.screen === 'intro' && host.round === 1, 3000))

  // Retiré par le PC
  host.setScreen('lobby')
  await sleep(300)
  host.kick(phoneId)
  check('écran « retiré »', await until(() => page.locator('.case--alert').count().then(n => n > 0), 3000))
  await shot(page, 'flow-17-kicked')
  await page.locator('.case--alert .btn').click()
  check('revenir dans la partie après un retrait', await until(() => page.locator('.profile').count().then(n => n > 0), 5000))

  // Les échecs de connexion WebSocket pendant les coupures simulées sont journalisés par Chrome lui-même.
  const errors = logs.filter(l => /pageerror|\[error\]/.test(l) && !/favicon|404|WebSocket connection to/.test(l))
  check('aucune erreur JS dans la page', errors.length === 0, errors.slice(0, 3).join(' | '))
  await page.context().close()

  // Salle introuvable (code inexistant) puis saisie manuelle du bon code
  {
    const { page: p2 } = await newPhone(browser)
    await p2.goto(`${HTTP}/play?r=ZZZZ`, { waitUntil: 'load' })
    check('« Salle introuvable » après la patience', await until(() => p2.locator('.case--alert').count().then(n => n > 0), 12000))
    await shot(p2, 'flow-18-room-not-found')
    await p2.fill('.code-input', room.toLowerCase())
    await p2.locator('.case--alert button[type=submit]').click()
    check('saisie manuelle du code → profil', await until(() => p2.locator('.profile').count().then(n => n > 0), 8000))
    await p2.context().close()
  }
  // Page sans code : écran de saisie
  {
    const { page: p3 } = await newPhone(browser)
    await p3.goto(`${HTTP}/play`, { waitUntil: 'load' })
    check('écran « Rejoindre »', await until(() => p3.locator('.code-input').count().then(n => n > 0), 5000))
    await sleep(300)
    await shot(p3, 'flow-19-join')
    await p3.fill('.code-input', room)
    await p3.locator('button[type=submit]').click()
    check('rejoindre par le code', await until(() => p3.locator('.profile').count().then(n => n > 0), 8000))
    await p3.context().close()
  }
  // Salle pleine : 12 manettes Node, puis le navigateur
  {
    const clients = []
    for (let i = 0; i < 12; i++) {
      const c = new PhoneClient({ room, url: WS, storage: memoryStore(), sessionStorage: memoryStore(), hello: () => ({ name: `N${i}`, color: null, scheme: 'absolute', assist: false, lang: 'fr', caps: { vibrate: false, tilt: false, ios: false } }) })
      c.start()
      clients.push(c)
    }
    await until(() => clients.every(c => c.state === 'online' || c.state === 'error'), 8000)
    const { page: p4 } = await newPhone(browser)
    await p4.goto(`${HTTP}/play?r=${room}`, { waitUntil: 'load' })
    check('« La salle est pleine »', await until(() => p4.locator('.case--alert').count().then(n => n > 0), 8000))
    await shot(p4, 'flow-20-room-full')
    for (const c of clients) c.stop()
    await p4.context().close()
  }
  host.stop()
}

// ─── Galerie : chaque écran, FR/EN, deux téléphones, deux orientations ─────

async function gallery(browser) {
  console.log('\n— Galerie')
  const devices = [
    ['iPhone 15 Pro', true],
    ['iPhone 15 Pro', false],
    ['Pixel 7', true],
    ['Pixel 7', false],
  ]
  for (const lang of ['fr', 'en']) {
    const host = new MockHost({ url: WS, lang, log: () => {}, logInputs: false })
    const room = await host.start()
    for (const [device, landscape] of devices) {
      const tag = `${device.replace(/\s+/g, '')}-${landscape ? 'land' : 'port'}-${lang}`
      host.setScreen('lobby')
      const locale = lang === 'fr' ? 'fr-FR' : 'en-US'
      const { page, ctx, cdp } = await newPhone(browser, device, landscape, locale)
      // Écran « Rejoindre » (sans code), dans la langue du navigateur
      await page.goto(`${HTTP}/play`, { waitUntil: 'load' })
      await until(() => page.locator('.code-input').count().then(n => n > 0), 5000)
      await shot(page, `gal-${tag}-join`)
      await page.goto(`${HTTP}/play?r=${room}`, { waitUntil: 'load' })
      await until(() => page.locator('.profile').count().then(n => n > 0), 10000)
      await sleep(400)
      await shot(page, `gal-${tag}-profile`)
      await page.fill('#phone-name', lang === 'fr' ? 'Maëlle' : 'Robin')
      await page.locator('.profile__go').click()
      await until(() => page.locator('.lobby-goals').count().then(n => n > 0), 5000)
      await sleep(500)
      await shot(page, `gal-${tag}-lobby`)
      const id = [...host.players.keys()].at(-1)
      // Multi-touch sur ce téléphone et cette orientation : joystick + PLONGER ensemble
      {
        const zone = await center(page, '.stick-zone')
        const dive = await center(page, '.act--dive')
        const sx = zone.b.x + zone.b.width * 0.5
        const sy = zone.b.y + zone.b.height * 0.6
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, sx, sy)] })
        for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, sx - i * 12, sy)] })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, sx - 60, sy), tp(2, dive.x, dive.y)] })
        const ok = await until(() => {
          const i = host.hub.phone(id)
          return i && i.x < -0.5 && (i.buttons & 1) === 1
        }, 3000)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        check(`multi-touch ${tag}`, ok)
      }
      host.pause(id)
      await until(() => page.locator('.overlay').count().then(n => n > 0), 3000)
      await shot(page, `gal-${tag}-paused`)
      host.resume()
      await page.evaluate(() => {
        window.__blockWs = true
        window.__sockets.at(-1).close()
      })
      await until(() => page.locator('.overlay[role=alert]').count().then(n => n > 0), 4000)
      await shot(page, `gal-${tag}-reconnecting`)
      await page.evaluate(() => (window.__blockWs = false))
      await until(() => page.locator('.overlay[role=alert]').count().then(n => n === 0), 8000)
      host.setScreen('intro')
      await sleep(900)
      await shot(page, `gal-${tag}-intro`)
      host.setScreen('play')
      await sleep(3700)
      host.setStatusOverride({ target: 1, crown: true, rank: 1 })
      await sleep(400)
      await shot(page, `gal-${tag}-play-target`)
      host.setStatusOverride({ stun: 1.2 })
      host.cue(id, 'stunned')
      await sleep(250)
      await shot(page, `gal-${tag}-play-stunned`)
      host.setStatusOverride({})
      host.setScreen('roundEnd')
      await sleep(500)
      await shot(page, `gal-${tag}-roundEnd`)
      host.setScreen('matchEnd')
      await sleep(500)
      await shot(page, `gal-${tag}-matchEnd`)
      host.setScreen('spectate')
      await sleep(500)
      await shot(page, `gal-${tag}-spectate`)
      host.setScreen('lobby')
      await page.locator('.band .icon-btn').last().click()
      await sleep(400)
      await shot(page, `gal-${tag}-settings`)
      await ctx.close()
      host.kick(id)
      console.log(`  • ${tag}`)
    }
    // Erreur « salle introuvable » dans la langue du navigateur
    {
      const { page, ctx } = await newPhone(browser, 'iPhone 15 Pro', true, lang === 'fr' ? 'fr-FR' : 'en-US')
      await page.goto(`${HTTP}/play?r=ZZZZ`, { waitUntil: 'load' })
      await until(() => page.locator('.case--alert').count().then(n => n > 0), 12000)
      await shot(page, `gal-iPhone15Pro-land-${lang}-error-not-found`)
      await ctx.close()
    }
    host.stop()
  }
}

// ─── Principal ─────────────────────────────────────────────────────────────

if (await portBusy(PORT)) {
  console.error(`Le port ${PORT} est occupé : arrêtez le serveur de dev (le test lance le sien).`)
  process.exit(2)
}
await buildOnce()
await startServer()
const browser = await launch()
try {
  if (args.only !== 'gallery') await flow(browser)
  if (args.only !== 'flow') await gallery(browser)
} catch (err) {
  check('exécution sans exception', false, String(err?.stack ?? err))
} finally {
  await browser.close()
  if (!args['keep-server']) await stopServer()
}
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} vérifications OK`)
process.exit(failed.length ? 1 : 0)
