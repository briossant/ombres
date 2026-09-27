// Vérifications de la page d'accueil des téléphones (/m) et de la redirection d'index.html.
//   PORT=8901 node tools/launch/landing-shots.mjs [--trailer=chemin.mp4] [--out=shots/landing/run]
// - téléphones (iPhone 15 Pro, iPhone SE 3e gén., Pixel 7 ; portrait et paysage) : la racine redirige vers /m,
//   captures de l'écran et de la page entière ;
// - tablette (iPad Mini) et PC : la racine garde le jeu ; ?desktop=1 force le jeu sur téléphone ;
// - /play?r=CODE sur téléphone : la manette, sans redirection ;
// - code de salle → /play?r=CODE ; poids transféré de /m (octets réellement reçus).
// --trailer : sert ce fichier à la place de /media/trailer-720.mp4 (tester le mode bande-annonce).
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { devices } from 'playwright-core'
import { launch } from '../lib/browser.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const PORT = Number(process.env.PORT ?? 8901)
const ORIGIN = process.env.ORIGIN ?? `http://localhost:${PORT}`
const OUT = resolve(arg('out', join(import.meta.dirname, '../../shots/landing/run')))
const TRAILER = arg('trailer', '')
const LOCALE = arg('locale', 'en-US')
const ONLY = arg('only', '')
mkdirSync(OUT, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// décodage vidéo logiciel : le décodeur matériel échoue en headless (PIPELINE_ERROR_DECODE)
const browser = await launch({ extraArgs: ['--disable-accelerated-video-decode'] })

async function phoneCtx(device, landscape, extra = {}) {
  const { defaultBrowserType: _d, ...d } = devices[device]
  const ctx = { ...d, deviceScaleFactor: 2, locale: LOCALE, ...extra }
  if (landscape) {
    ctx.viewport = { width: d.viewport.height, height: d.viewport.width }
    if (d.screen) ctx.screen = { width: d.screen.height, height: d.screen.width }
  }
  const c = await browser.newContext(ctx)
  if (TRAILER) await c.route('**/media/trailer-720.mp4', r => r.fulfill({ path: TRAILER, contentType: 'video/mp4' }))
  return c
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 15000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(700)
}

// ─── Téléphones : racine → /m ───
const phones = [
  ['iPhone 15 Pro', 'iphone15'],
  ['iPhone SE (3rd gen)', 'iphonese'],
  ['Pixel 7', 'pixel7'],
]
for (const [device, tag] of phones) {
  for (const landscape of [false, true]) {
    const name = `${tag}-${landscape ? 'land' : 'port'}`
    if (ONLY && !name.includes(ONLY)) continue
    const ctx = await phoneCtx(device, landscape)
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !/trailer-720|trailer-poster|404/.test(m.text()) && errors.push(m.text()))
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
    await page.waitForURL(/\/m(\?|$)/, { timeout: 10000 }).catch(() => {})
    check(`${name} : la racine redirige vers /m`, new URL(page.url()).pathname === '/m', page.url())
    await ready(page)
    const three = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => /three|host-|\/src\/host\//.test(r.name)).map(r => r.name))
    check(`${name} : ni three.js ni le jeu chargés`, three.length === 0, three.slice(0, 3).join(' '))
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(`${name} : pas de défilement horizontal`, overflow <= 0, `${overflow}px`)
    const mode = await page.evaluate(() => (document.getElementById('trailer') ? 'trailer' : document.querySelector('.strip--carousel') ? 'carousel' : '?'))
    console.log(`    mode média : ${mode}`)
    await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 80 })
    await page.screenshot({ path: join(OUT, `${name}-full.jpg`), type: 'jpeg', quality: 72, fullPage: true, scale: 'css' })
    check(`${name} : aucune erreur`, errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  }
}

