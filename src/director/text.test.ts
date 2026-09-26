import { describe, expect, it } from 'vitest'
import { RULES } from '../sim/rules.ts'
import { narrator } from '../shared/strings/narrator.ts'
import { hints } from '../shared/strings/hints.ts'
import { PLAYER_COLORS } from '../shared/players.ts'
import { HINT_IDS } from './hints.ts'
import { NARRATOR_LINES, lineHasColor } from './lines.ts'
import { indexNarratorManifest, type NarratorManifest } from './manifest.ts'
import { estimateDuration } from './narrator.ts'
import { narratorClipId, narratorClipPath, narratorText, narratorTextParts, subtitleSeconds } from './text.ts'

describe('textes du narrateur', () => {
  it('toutes les répliques existent en FR et en EN, avec {color} seulement quand il le faut', () => {
    for (const lang of ['fr', 'en'] as const) {
      for (const line of NARRATOR_LINES) {
        const s = narrator[lang][`narrator.${line.id}`]
        expect(s, `${lang}/${line.id}`).toBeTruthy()
        expect(s.includes('{color}'), `${lang}/${line.id}`).toBe(lineHasColor(line))
      }
    }
  })

  it('règles d’écriture : couleur nue, jamais en dernier mot, jamais « de / que {color} »', () => {
    for (const lang of ['fr', 'en'] as const) {
      for (const [key, s] of Object.entries(narrator[lang])) {
        expect(/\{color\}[’'s]*[.!?…\s]*$/.test(s), key).toBe(false)
        expect((s.match(/\{color\}/g) ?? []).length, key).toBeLessThanOrEqual(1)
        if (lang === 'fr') {
          expect(/\b(le|la|les|l[’']|du|des|au|aux|de|d[’']|que|qu[’'])\s*\{color\}/i.test(s), key).toBe(false)
        }
      }
    }
  })

  it('découpe le sous-titre autour du nom de couleur', () => {
    const cue = { key: 'narrator.leaderChange3', colorIndex: 8 }
    expect(narratorText(cue, 'fr')).toBe('Le désert passe à Sarcelle. Pour l’instant.')
    expect(narratorTextParts(cue, 'fr')).toEqual([
      { text: 'Le désert passe à ' },
      { text: 'Sarcelle', colorIndex: 8 },
      { text: '. Pour l’instant.' },
    ])
    expect(narratorText(cue, 'en')).toBe('The desert is Teal’s. For now.')
    expect(narratorTextParts({ key: 'narrator.tie' }, 'en')).toEqual([{ text: 'A tie. The desert refuses to choose.' }])
  })

  it('chemins des clips', () => {
    expect(narratorClipId('tie')).toBe('tie')
    expect(narratorClipId('leaderChange2', 0)).toBe('leaderChange2.0')
    expect(narratorClipPath({ lineId: 'leaderChange2', colorIndex: 11 }, 'en')).toBe('audio/narrator/en/leaderChange2.11.mp3')
  })

  it('durées : estimation plausible, sous-titre jamais plus court que la voix', () => {
    for (const line of NARRATOR_LINES) {
      const d = estimateDuration(line.id, lineHasColor(line) ? 2 : undefined)
      expect(d, line.id).toBeGreaterThan(1)
      expect(d, line.id).toBeLessThan(4.5)
    }
    const cue = { key: 'narrator.tie', duration: 2.8 }
    expect(subtitleSeconds(cue, true)).toBeCloseTo(Math.max(3.4, RULES.subtitleSeconds))
    expect(subtitleSeconds(cue, false, 'fr')).toBeGreaterThanOrEqual(1.8)
  })
})

describe('textes des indications', () => {
  it('les 10 indications et les libellés de boutons existent en FR et en EN', () => {
    expect(HINT_IDS.length).toBe(10)
    for (const lang of ['fr', 'en'] as const) {
      for (const id of HINT_IDS) expect(hints[lang][`hints.${id}`], `${lang}/${id}`).toBeTruthy()
      expect(hints[lang]['hints.btn.dive']).toBeTruthy()
      expect(hints[lang]['hints.btn.flap']).toBeTruthy()
    }
  })
})

describe('manifest', () => {
  const manifest: NarratorManifest = {
    generator: 'ombres-tts/1',
    format: { codec: 'mp3', sample_rate: 24000, channels: 1 },
    total_duration_s: 10,
    lines: [
      { id: 'tie', lang: 'fr', file: 'fr/tie.mp3', duration_s: 2.6 },
      { id: 'leaderChange1.3', lang: 'fr', file: 'fr/leaderChange1.3.mp3', duration_s: 2.9 },
      { id: 'leaderChange1.4', lang: 'fr', file: 'fr/leaderChange1.4.mp3', duration_s: 2.8 },
      { id: 'leaderChange1.3', lang: 'en', file: 'en/leaderChange1.3.mp3', duration_s: 2.7 },
    ],
  }
  const idx = indexNarratorManifest(manifest)

  it('durées et fichiers par langue et couleur', () => {
    expect(idx.duration('fr', 'tie')).toBe(2.6)
    expect(idx.duration('fr', 'leaderChange1', 3)).toBe(2.9)
    expect(idx.duration('en', 'leaderChange1', 3)).toBe(2.7)
    expect(idx.duration('en', 'tie')).toBeUndefined()
    expect(idx.file('fr', 'leaderChange1', 4)).toBe('fr/leaderChange1.4.mp3')
  })

  it('préchargement : neutres + seules couleurs présentes, dans une seule langue', () => {
    expect(idx.preload('fr', [3]).sort()).toEqual(['fr/leaderChange1.3.mp3', 'fr/tie.mp3'])
    expect(idx.preload('en', [3, 4])).toEqual(['en/leaderChange1.3.mp3'])
  })

  it('12 couleurs : un nom par langue', () => {
    expect(PLAYER_COLORS.length).toBe(12)
  })
})
