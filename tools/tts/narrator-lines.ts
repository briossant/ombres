// Construit l'entrée de tools/tts/tts.sh pour TOUTES les répliques du narrateur :
// modèles à couleur × 12 couleurs × FR/EN, plus les répliques neutres × FR/EN.
//
//   pnpm tsx tools/tts/narrator-lines.ts            → tools/tts/narrator.lines.json
//   pnpm tsx tools/tts/narrator-lines.ts --check    → vérifie les règles d'écriture, n'écrit rien
//
// Sources : catalogue src/director/lines.ts, textes src/shared/strings/narrator.ts,
// noms de couleur src/shared/players.ts. Les ids de sortie sont `<lineId>` (neutre) et
// `<lineId>.<colorIndex>` : le jeu lit public/audio/narrator/<lang>/<id>.mp3.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NARRATOR_LINES, lineHasColor } from '../../src/director/lines.ts'
import { narrator } from '../../src/shared/strings/narrator.ts'
import { PLAYER_COLORS } from '../../src/shared/players.ts'
import type { Lang } from '../../src/shared/protocol.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const LANGS: Lang[] = ['fr', 'en']

/**
 * Graphie PRONONCÉE d'un nom de couleur, quand Pocket TTS le dit mal (docs/research/tts.md §4.6).
 * Le sous-titre garde le vrai nom.
 */
const SAY: Partial<Record<Lang, Record<number, string>>> = {
  fr: { 5: 'Carmain' }, // sinon « Carmen »
}

/**
 * Texte prononcé imposé pour un clip précis (`<lang>/<id>`), quand un nom se soude au mot suivant :
 * une virgule sépare le nom sans changer le sous-titre.
 */
const SAY_CLIP: Record<string, string> = {
  'fr/miss.9': 'Rose, mord la poussière. On n\'a rien vu.', // « Rose mord » → « Osmore »
}

/**
 * Orthographes acceptées dans la transcription Whisper pour valider une prise (le nom doit être
 * entendu). Variantes = homophones que Whisper écrit autrement, pas des prononciations fautives.
 */
const HEARD: Record<Lang, Record<number, string>> = {
  fr: {
    0: 'Corail|coray|corraille|coraille|corai|coraye|korail',
    1: 'Lagon|lagons|lagond',
    2: 'Indigo|indigot|indigau',
    3: 'Safran|saffran|safrant',
    4: 'Azur|azure|azzur',
    5: 'Carmin|carmain|carmins|karmin',
    6: 'Prune|prunes|prun',
    7: 'Anis|aniss|annis|anice',
    8: 'Sarcelle|sarcel|sarsel|sarcell',
    9: 'Rose|roses|roz',
    10: 'Lilas|lila|lilla',
    11: 'Jade|jades|jad',
  },
  en: {
    0: 'Coral|corral|choral',
    1: 'Lagoon|lagune|lagoons',
    2: 'Indigo',
    3: 'Saffron|safran|saffran|safron',
    4: 'Azure|asyour|azur|azhur|ajure',
    5: 'Carmine|carmin|carmines',
    6: 'Plum|plumb|plums',
    7: 'Anise|anis|annis|anice|aniseed',
    8: 'Teal|teel|teals',
    9: 'Rose|roses|rows',
    10: 'Lilac|lilacs|lylac',
    11: 'Jade|jades',
  },
}

interface TtsLine {
  id: string
  lang: Lang
  text: string
  say?: string
  keywords?: string[]
  asr_prompt?: string
  seed?: number
}

/**
 * Vocabulaire soufflé à Whisper : les noms de couleur, pour qu'il les écrive correctement quand ils
 * sont bien dits (sans lui, « Corail » devient « Coray » ou « Corée »). Une prise mâchée reste mâchée.
 */
const ASR_PROMPT: Record<Lang, string> = {
  fr: `Le narrateur nomme les joueurs par leur couleur : ${PLAYER_COLORS.map(c => c.name.fr).join(', ')}.`,
  en: `The narrator calls the players by their colour: ${PLAYER_COLORS.map(c => c.name.en).join(', ')}.`,
}

/**
 * Graines imposées par clip (`<lang>/<id>` → graine), écrites par narrator-retry.ts pour retirer
 * les prises refusées par l'ASR. La graine fait partie du hash : le clip est régénéré.
 */
const SEEDS_FILE = join(HERE, 'narrator.seeds.json')
const SEEDS: Record<string, number> = existsSync(SEEDS_FILE) ? (JSON.parse(readFileSync(SEEDS_FILE, 'utf8')) as Record<string, number>) : {}

