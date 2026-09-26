// Surveillance de la qualité : descente d'un cran seulement si l'affichage ne tient pas.
import { describe, expect, it } from 'vitest'
import { QualityMonitor } from './quality.ts'

const feed = (m: QualityMonitor, f: (i: number) => number) => {
  for (let i = 0; i < 120; i++) m.push(f(i))
}

describe('QualityMonitor', () => {
  it('60 i/s constants sur un écran 60 Hz : on garde le preset (16,7 ms > 15 ms)', () => {
    const m = new QualityMonitor()
    feed(m, () => 16.67)
    expect(m.shouldDowngrade('high')).toBeNull()
  })
  it('quelques images perdues (8 %) : on garde', () => {
    const m = new QualityMonitor()
    feed(m, i => (i % 12 === 0 ? 33.3 : 16.67))
    expect(m.shouldDowngrade('high')).toBeNull()
  })
  it('une image sur trois perdue à 60 Hz : on descend', () => {
    const m = new QualityMonitor()
    feed(m, i => (i % 3 === 0 ? 33.3 : 16.67))
    expect(m.shouldDowngrade('high')).toBe('medium')
  })
  it('30 i/s constants : on descend (33 ms ne passe pas pour un écran 30 Hz)', () => {
    const m = new QualityMonitor()
    feed(m, () => 33.3)
    expect(m.shouldDowngrade('medium')).toBe('low')
  })
  it('écran 144 Hz à 90 i/s : on garde ; à 50 i/s : on descend', () => {
    const a = new QualityMonitor()
    feed(a, i => (i % 3 === 0 ? 6.9 : 13.9))
    expect(a.shouldDowngrade('high')).toBeNull()
    const b = new QualityMonitor()
    feed(b, () => 20)
    expect(b.shouldDowngrade('high')).toBe('medium')
  })
  it('déjà au plus bas : rien', () => {
    const m = new QualityMonitor()
    feed(m, () => 40)
    expect(m.shouldDowngrade('low')).toBeNull()
  })
})
