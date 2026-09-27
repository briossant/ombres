// Variantes compilées du shader d'encre selon le preset (vérificateur AA) : Medium seul reconstruit depuis un
// G-buffer plus petit (INK_SCALED), Ultra seul voit les traits de plus de 2 px (INK_WIDE) ; Low et High gardent
// le shader de base (ils ne paient aucune des deux variantes).
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { QUALITY_PRESETS, type QualityLevel } from '../quality.ts'
import { createGBuffer } from './gbuffer.ts'
import { InkEffect } from './InkEffect.ts'

const defines = (level: QualityLevel) => {
  const fs = new InkEffect(createGBuffer(), new THREE.PerspectiveCamera(), QUALITY_PRESETS[level]).getFragmentShader() ?? ''
  return { scaled: fs.includes('#define INK_SCALED'), wide: fs.includes('#define INK_WIDE') }
}

describe('InkEffect : variantes par preset', () => {
  it('Low et High : shader de base', () => {
    expect(defines('low')).toEqual({ scaled: false, wide: false })
    expect(defines('high')).toEqual({ scaled: false, wide: false })
  })
  it('Medium : reconstruction depuis le G-buffer 900p seulement', () => {
    expect(defines('medium')).toEqual({ scaled: true, wide: false })
  })
  it('Ultra : traits larges (2160p) seulement', () => {
    expect(defines('ultra')).toEqual({ scaled: false, wide: true })
  })
})
