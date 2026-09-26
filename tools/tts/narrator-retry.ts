// Après un lot : retire les clips que la vérification ASR a refusés (asr_ok: false) en leur
// donnant une nouvelle graine (+1000), écrite dans tools/tts/narrator.seeds.json.
// Le lot suivant (tools/tts/narrator.sh) ne régénère que ces clips (la graine fait partie du hash).
//   pnpm tsx tools/tts/narrator-retry.ts            → met à jour les graines, liste les clips
//   pnpm tsx tools/tts/narrator-retry.ts --dry-run  → liste seulement
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MANIFEST = join(HERE, 'narrator.manifest.json') // manifest complet (notes ASR)
const SEEDS_FILE = join(HERE, 'narrator.seeds.json')
const BASE_SEED = 1234 // graine du preset « narrator » (voices.json)
const STEP = 1000 // au-delà des graines des prises (seed + 101·k, k < 6)

interface Entry {
  id: string
  lang: string
  seed?: number
  asr_ok?: boolean
  asr_text?: string
  text: string
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { lines: Entry[] }
const seeds: Record<string, number> = existsSync(SEEDS_FILE) ? JSON.parse(readFileSync(SEEDS_FILE, 'utf8')) : {}
const bad = manifest.lines.filter(e => e.asr_ok === false)
for (const e of bad) {
  const key = `${e.lang}/${e.id}`
  seeds[key] = (seeds[key] ?? BASE_SEED) + STEP
  console.log(`${key}  « ${e.asr_text} »  (attendu : ${e.text}) → graine ${seeds[key]}`)
}
if (!process.argv.includes('--dry-run') && bad.length) {
  const sorted = Object.fromEntries(Object.entries(seeds).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(SEEDS_FILE, JSON.stringify(sorted, null, 1) + '\n')
}
console.log(`${bad.length} clip(s) refusé(s) par l'ASR`)
