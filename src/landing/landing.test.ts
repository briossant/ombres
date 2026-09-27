import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { landing } from '../shared/strings/landing.ts'
import { isCode, isPhone, makeT, normalizeCode, pickLang, playUrl } from './logic.ts'

const ROOT = join(import.meta.dirname, '../..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('détection du téléphone', () => {
  it('téléphones → accueil, tablettes et PC → jeu', () => {
    expect(isPhone(393, 852, true)).toBe(true) // iPhone 15 Pro
    expect(isPhone(852, 393, true)).toBe(true) // paysage
    expect(isPhone(375, 667, true)).toBe(true) // iPhone SE
    expect(isPhone(412, 915, true)).toBe(true) // Pixel 7
    expect(isPhone(744, 1133, true)).toBe(false) // iPad mini
    expect(isPhone(600, 960, true)).toBe(false) // petite tablette Android
    expect(isPhone(1920, 1080, false)).toBe(false) // PC
    expect(isPhone(360, 640, false)).toBe(false) // petite fenêtre avec souris
  })
})

/** Exécute le script en tête d'index.html dans un faux navigateur ; renvoie l'URL de redirection éventuelle. */
function runHeadScript(o: { w: number; h: number; coarse: boolean; search?: string; stored?: string | null; storageThrows?: boolean }) {
  const html = read('index.html')
  const head = html.slice(0, html.indexOf('</head>'))
  const code = /<script>([\s\S]*?)<\/script>/.exec(head)?.[1]
  if (!code) throw new Error('script de redirection introuvable en tête d’index.html')
  const store = new Map<string, string>()
  if (o.stored) store.set('ombres.desktop', o.stored)
  let replaced: string | null = null
  const sessionStorage = {
    getItem: (k: string) => {
      if (o.storageThrows) throw new Error('SecurityError')
      return store.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (o.storageThrows) throw new Error('SecurityError')
      store.set(k, v)
    },
  }
  const location = { search: o.search ?? '', hash: '', replace: (u: string) => (replaced = u) }
  const matchMedia = (q: string) => ({ matches: q === '(pointer: coarse)' ? o.coarse : false })
  new Function('location', 'screen', 'matchMedia', 'sessionStorage', code)(location, { width: o.w, height: o.h }, matchMedia, sessionStorage)
  return { replaced: replaced as string | null, store }
}

describe('script de redirection d’index.html', () => {
  it('redirige un téléphone vers /m en gardant la requête', () => {
    expect(runHeadScript({ w: 393, h: 852, coarse: true }).replaced).toBe('/m')
    expect(runHeadScript({ w: 852, h: 393, coarse: true, search: '?utm_source=x' }).replaced).toBe('/m?utm_source=x')
  })
  it('laisse le jeu aux tablettes, aux PC, à ?desktop=1 (retenu) et à ?debug', () => {
    expect(runHeadScript({ w: 768, h: 1024, coarse: true }).replaced).toBeNull()
    expect(runHeadScript({ w: 1920, h: 1080, coarse: false }).replaced).toBeNull()
    const forced = runHeadScript({ w: 393, h: 852, coarse: true, search: '?desktop=1' })
    expect(forced.replaced).toBeNull()
    expect(forced.store.get('ombres.desktop')).toBe('1')
    expect(runHeadScript({ w: 393, h: 852, coarse: true, stored: '1' }).replaced).toBeNull()
    expect(runHeadScript({ w: 393, h: 852, coarse: true, search: '?debug=fast' }).replaced).toBeNull()
  })
  it('stockage indisponible : ?desktop=1 marche quand même, sinon redirection', () => {
    expect(runHeadScript({ w: 393, h: 852, coarse: true, search: '?desktop=1', storageThrows: true }).replaced).toBeNull()
    expect(runHeadScript({ w: 393, h: 852, coarse: true, storageThrows: true }).replaced).toBe('/m')
  })
})

describe('langue', () => {
  it('choix mémorisé, sinon la langue du navigateur, sinon anglais', () => {
    expect(pickLang('fr', ['en-US'])).toBe('fr')
    expect(pickLang(null, ['fr-FR', 'en'])).toBe('fr')
    expect(pickLang(null, ['de-DE', 'fr-CH'])).toBe('fr')
    expect(pickLang(null, ['de-DE', 'en-GB', 'fr'])).toBe('en')
    expect(pickLang('xx', ['ja'])).toBe('en')
  })
})

describe('code de salle', () => {
  it('normalise comme la manette (majuscules, alphabet sans I/O ni chiffres)', () => {
    expect(normalizeCode('ab1o-cd')).toBe('ABCD')
    expect(normalizeCode('mqrmx')).toBe('MQRM')
    expect(isCode('MQRM')).toBe(true)
    expect(isCode('MQR')).toBe(false)
    expect(isCode('MQRI')).toBe(false)
    expect(playUrl('MQRM')).toBe('/play?r=MQRM')
  })
})

describe('textes', () => {
  it('FR et EN ont les mêmes clés, toutes non vides', () => {
    expect(Object.keys(landing.fr).sort()).toEqual(Object.keys(landing.en).sort())
    for (const lang of ['fr', 'en'] as const) for (const [k, v] of Object.entries(landing[lang])) expect(v.trim(), k).not.toBe('')
  })
  it('chaque clé utilisée par m.html existe', () => {
    const html = read('m.html')
    const keys = [...html.matchAll(/data-t(?:-aria)?="([^"]+)"/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(10)
    for (const k of keys) expect(landing.en[k], k).toBeTypeOf('string')
  })
  it('makeT remplace les paramètres', () => {
    const t = makeT(landing, 'fr')
    expect(t('landing.media.dot', { n: 2, total: 4 })).toBe('Image 2 sur 4')
    expect(t('landing.inconnue')).toBe('landing.inconnue')
  })
})

describe('aperçu de lien', () => {
  it('index.html et m.html portent les mêmes balises Open Graph / X, image absolue', () => {
    const tags = (raw: string) => {
      const html = raw.replace(/<!--[\s\S]*?-->/g, '') // balises en commentaire (TODO og:video) exclues
      return Object.fromEntries([...html.matchAll(/<meta (?:property|name)="((?:og|twitter):[^"]+)" content="([^"]*)"/g)].map(m => [m[1], m[2]]))
    }
    const a = tags(read('index.html'))
    const b = tags(read('m.html'))
    expect(a).toEqual(b)
    expect(a['og:title']).toBe('Ombres')
    expect(a['og:url']).toBe('https://ombres.deploy.breizhware.com')
    expect(a['og:image']).toBe('https://ombres.deploy.breizhware.com/og.jpg')
    expect(a['twitter:card']).toBe('summary_large_image')
    expect(a['og:locale']).toBe('en_US')
    expect(a['og:locale:alternate']).toBe('fr_FR')
  })
})
