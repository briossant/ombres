// Préparation des tours en tâche de fond (polish tech, vague 2) : même géométrie qu'une construction
// d'un bloc, prise une seule fois, et seulement pour le même tableau de tours.
import type * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { getMap } from '../../../sim/maps.ts'
import { prepareTowers, takeTowers } from './prebuild.ts'
import { buildTowerGeometries, buildTowerGeometriesSteps } from './towerGeometry.ts'

function sameGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry): void {
  expect(Object.keys(a.attributes).sort()).toEqual(Object.keys(b.attributes).sort())
  for (const k of Object.keys(a.attributes)) expect(Array.from(a.getAttribute(k).array)).toEqual(Array.from(b.getAttribute(k).array))
  expect(Array.from(a.index!.array)).toEqual(Array.from(b.index!.array))
}

describe('prebuild des tours', () => {
  it('la construction découpée donne exactement la même géométrie', () => {
    const towers = getMap('cadran', 6).towers
    const whole = buildTowerGeometries(towers)
    const steps = buildTowerGeometriesSteps(towers)
    let n = 0
    let r = steps.next()
    while (!r.done) {
      n++
      r = steps.next()
    }
    expect(n).toBeGreaterThan(towers.filter(t => t.segments.length > 0).length)
    sameGeometry(r.value.body, whole.body)
    sameGeometry(r.value.decor, whole.decor)
  })

  it('takeTowers : seulement le tableau préparé, une seule fois, même inachevé', () => {
    const a = getMap('parasols', 6).towers
    const b = getMap('parasols', 6).towers // même carte, autre tableau
    prepareTowers(a)
    expect(takeTowers(b)).toBeNull()
    const g = takeTowers(a) // préparation pas encore commencée (pas de temps mort en test) : terminée sur place
    expect(g).not.toBeNull()
    sameGeometry(g!.body, buildTowerGeometries(a).body)
    expect(takeTowers(a)).toBeNull()
  })
})
