// Crédits : lus depuis docs/CREDITS-sources.md (tenu à jour par chaque agent
// qui copie un asset dans public/). Format d'une ligne de tableau :
//   fichier servi | source (URL) | auteur | licence | attribution requise
import creditsMd from '../../../docs/CREDITS-sources.md?raw'

export type CreditKind = 'music' | 'sfx' | 'voice' | 'fonts' | 'models' | 'textures' | 'other'

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
    const [file, source, author, rawLicense, rawAttribution] = cells
    // « SIL OFL 1.1 (fonts/OFL-x.txt, …) » → « SIL OFL 1.1 » : les détails restent dans le fichier.
    const license = (rawLicense ?? '').replace(/\*\*/g, '').replace(/\s*\(.*$/, '').trim()
    // Textes de licence et créations propres au projet (créditées en tête) : ignorés.
    if (!file || /\.txt$/i.test(file) || /propre au projet/i.test(rawLicense ?? '')) continue
    const attribution = rawAttribution?.match(/«\s*([^»]+?)\s*»/)?.[1]
    const kind = kindOf(file)
    out.push({ kind, file, title: titleOf(file, kind), author, license, source, attribution })
  }
  return out
}

export interface CreditGroup {
  kind: CreditKind
  /** Lignes affichées : « titre — auteur · licence » ou « auteur · licence » (sons regroupés). */
  lines: { main: string; sub: string }[]
}

const ORDER: CreditKind[] = ['music', 'voice', 'sfx', 'fonts', 'models', 'textures', 'other']

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
    } else {
      for (const e of list) {
        const key = `${e.title}|${e.author}`
        if (seen.has(key)) continue
        seen.add(key)
        // Une attribution imposée ou recommandée s'affiche telle quelle.
        if (e.attribution) lines.push({ main: e.attribution, sub: e.license })
        else lines.push({ main: e.title, sub: [e.author, e.license].filter(Boolean).join(' · ') })
      }
    }
    groups.push({ kind, lines })
  }
  return groups
}

export const CREDIT_GROUPS: CreditGroup[] = groupCredits(parseCredits(creditsMd))

/** Bibliothèques libres du jeu (licences MIT sauf mention). */
export const TECH_CREDITS: readonly string[] = [
  'three.js',
  'React · React Three Fiber · drei',
  'postprocessing · pmndrs',
  'zustand',
  'Tone.js',
  'Vite · TypeScript',
  'ws · qrcode',
  'Kyutai Pocket TTS (CC-BY 4.0)',
]
