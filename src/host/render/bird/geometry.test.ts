// Maillage procédural : dimensions, poids de skinning valides, normales orientées
// vers l'extérieur (sinon la coque d'encre et le terminateur s'inversent).
import { describe, expect, it } from 'vitest'
import { RULES } from '../../../sim/rules.ts'
import { buildBirdModel } from './geometry.ts'
import { BONE_NAMES } from './skeleton.ts'

describe('buildBirdModel', () => {
  for (const detail of ['far', 'high'] as const) {
    it(`produit un maillage propre (${detail})`, () => {
      const m = buildBirdModel(detail)
      const g = m.geometry
      const pos = g.getAttribute('position')
      const nrm = g.getAttribute('normal')
      const sw = g.getAttribute('skinWeight')
      const si = g.getAttribute('skinIndex')
      // Envergure = RULES.wingspan (± 2 %).
      g.computeBoundingBox()
      const span = g.boundingBox!.max.x - g.boundingBox!.min.x
      expect(Math.abs(span - RULES.wingspan) / RULES.wingspan).toBeLessThan(0.02)
      // Poids normalisés, os valides.
      for (let i = 0; i < pos.count; i++) {
        const s = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i)
        expect(Math.abs(s - 1)).toBeLessThan(1e-4)
        expect(si.getX(i)).toBeLessThan(BONE_NAMES.length)
      }
      // Normales globalement orientées vers l'extérieur : sur l'aile gauche, les
      // sommets du dessus (y au-dessus du bord d'attaque) ont des normales vers +y.
      let up = 0
      let down = 0
      for (let i = 0; i < pos.count; i++) {
        if (pos.getX(i) < 1.5 || pos.getX(i) > 4) continue
        const ny = nrm.getY(i)
        if (Math.abs(ny) < 0.8) continue
        if (ny > 0) up++
        else down++
      }
      expect(up).toBeGreaterThan(0)
      expect(down).toBeGreaterThan(0)
      // Le « far » reste léger (distance de jeu).
      if (detail === 'far') expect(g.index!.count / 3).toBeLessThan(2500)
    })
  }
})
