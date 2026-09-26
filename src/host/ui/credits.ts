// Crédits : lus depuis docs/CREDITS-sources.md (tenu à jour par chaque agent
// qui copie un asset dans public/). Format d'une ligne de tableau :
//   fichier servi | source (URL) | auteur | licence | attribution requise
import creditsMd from '../../../docs/CREDITS-sources.md?raw'
import { getLang, t } from '../../shared/i18n.ts'

/** 'samples' : instruments échantillonnés de la musique générative (pas des morceaux). */
export type CreditKind = 'music' | 'samples' | 'sfx' | 'voice' | 'fonts' | 'models' | 'textures' | 'other'

export interface CreditEntry {
  kind: CreditKind
  file: string
  title: string
  author: string
  license: string
  source: string
  /** Texte d'attribution demandé ou recommandé (entre « » dans la 5e colonne). */
  attribution?: string
}

function kindOf(file: string): CreditKind {
  const f = file.toLowerCase()
  if (/narrat|voice|voix|tts/.test(f)) return 'voice'
  if (/\/samples\//.test(f)) return 'samples'
  if (/music|musique/.test(f)) return 'music'
  if (/sfx|audio/.test(f)) return 'sfx'
  if (/font|\.woff2?$|\.ttf$|ofl/.test(f)) return 'fonts'
  if (/model|\.glb$|\.gltf$/.test(f)) return 'models'
  if (/texture|\.ktx2$|noise/.test(f)) return 'textures'
  return 'other'
}

/** « audio/music/dizzycrow_negev_desert_loop.ogg » → « Negev desert loop » ; polices : nom de famille. */
function titleOf(file: string, kind: CreditKind): string {
  const base = (file.split('/').pop() ?? file).replace(/\.[a-z0-9]+$/i, '').replace(/__fs\d+$/i, '')
  if (kind === 'fonts') {
    return base
      .replace(/-(\d{3}(-\d{3})?)(-latin(-ext)?)?$/i, '')
      .replace(/^OFL-/i, '')
      .split(/[-_]/)
      .map(w => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
      .join(' ')
  }
  const words = base.replace(/[_-]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : base
}

export function parseCredits(md: string): CreditEntry[] {
  const out: CreditEntry[] = []
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (!line.startsWith('|')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map(c => c.trim().replace(/`/g, ''))
    if (cells.length < 4) continue
    if (/^-+$/.test(cells[0].replace(/[:\s]/g, '')) || /fichier/i.test(cells[0])) continue
    const [rawFile, source, author, rawLicense, rawAttribution] = cells
    // « tanpura_A2.ogg (réaccordé, bouclé) » : la note entre parenthèses ne fait pas partie du titre
    const file = (rawFile ?? '').replace(/^(\S.*?)\s+\(.*\)\s*$/, '$1')
    // « SIL OFL 1.1 (fonts/OFL-x.txt, …) » → « SIL OFL 1.1 » : les détails restent dans le fichier.
    const license = normalizeLicense((rawLicense ?? '').replace(/\*\*/g, '').replace(/\s*\(.*$/, '').trim())
    // Textes de licence et créations propres au projet (créditées en tête) : ignorés.
    if (!file || /\.txt$/i.test(file) || /propre au projet/i.test(rawLicense ?? '')) continue
    const attribution = rawAttribution?.match(/«\s*([^»]+?)\s*»/)?.[1]
    const kind = kindOf(file)
    out.push({ kind, file, title: titleOf(file, kind), author, license, source, attribution })
  }
  return out
}

/**
 * Une seule écriture par licence : « CC BY 4.0 » (et non « CC-BY »), « CC0 1.0 », sans
 * préfixe descriptif (« poids du modèle CC-BY 4.0 » → « CC BY 4.0 »).
 */
export function normalizeLicense(license: string): string {
  let l = license.replace(/^.*?(?=\b(CC|SIL|MIT|OFL|Apache|GPL|LGPL|BSD)\b)/, '')
  l = l.replace(/\bCC[-\s]?BY\b/g, 'CC BY').replace(/\bCC[-\s]?0(\s*1\.0)?\b/g, 'CC0 1.0')
  return l.trim()
}

/** Nom d'instrument d'un échantillon : « tongue_A3.ogg » → « Tongue drum ». */
const INSTRUMENTS: Record<string, string> = { tongue: 'Tongue drum' }
function instrumentOf(file: string): string {
  const base = (file.split('/').pop() ?? file).replace(/\.[a-z0-9]+$/i, '').split(/[_-]/)[0] ?? file
  return INSTRUMENTS[base.toLowerCase()] ?? base[0]!.toUpperCase() + base.slice(1)
}

export interface CreditGroup {
  kind: CreditKind
  /** Lignes affichées : « titre — auteur · licence » ou « auteur · licence » (sons regroupés). */
  lines: { main: string; sub: string }[]
}

const ORDER: CreditKind[] = ['music', 'samples', 'voice', 'sfx', 'fonts', 'models', 'textures', 'other']

/** Regroupe et dédoublonne pour l'affichage. */
export function groupCredits(entries: CreditEntry[]): CreditGroup[] {
  const groups: CreditGroup[] = []
  for (const kind of ORDER) {
    const list = entries.filter(e => e.kind === kind)
    if (list.length === 0) continue
    const seen = new Set<string>()
    const lines: CreditGroup['lines'] = []
    if (kind === 'sfx' || kind === 'textures') {
      // Beaucoup de fichiers : un auteur par ligne.
      const byAuthor = new Map<string, Set<string>>()
      for (const e of list) {
        const key = e.author || '—'
        if (!byAuthor.has(key)) byAuthor.set(key, new Set())
        byAuthor.get(key)!.add(e.license)
      }
      for (const [author, lic] of byAuthor) lines.push({ main: author, sub: [...lic].join(', ') })
    } else if (kind === 'samples') {
      // Une ligne par instrument : « Oud — hammondman · CC0 1.0 » (et non trois « morceaux » Oud A2, C3, G2).
      const byInstrument = new Map<string, { authors: Set<string>; lic: Set<string> }>()
      for (const e of list) {
        const name = instrumentOf(e.file)
        if (!byInstrument.has(name)) byInstrument.set(name, { authors: new Set(), lic: new Set() })
        const g = byInstrument.get(name)!
        if (e.author) g.authors.add(e.author)
        g.lic.add(e.license)
      }
      for (const [name, g] of byInstrument) lines.push({ main: name, sub: [...g.authors, ...g.lic].join(' · ') })
    } else {
      // Plusieurs fichiers tirés d'une même source (les 9 notes d'un tongue drum) : une seule ligne,
      // au nom de la source (ajout qa : la liste des crédits commençait par « Tongue A3, Tongue C4… »).
      const keyOf = (e: CreditEntry) => e.attribution ?? `${e.source.match(/https?:\/\/\S+/)?.[0] ?? e.title}|${e.author}`
      const count = new Map<string, number>()
      for (const e of list) count.set(keyOf(e), (count.get(keyOf(e)) ?? 0) + 1)
      for (const e of list) {
        const key = keyOf(e)
        // même titre et même auteur (police en latin + latin-ext) : une ligne ; une attribution imposée
        // reste toujours affichée
        const byTitle = e.attribution ? key : `${e.title}|${e.author}`
        if (seen.has(key) || seen.has(byTitle)) continue
        seen.add(key)
        seen.add(byTitle)
        // titre de la source (« Calm Ambient 1 (Synthwave 4k) ») pour les morceaux et les lots,
        // nom du fichier pour un échantillon isolé (« Oud A2 » plutôt que « a2.wav »)
        const sourceTitle = e.source.match(/«\s*([^»]+?)\s*»/)?.[1]?.replace(/\.[a-z0-9]{2,4}$/i, '')
        const useSource = (count.get(key) ?? 1) > 1 || (kind === 'music' && !/\/samples\//.test(e.file))
        const title = (useSource && sourceTitle) || e.title
        // Une attribution imposée ou recommandée s'affiche telle quelle.
        if (e.attribution) lines.push({ main: e.attribution, sub: e.license })
        else lines.push({ main: title, sub: [e.author, e.license].filter(Boolean).join(' · ') })
      }
    }
    groups.push({ kind, lines })
  }
  return groups
}

export const CREDIT_GROUPS: CreditGroup[] = groupCredits(parseCredits(creditsMd))

/**
 * Attributions de la voix du narrateur, écrites en français dans le Markdown : traduites
 * à l'affichage (même sens, même licence), les autres lignes restent telles quelles.
 */
export function localizeCreditLine(line: { main: string; sub: string }, lang = getLang()): { main: string; sub: string } {
  if (/Pocket TTS/i.test(line.main)) return { main: t('host.credits.voice.tts', undefined, lang), sub: line.sub }
  const origin = line.main.match(/^Voix d[’']origine\s*:\s*(.+)$/i)
  if (origin) return { main: t('host.credits.voice.origin', { name: origin[1]! }, lang), sub: line.sub }
  return line
}

/** Bibliothèques libres du jeu (licences MIT sauf mention). */
export const TECH_CREDITS: readonly string[] = [
  'three.js',
  'React · React Three Fiber · drei',
  'postprocessing · pmndrs',
  'zustand',
  'Tone.js',
  'Vite · TypeScript',
  'ws · qrcode',
  'Kyutai Pocket TTS (CC BY 4.0)',
]
