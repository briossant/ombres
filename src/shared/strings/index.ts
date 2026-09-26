// Registre des tables de chaînes. Chaque domaine a son fichier, possédé par un seul module.
import { common } from './common.ts'
import { phone } from './phone.ts'
import { host } from './host.ts'
import { hints } from './hints.ts'
import { narrator } from './narrator.ts'
import { titles } from './titles.ts'
import { runner } from './runner.ts'

export interface StringTable {
  fr: Record<string, string>
  en: Record<string, string>
}

export const STRING_TABLES: StringTable[] = [common, phone, host, hints, narrator, titles, runner]