/** Texte envoyé au TTS : apostrophes droites, espaces normales. */
function forVoice(s: string): string {
  return s.replace(/[’‘]/g, "'").replace(/[  ]/g, ' ')
}

/** Règles d'écriture de GDD §16.2 et docs/research/tts.md §6, vérifiées sur le modèle brut. */
function lint(key: string, lang: Lang, tpl: string, withColor: boolean): string[] {
  const errs: string[] = []
  const n = (tpl.match(/\{color\}/g) ?? []).length
  if (withColor && n !== 1) errs.push(`${n} {color} au lieu d'un seul`)
  if (!withColor && n) errs.push('{color} dans une réplique neutre')
  if (/\{color\}[’'s]*[.!?…\s]*$/.test(tpl)) errs.push('la couleur est le dernier mot')
  if (lang === 'fr') {
    if (/\b(le|la|les|l[’']|du|des|au|aux)\s*\{color\}/i.test(tpl)) errs.push('article devant {color}')
    if (/\b(de|d[’']|que|qu[’'])\s*\{color\}/i.test(tpl)) errs.push('« de/que {color} » (élision)')
    if (/\{color\}\s+(est|était|sera|s’est|s'est)\b/i.test(tpl)) errs.push('accord possible (être) après {color}')
  }
  if (/\d/.test(tpl)) errs.push('chiffres : écrire les nombres en lettres')
  if (/[«»"()]/.test(tpl)) errs.push('guillemets ou parenthèses (le TTS les lit mal)')
  return errs.map(e => `${lang}/${key}: ${e}`)
}

/** Une graphie imposée doit dire le même texte que le sous-titre, à la ponctuation près. */
function sameWords(a: string, b: string): boolean {
  const w = (s: string) => forVoice(s).toLowerCase().replace(/[^\p{L}' ]/gu, ' ').replace(/\s+/g, ' ').trim()
  return w(a) === w(b)
}

function build(): { lines: TtsLine[]; errors: string[] } {
  const lines: TtsLine[] = []
  const errors: string[] = []
  for (const lang of LANGS) {
    const table = narrator[lang]
    for (const def of NARRATOR_LINES) {
      const key = `narrator.${def.id}`
      const tpl = table[key]
      if (!tpl) {
        errors.push(`${lang}/${key}: texte manquant`)
        continue
      }
      const withColor = lineHasColor(def)
      errors.push(...lint(key, lang, tpl, withColor))
      const seedOf = (id: string) => (SEEDS[`${lang}/${id}`] !== undefined ? { seed: SEEDS[`${lang}/${id}`] } : {})
      if (!withColor) {
        lines.push({ id: def.id, lang, text: tpl, ...(forVoice(tpl) !== tpl ? { say: forVoice(tpl) } : {}), ...seedOf(def.id) })
        continue
      }
      for (const color of PLAYER_COLORS) {
        const name = color.name[lang]
        const spoken = SAY[lang]?.[color.index] ?? name
        const text = tpl.replace('{color}', name)
        const id = `${def.id}.${color.index}`
        const say = SAY_CLIP[`${lang}/${id}`] ?? forVoice(tpl.replace('{color}', spoken))
        if (SAY_CLIP[`${lang}/${id}`] && !sameWords(SAY_CLIP[`${lang}/${id}`], text.replace(name, spoken))) {
          errors.push(`${lang}/${id}: la graphie imposée ne dit plus le texte (« ${text} »)`)
        }
        lines.push({
          id,
          lang,
          text,
          ...(say !== text ? { say } : {}),
          keywords: [HEARD[lang][color.index] ?? name],
          asr_prompt: ASR_PROMPT[lang],
          ...seedOf(id),
        })
      }
    }
    const orphan = Object.keys(table).filter(k => !NARRATOR_LINES.some(d => `narrator.${d.id}` === k))
    for (const k of orphan) errors.push(`${lang}/${k}: clé absente du catalogue src/director/lines.ts`)
  }
  return { lines, errors }
}

const { lines, errors } = build()
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
if (process.argv.includes('--check')) {
  console.log(`OK : ${lines.length} clips (${lines.filter(l => l.lang === 'fr').length} par langue)`)
} else {
  const out = join(HERE, 'narrator.lines.json')
  writeFileSync(out, JSON.stringify(lines, null, 0).replace(/\},\{/g, '},\n{') + '\n')
  console.log(`${out} : ${lines.length} clips`)
}