if (!ONLY) {
  // ─── Code de salle → manette ───
  {
    const ctx = await phoneCtx('Pixel 7', false)
    const page = await ctx.newPage()
    await page.goto(`${ORIGIN}/m`, { waitUntil: 'load' })
    await ready(page)
    const input = page.locator('#code-input')
    await input.scrollIntoViewIfNeeded()
    await input.tap()
    await input.pressSequentially('ab1o-cd')
    const val = await input.inputValue()
    check('code : saisie normalisée (majuscules, sans chiffres ni O)', val === 'ABCD', val)
    await page.screenshot({ path: join(OUT, 'code-typed.jpg'), type: 'jpeg', quality: 80 })
    await page.locator('#code-go').tap()
    await page.waitForURL(/\/play\?r=ABCD/, { timeout: 10000 }).catch(() => {})
    check('code : « Rejoindre » ouvre /play?r=ABCD', /\/play\?r=ABCD$/.test(page.url()), page.url())
    await ctx.close()
  }
  // ─── Copier le lien ───
  {
    const ctx = await phoneCtx('iPhone 15 Pro', false, { permissions: ['clipboard-read', 'clipboard-write'] })
    const page = await ctx.newPage()
    await page.goto(`${ORIGIN}/m`, { waitUntil: 'load' })
    await ready(page)
    await page.locator('#btn-copy').tap()
    await page.waitForTimeout(300)
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(e => `ERR ${e.message}`)
    check('copier : le presse-papiers contient l’adresse du jeu', clip === 'https://ombres.deploy.breizhware.com', clip)
    await page.locator('#big').screenshot({ path: join(OUT, 'copied.jpg'), type: 'jpeg', quality: 80 })
    await ctx.close()
  }
  // ─── Français ───
  {
    const ctx = await phoneCtx('iPhone 15 Pro', false, { locale: 'fr-FR' })
    const page = await ctx.newPage()
    await page.goto(`${ORIGIN}/m`, { waitUntil: 'load' })
    await ready(page)
    const title = await page.textContent('#big-title')
    check('français selon le navigateur', /grand écran/.test(title ?? ''), title ?? '')
    await page.screenshot({ path: join(OUT, 'fr-iphone15.jpg'), type: 'jpeg', quality: 80 })
    await page.screenshot({ path: join(OUT, 'fr-iphone15-full.jpg'), type: 'jpeg', quality: 72, fullPage: true, scale: 'css' })
    await ctx.close()
  }
  // ─── ?desktop=1 force le jeu sur téléphone ───
  {
    const ctx = await phoneCtx('iPhone 15 Pro', false)
    const page = await ctx.newPage()
    await page.goto(`${ORIGIN}/?desktop=1`, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    check('?desktop=1 : le jeu reste sur téléphone', new URL(page.url()).pathname === '/', page.url())
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
    await page.waitForTimeout(800)
    check('?desktop=1 retenu pour l’onglet', new URL(page.url()).pathname === '/', page.url())
    await ctx.close()
  }
  // ─── /play sur téléphone : la manette, intacte ───
  {
    const ctx = await phoneCtx('iPhone 15 Pro', true)
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(`${ORIGIN}/play?r=ABCD`, { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    check('/play?r=ABCD sur téléphone : pas de redirection', new URL(page.url()).pathname.startsWith('/play'), page.url())
    const root = await page.evaluate(() => document.getElementById('root')?.childElementCount ?? 0)
    check('/play : la manette s’affiche', root > 0 && errors.length === 0, errors.join(' | '))
    await page.screenshot({ path: join(OUT, 'play-phone.jpg'), type: 'jpeg', quality: 80 })
    await ctx.close()
  }
  // ─── Tablette et PC : le jeu ───
  for (const [label, make] of [
    ['iPad Mini', () => phoneCtx('iPad Mini', true)],
    ['PC 1920×1080', () => browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: LOCALE })],
  ]) {
    const ctx = await make()
    const page = await ctx.newPage()
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const path = new URL(page.url()).pathname
    const canvas = await page
      .waitForSelector('canvas', { timeout: 60000 })
      .then(() => true)
      .catch(() => false)
    check(`${label} : la racine garde le jeu`, path === '/' && canvas, `${page.url()} canvas=${canvas}`)
    if (label.startsWith('PC')) {
      await page.waitForTimeout(6000)
      await page.screenshot({ path: join(OUT, 'desktop-root.jpg'), type: 'jpeg', quality: 80 })
    }
    await ctx.close()
  }
  // ─── Poids de /m (octets transférés, compression comprise) ───
  {
    const ctx = await phoneCtx('iPhone 15 Pro', false)
    const page = await ctx.newPage()
    const got = []
    page.on('requestfinished', async req => {
      const s = await req.sizes().catch(() => null)
      if (s) got.push({ url: req.url().replace(ORIGIN, ''), bytes: s.responseBodySize + s.responseHeadersSize })
    })
    await page.goto(`${ORIGIN}/m`, { waitUntil: 'networkidle' })
    await ready(page)
    await page.waitForTimeout(800)
    const first = got.reduce((a, r) => a + r.bytes, 0)
    const firstList = got.map(r => `${r.url} ${(r.bytes / 1024).toFixed(1)}`).join(', ')
    // tout voir : défiler jusqu'en bas et parcourir la bande de cases
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 300) {
        window.scrollTo(0, y)
        await new Promise(r => setTimeout(r, 60))
      }
      const list = document.getElementById('strip-list')
      if (list) for (let i = 0; i < 4; i++) { list.scrollLeft = i * list.clientWidth; await new Promise(r => setTimeout(r, 150)) }
    })
    await page.waitForTimeout(1200)
    const all = got.filter(r => !/trailer-720\.mp4/.test(r.url)).reduce((a, r) => a + r.bytes, 0)
    console.log(`    chargement initial : ${(first / 1024).toFixed(1)} Ko — ${firstList}`)
    console.log(`    page entière vue (hors vidéo) : ${(all / 1024).toFixed(1)} Ko, ${got.length} requêtes`)
    check('poids : chargement initial de /m < 150 Ko (hors vidéo)', first - got.filter(r => /trailer-720\.mp4/.test(r.url)).reduce((a, r) => a + r.bytes, 0) < 150 * 1024, `${(first / 1024).toFixed(1)} Ko`)
    await ctx.close()
  }
  // ─── /m ouvert sur un PC : « Lancer le jeu » ───
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: LOCALE })
    const page = await ctx.newPage()
    await page.goto(`${ORIGIN}/m`, { waitUntil: 'load' })
    await ready(page)
    const desk = await page.locator('#btn-desk').isVisible()
    check('/m sur PC : propose « Start the game »', desk)
    await page.screenshot({ path: join(OUT, 'm-desktop.jpg'), type: 'jpeg', quality: 80 })
    await ctx.close()
  }
}

await browser.close()
const bad = results.filter(r => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length} vérifications OK → ${OUT}`)
process.exit(bad.length ? 1 : 0)
