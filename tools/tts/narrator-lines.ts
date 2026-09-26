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
import { KIND_SPECS, NARRATOR_LINES, lineHasColor, type NarratorKind } from '../../src/director/lines.ts'
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
// (« Rose mord la poussière », dit « Osmore », a été réécrit en vague 2)
const SAY_CLIP: Record<string, string> = {
  'fr/hiddenLong.9': 'Rôse reste à l\'abri. C\'est plus prudent.', // « Rose » seul en tête : « Orze », « Ours »
  'fr/huntStreak.0': 'Corail, chasse encore. Surveillez le ciel.', // « Corail chasse » : « Chasanto », « Shazam »
}

/**
 * Texte prononcé imposé pour un modèle entier (`<lang>/<lineId>`, avec `{color}`), mêmes mots que le
 * sous-titre à la ponctuation et à la graphie britannique près.
 */
const SAY_TPL: Record<string, string> = {
  // la virgule fait marquer une pause à Pocket : 3,0-3,3 s parlées au lieu de 2,4-2,7 (règle < 3 s)
  'en/doubleHit': 'Two birds one strike. {color} is hungry.',
  // sous-titre en anglais britannique (« colour », comme l'interface) ; la voix, identique, est gardée
  'en/matchWin': '{color} wins. Remember that color.',
}

/**
 * Mots qui doivent être entendus par l'ASR dans une réplique précise (en plus du nom de couleur),
 * quand c'est le mot qui porte le sens et que Pocket l'a déjà mal dit.
 */
const LINE_KEYWORDS: Record<string, string[]> = {
  'fr/golden1': ['l’heure dorée'], // « Leur doré » : homophone, ramené à la même forme par gen.py
  'fr/greatShadow1': ['glace'], // l'ancien « elle fige tout » était entendu « elle fiche tout »
  'en/doubleHit': ['strike'], // glossaire EN : l'attaque se dit « strike »
}

/**
 * Condition N de `--asr-strict` (Whisper SANS la liste des couleurs) : le nom n'y est exigé que pour
 * les deux couleurs que les critiques ont entendues de travers (« La gomme » pour Lagon, « Saffron »,
 * « Le franc » pour Safran). Sans amorce, Whisper écrit « Corée » pour un « Corail » bien dit, « sa
 * forme » pour « Safran porte » : on n'exige alors que le reste de la phrase (CER).
 */
const HEARD_NP: Partial<Record<Lang, Record<number, string>>> = {
  fr: {
    1: 'Lagon|lagons|lagond|lagoon',
    3: 'Safran|saffran|safrant|saffron|safron',
  },
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

/**
 * Écart voix / fond (LU) de la condition « en contexte » (`gen.py --asr-strict C`), mesuré en partie
 * à 12 oiseaux (docs/polish/fix2-narrator.md) : en manche, 10ᵉ centile +6 LU (défaut de narrator.sh) ;
 * sur les écrans de résultats et au podium, la voix n'est jamais descendue sous +7,8 LU → +8.
 */
const QUIET_KINDS: ReadonlySet<NarratorKind> = new Set(['lastRound', 'matchWin', 'matchTie', 'rematch'])
const bedSnrOf = (kind: NarratorKind) => (KIND_SPECS[kind].scope === 'results' || QUIET_KINDS.has(kind) ? { asr_bed_snr: 8 } : {})

interface TtsLine {
  id: string
  lang: Lang
  text: string
  say?: string
  keywords?: string[]
  keywords_np?: string[]
  asr_bed_snr?: number
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

/** Une graphie imposée doit dire le même texte que le sous-titre, à la ponctuation et à « colour » près. */
function sameWords(a: string, b: string): boolean {
  const w = (s: string) =>
    forVoice(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '') // « Rôse » (graphie prononcée) = « Rose »
      .replace(/colour/g, 'color')
      .replace(/[^\p{L}' ]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
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
      const lineKw = LINE_KEYWORDS[`${lang}/${def.id}`] ?? []
      const sayTpl = SAY_TPL[`${lang}/${def.id}`] ?? tpl
      if (SAY_TPL[`${lang}/${def.id}`] && !sameWords(sayTpl, tpl)) errors.push(`${lang}/${key}: SAY_TPL ne dit plus le texte`)
      if (!withColor) {
        const say = forVoice(sayTpl)
        lines.push({
          id: def.id,
          lang,
          text: tpl,
          ...(say !== tpl ? { say } : {}),
          ...(lineKw.length ? { keywords: lineKw, asr_prompt: ASR_PROMPT[lang] } : {}),
          ...bedSnrOf(def.kind),
          ...seedOf(def.id),
        })
        continue
      }
      for (const color of PLAYER_COLORS) {
        const name = color.name[lang]
        const spoken = SAY[lang]?.[color.index] ?? name
        const text = tpl.replace('{color}', name)
        const id = `${def.id}.${color.index}`
        const say = SAY_CLIP[`${lang}/${id}`] ?? forVoice(sayTpl.replace('{color}', spoken))
        if (SAY_CLIP[`${lang}/${id}`] && !sameWords(SAY_CLIP[`${lang}/${id}`], text.replace(name, spoken))) {
          errors.push(`${lang}/${id}: la graphie imposée ne dit plus le texte (« ${text} »)`)
        }
        const np = HEARD_NP[lang]?.[color.index]
        lines.push({
          id,
          lang,
          text,
          ...(say !== text ? { say } : {}),
          keywords: [HEARD[lang][color.index] ?? name, ...lineKw],
          keywords_np: [...(np ? [np] : []), ...lineKw],
          ...bedSnrOf(def.kind),
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
