// Tests unitaires de la couche UI qui ne dépendent pas du DOM : mise en forme,
// crédits, glyphes, dérivation du HUD depuis les événements de simulation.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Emitter } from '../bus.ts'
import type { SimEvent } from '../../sim/types.ts'
import { RULES } from '../../sim/rules.ts'
import { fmtPct, ordinal, sentenceLines, titleStat } from './format.ts'
import { parseCredits, groupCredits } from './credits.ts'
import { GLYPH_INNER, GLYPH_KEYS, glyphKeyForColor } from './glyphShapes.ts'
import { PLAYER_COLORS } from '../../shared/players.ts'
import { connectHudEvents, pushToast, resetHud, showBanner, showSubtitle, useHud } from './viewModel.ts'
import { t, hasKey } from '../../shared/i18n.ts'
import { host } from '../../shared/strings/host.ts'
import { titles } from '../../shared/strings/titles.ts'

describe('mise en forme', () => {
  it('pourcentages localisés', () => {
    expect(fmtPct(0.234, 1, 'fr')).toBe('23,4 %')
    expect(fmtPct(0.234, 1, 'en')).toBe('23.4%')
  })
  it('ordinaux', () => {
    expect(ordinal(1, 'fr')).toBe('1er')
    expect(ordinal(2, 'fr')).toBe('2e')
    expect(ordinal(1, 'en')).toBe('1st')
    expect(ordinal(12, 'en')).toBe('12th')
    expect(ordinal(23, 'en')).toBe('23rd')
  })
  it('cartes des règles en deux lignes équilibrées', () => {
    expect(sentenceLines('Bas : fort. Haut : grand. Le fort gagne.')).toEqual(['Bas : fort. Haut : grand.', 'Le fort gagne.'])
    expect(sentenceLines('Ton ombre peint le sable.')).toEqual(['Ton ombre peint le sable.'])
  })
  it('chiffre des titres avec unité', () => {
    expect(titleStat('rapace', 5, 'fr')).toBe('5 piqués réussis')
    expect(titleStat('pilleur', 0.112, 'en')).toBe('11.2% of the desert taken from others')
    expect(titleStat('lezard', 19, 'fr')).toBe('19 s à l’ombre des tours')
  })
})

describe('chaînes', () => {
  it('host et titles ont les mêmes clés en FR et en EN', () => {
    for (const table of [host, titles]) expect(Object.keys(table.en).sort()).toEqual(Object.keys(table.fr).sort())
  })
  it('les clés utilisées par le HUD existent', () => {
    for (const k of ['host.phase.golden', 'host.phaseHint.greatShadow', 'host.countdown.go', 'titles.revenant.stat']) expect(hasKey(k)).toBe(true)
    expect(t('host.round.ready', { n: 2, total: 3 }, 'fr')).toBe('2/3 prêts')
  })
  it('aucun article devant {name} dans les toasts FR (GDD §16.2)', () => {
    for (const [k, v] of Object.entries(host.fr)) if (k.startsWith('host.toast.')) expect(v).not.toMatch(/\b(le|la|l’|l')\s*\{name\}/i)
  })
})

describe('crédits', () => {
  const md = `## a
| Fichier servi | Source | Auteur | Licence | Attribution requise |
|---|---|---|---|---|
| \`fonts/julius-sans-one-400-latin.woff2\` | https://x | Luciano Vergara | SIL OFL 1.1 (\`fonts/OFL.txt\`) | non |
| \`fonts/OFL-juliussansone.txt\` | x | y | OFL | non |
| \`audio/music/dizzycrow_negev_desert_loop.ogg\` | https://oga | dizzycrow | CC-BY 4.0 | oui |
| \`audio/sfx/wind__fs1.ogg\` | x | anebulafont | CC0 1.0 | non |
| \`audio/sfx/wing__fs2.ogg\` | x | anebulafont | CC0 1.0 | non |
| \`audio/narrator/fr/*.mp3\` | x | Kyutai | **CC-BY 4.0** (code MIT) | **oui** : « Voix synthétisée avec Pocket TTS de Kyutai (CC BY 4.0) » |
| \`ui/glyphs/*.svg\` | x | Claude (Anthropic) | propre au projet | — |`
  it('lit, classe, nettoie et regroupe', () => {
    const e = parseCredits(md)
    expect(e.map(x => x.kind)).toEqual(['fonts', 'music', 'sfx', 'sfx', 'voice'])
    expect(e[0].title).toBe('Julius Sans One')
    expect(e[0].license).toBe('SIL OFL 1.1')
    expect(e[1].title).toBe('Dizzycrow negev desert loop')
    const g = groupCredits(e)
    expect(g.find(x => x.kind === 'sfx')?.lines).toEqual([{ main: 'anebulafont', sub: 'CC0 1.0' }])
    expect(g.find(x => x.kind === 'voice')?.lines[0]).toEqual({ main: 'Voix synthétisée avec Pocket TTS de Kyutai (CC BY 4.0)', sub: 'CC-BY 4.0' })
  })
})

describe('glyphes', () => {
  it('un glyphe par couleur, dans l’ordre de la palette', () => {
    expect(GLYPH_KEYS.length).toBe(12)
    PLAYER_COLORS.forEach((c, i) => expect(glyphKeyForColor(i)).toBe(c.glyph))
    for (const k of GLYPH_KEYS) expect(GLYPH_INNER[k]).toContain('currentColor')
  })
})

describe('HUD dérivé des événements', () => {
  afterEach(() => vi.useRealTimers())
  it('compte à rebours, bannière de phase avec expiration, dernières secondes', () => {
    vi.useFakeTimers()
    resetHud(1, 3, false)
    const bus = new Emitter<SimEvent>()
    const off = connectHudEvents(bus)
    bus.emit({ type: 'countdown', n: 3 })
    expect(useHud.getState().countdown).toBe(3)
    bus.emit({ type: 'countdown', n: 0 })
    vi.advanceTimersByTime(1000)
    expect(useHud.getState().countdown).toBeNull()
    bus.emit({ type: 'phase', phase: 'golden' })
    expect(useHud.getState().banner?.key).toBe('host.phase.golden')
    vi.advanceTimersByTime((RULES.phaseBannerSeconds + 2) * 1000)
    expect(useHud.getState().banner).toBeNull()
    bus.emit({ type: 'lastSeconds', n: 5 })
    expect(useHud.getState().lastSeconds).toBe(5)
    bus.emit({ type: 'night' })
    expect(useHud.getState().lastSeconds).toBeNull()
    bus.emit({ type: 'crown', slot: 2, prev: -1 })
    expect(useHud.getState().crownSlot).toBe(2)
    off()
  })
  it('sous-titres et toasts expirent', () => {
    vi.useFakeTimers()
    showSubtitle({ key: 'narrator.x', colorIndex: 3 })
    expect(useHud.getState().subtitle?.colorIndex).toBe(3)
    vi.advanceTimersByTime(RULES.subtitleSeconds * 1000 + 10)
    expect(useHud.getState().subtitle).toBeNull()
    pushToast('host.toast.joined', { params: { name: 'Léa' } })
    expect(useHud.getState().toasts.length).toBe(1)
    vi.advanceTimersByTime(5000)
    expect(useHud.getState().toasts.length).toBe(0)
    showBanner('host.banner.lastRound', { tone: 'alert', seconds: 1 })
    expect(useHud.getState().banner?.tone).toBe('alert')
  })
})
