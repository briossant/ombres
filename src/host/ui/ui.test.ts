// Tests unitaires de la couche UI qui ne dépendent pas du DOM : mise en forme,
// crédits, glyphes, dérivation du HUD depuis les événements de simulation.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Emitter } from '../bus.ts'
import type { SimEvent } from '../../sim/types.ts'
import { RULES } from '../../sim/rules.ts'
import { fmtPct, ordinal, sentenceLines, titleStat } from './format.ts'
import { groupCredits, localizeCreditLine, normalizeLicense, parseCredits } from './credits.ts'
import { GLYPH_INNER, GLYPH_KEYS, glyphKeyForColor } from './glyphShapes.ts'
import { PLAYER_COLORS } from '../../shared/players.ts'
import { connectHudEvents, HINT_MAX_BUBBLES, pushToast, resetHud, showBanner, showHint, showSubtitle, useHud } from './viewModel.ts'
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
    expect(g.find(x => x.kind === 'voice')?.lines[0]).toEqual({ main: 'Voix synthétisée avec Pocket TTS de Kyutai (CC BY 4.0)', sub: 'CC BY 4.0' })
    expect(localizeCreditLine(g.find(x => x.kind === 'voice')!.lines[0]!, 'en').main).toBe(t('host.credits.voice.tts', undefined, 'en'))
  })
  it('licences uniformes, échantillons regroupés par instrument', () => {
    expect(normalizeLicense('poids du modèle CC-BY 4.0')).toBe('CC BY 4.0')
    expect(normalizeLicense('CC0')).toBe('CC0 1.0')
    const e = parseCredits(`| a | b | c | d | e |
|---|---|---|---|---|
| \`audio/music/samples/oud_A2.ogg\` | x (« a2.wav ») | hammondman | CC0 1.0 | non |
| \`audio/music/samples/oud_C3.ogg\` | y (« c3.wav ») | hammondman | CC0 1.0 | non |
| \`audio/music/samples/tongue_A3.ogg\` | z | tosha73 | CC0 1.0 | non |`)
    expect(groupCredits(e).find(x => x.kind === 'samples')?.lines).toEqual([
      { main: 'Oud', sub: 'hammondman · CC0 1.0' },
      { main: 'Tongue drum', sub: 'tosha73 · CC0 1.0' },
    ])
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
  it('Grande Ombre : bandeau fin, 2,5 s au plus, flèche vers l’est', () => {
    vi.useFakeTimers()
    resetHud(1, 3, false)
    const bus = new Emitter<SimEvent>()
    const off = connectHudEvents(bus)
    bus.emit({ type: 'phase', phase: 'greatShadow' })
    const b = useHud.getState().banner
    expect(b?.layout).toBe('strip')
    expect(b?.arrow).toBe('east')
    vi.advanceTimersByTime(2500 + 10)
    expect(useHud.getState().banner).toBeNull()
    bus.emit({ type: 'phase', phase: 'golden' })
    expect(useHud.getState().banner?.arrow).toBe('northSouth')
    off()
  })
})

describe('bulles d’indication', () => {
  afterEach(() => vi.useRealTimers())
  const fake = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  it('même texte : une seule bulle avec les jetons des joueurs concernés', () => {
    fake()
    resetHud(1, 3, false)
    showHint(0, 'hints.holdDive')
    vi.advanceTimersByTime(800)
    showHint(3, 'hints.holdDive')
    const hints = useHud.getState().hints
    expect(hints.length).toBe(1)
    expect(hints[0]!.slots).toEqual([0, 3])
    // paramètres différents = autre texte
    showHint(5, 'hints.firstLock', { color: 2 })
    expect(useHud.getState().hints.length).toBe(2)
    // paramètres différents mais inutilisés par la phrase (touches du clavier) : même texte, même bulle
    resetHud(1, 3, false)
    showHint(1, 'hints.towerShade', { dive: 'Espace', flap: 'Maj' })
    showHint(2, 'hints.towerShade', { dive: 'PLONGER', flap: 'COUP D’AILE' })
    expect(useHud.getState().hints.map(h => h.slots)).toEqual([[1, 2]])
  })
  it(`au plus ${HINT_MAX_BUBBLES} bulles ; la plus ancienne cède sa place une fois lue`, () => {
    fake()
    resetHud(1, 3, false)
    showHint(1, 'hints.holdDive')
    showHint(2, 'hints.towerShade')
    showHint(4, 'hints.releaseClimb')
    expect(useHud.getState().hints.map(h => h.slot)).toEqual([1, 2])
    vi.advanceTimersByTime(1300)
    showHint(4, 'hints.releaseClimb')
    expect(useHud.getState().hints.map(h => h.slot)).toEqual([2, 4])
    vi.advanceTimersByTime(4600)
    expect(useHud.getState().hints.length).toBe(0)
  })
  it('la bulle d’esquive disparaît quand le piqué est résolu', () => {
    fake()
    resetHud(1, 3, false)
    const bus = new Emitter<SimEvent>()
    const off = connectHudEvents(bus)
    showHint(6, 'hints.dodge')
    showHint(7, 'hints.holdDive')
    bus.emit({ type: 'diveCancel', hunter: 1, target: 6, reason: 'feint' })
    expect(useHud.getState().hints.map(h => h.slot)).toEqual([7])
    showHint(6, 'hints.dodge')
    bus.emit({ type: 'diveMiss', hunter: 1, target: 6, dodged: true, x: 0, y: 0 })
    expect(useHud.getState().hints.map(h => h.key)).toEqual(['hints.holdDive'])
    off()
  })
})
