// Garde-fou d'architecture : la simulation et les bots sont du TypeScript pur,
// exécutables dans Node (tests, parties headless) comme dans le navigateur.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RULES = [
  { dir: 'src/sim', forbid: [/from ['"](react|react-dom|three|@react-three\/[^'"]+|postprocessing|zustand)['"]/, /\b(window|document|localStorage|requestAnimationFrame)\./, /from ['"]\.\.\/(host|phone|net|input)\//] },
  { dir: 'src/bots', forbid: [/from ['"](react|react-dom|three|@react-three\/[^'"]+|postprocessing|zustand)['"]/, /\b(window|document|localStorage)\./, /from ['"]\.\.\/(host|phone|net)\//] },
  { dir: 'src/phone', forbid: [/from ['"](three|@react-three\/[^'"]+|postprocessing)['"]/, /from ['"]\.\.\/(host|sim|bots)\//] },
]

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p
  }
}

let bad = 0
for (const { dir, forbid } of RULES) {
  let files
  try { files = [...walk(dir)] } catch { continue }
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (line.trim().startsWith('//')) return
      for (const re of forbid) if (re.test(line)) { console.error(`${f}:${i + 1}: import interdit (${re}) → ${line.trim()}`); bad++ }
    })
  }
}
if (bad) { console.error(`${bad} violation(s) de frontière`); process.exit(1) }
console.log('Frontières OK')
