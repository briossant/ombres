// Vérifie l'aperçu de lien tel qu'un robot le voit : télécharge le HTML servi (racine et /m) avec
// les User-Agent de X, Discord, Facebook/Slack, en extrait les balises Open Graph / X (hors
// commentaires), contrôle les obligatoires, puis télécharge og:image (JPEG 1200 × 630, < 300 Ko)
// et og:video s'il y en a une (video/mp4, dimensions déclarées).
//   node tools/launch/og-check.mjs [origine=https://ombres.deploy.breizhware.com]
// Avec une origine locale (http://localhost:8901), les URL absolues du site public sont lues sur l'origine locale.
const PUBLIC = 'https://ombres.deploy.breizhware.com'
const origin = (process.argv[2] ?? PUBLIC).replace(/\/$/, '')
const local = origin !== PUBLIC
const map = u => (local && u.startsWith(PUBLIC) ? origin + u.slice(PUBLIC.length) : u)

const BOTS = {
  x: 'Twitterbot/1.0',
  discord: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
}
const REQUIRED = ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:type', 'og:site_name', 'og:locale', 'og:locale:alternate', 'twitter:card', 'twitter:description', 'twitter:image']

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Balises <meta property|name="og:… / twitter:…"> (les attributs dans n'importe quel ordre), hors commentaires. */
export function metaTags(html) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '')
  const out = {}
  for (const m of clean.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0]
    const key = /\b(?:property|name)\s*=\s*"([^"]+)"/i.exec(tag)?.[1]
    const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag)?.[1]
    if (key && content !== undefined && /^(og|twitter):/.test(key)) out[key] ??= content.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  }
  return out
}

/** Dimensions d'un JPEG (premier marqueur SOFn). */
function jpegSize(buf) {
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null
    const marker = buf[i + 1]
    const len = buf.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
    i += 2 + len
  }
  return null
}

let tagsRoot = null
for (const path of ['/', '/m']) {
  for (const [bot, ua] of Object.entries(BOTS)) {
    const res = await fetch(origin + path, { headers: { 'user-agent': ua }, redirect: 'manual' })
    const html = await res.text()
    const tags = metaTags(html)
    console.log(`${path} (${bot}) : HTTP ${res.status}, ${Object.keys(tags).length} balises`)
    check(`${path} ${bot} : HTTP 200 sans redirection serveur`, res.status === 200)
    const missing = REQUIRED.filter(k => !tags[k])
    check(`${path} ${bot} : balises obligatoires`, missing.length === 0, missing.join(', '))
    if (path === '/' && bot === 'x') tagsRoot = tags
    else if (tagsRoot) check(`${path} ${bot} : mêmes balises que la racine`, JSON.stringify(tags) === JSON.stringify(tagsRoot))
  }
}

const t = tagsRoot ?? {}
console.log('\nBalises servies (racine) :')
for (const [k, v] of Object.entries(t)) console.log(`  ${k.padEnd(22)} ${v}`)
check('og:url = adresse publique', t['og:url'] === PUBLIC, t['og:url'])
check('og:image absolue (https)', /^https:\/\//.test(t['og:image'] ?? ''), t['og:image'])
check('twitter:card = summary_large_image', t['twitter:card'] === 'summary_large_image')
check('descriptions en anglais, ≤ 200 caractères', [t['og:description'], t['twitter:description']].every(d => d && d.length <= 200 && /\b(the|your)\b/i.test(d)), `${t['og:description']?.length} / ${t['twitter:description']?.length}`)

if (t['og:image']) {
  const res = await fetch(map(t['og:image']), { headers: { 'user-agent': BOTS.x } })
  const buf = Buffer.from(await res.arrayBuffer())
  const size = jpegSize(buf)
  const kb = buf.length / 1024
  check('og:image : HTTP 200, image/jpeg', res.ok && /image\/jpeg/.test(res.headers.get('content-type') ?? ''), `${res.status} ${res.headers.get('content-type')}`)
  check('og:image : 1200 × 630, conforme aux balises', size?.w === 1200 && size?.h === 630 && t['og:image:width'] === '1200' && t['og:image:height'] === '630', JSON.stringify(size))
  check('og:image : < 300 Ko', kb < 300, `${kb.toFixed(1)} Ko`)
}
if (t['og:video']) {
  const res = await fetch(map(t['og:video']), { method: 'HEAD' })
  check('og:video : HTTP 200, video/mp4', res.ok && /video\/mp4/.test(res.headers.get('content-type') ?? ''), `${res.status} ${res.headers.get('content-type')} ${res.headers.get('content-length')} o`)
  check('og:video : type et dimensions déclarés', t['og:video:type'] === 'video/mp4' && +t['og:video:width'] > 0 && +t['og:video:height'] > 0)
  check('og:video : lecture par plages (Range)', res.headers.get('accept-ranges') === 'bytes')
} else console.log('  (pas de og:video : bande-annonce pas encore publiée, voir le TODO dans index.html)')

console.log(failures ? `\n${failures} échec(s)` : '\nAperçu de lien OK')
process.exit(failures ? 1 : 0)
