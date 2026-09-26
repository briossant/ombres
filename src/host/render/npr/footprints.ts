// Empreintes d'ombre des oiseaux (ART_BIBLE §5.3, GDD §6.1).
//
// L'empreinte est l'ellipse EXACTE de gameplay (`BirdState.shadow` de la sim :
// centre, r en travers, r·S le long des ombres). On la dessine directement dans
// la height map comme un disque au sol, à une hauteur factice (0,6 m fort,
// 0,5 m pâle) : elle n'ombre donc que le sable ; l'âme de l'oiseau (sa vraie
// silhouette, plus haute) l'emporte là où elle existe ; les ombres de tours, plus
// hautes encore, l'effacent (l'oiseau disparaît dans l'ombre d'une tour). Le fort
// l'emporte sur le pâle là où deux empreintes se chevauchent.
//
// Le matériau du sol lit ensuite type/propriétaire/force pour l'aplat teinté
// (opacité 0,70 / 0,35) et le liseré couleur joueur (continu / pointillé).
import * as THREE from 'three'
import type { BirdState, SimState } from '../../../sim/types.ts'
import { CASTER_TYPE, shadowCasters, type CasterHandle } from './shadowMap.ts'
import { NPR } from './uniforms.ts'

const MAX_BIRDS = 12
export const FOOTPRINT_OPACITY = { strong: 0.7, pale: 0.35 } as const
const FAKE_H = { strong: 0.6, pale: 0.5 } as const

interface Slot {
  obj: THREE.Mesh
  handle: CasterHandle
}

/** Données minimales d'une empreinte (repère SIM : x est, y nord). */
export interface FootprintInput {
  slot: number
  cx: number
  cy: number
  r: number
  rAlong: number
  strong: boolean
  paints: boolean
}

export class BirdFootprints {
  private readonly slots: Slot[] = []
  private readonly geometry = new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2)

  constructor() {
    for (let i = 0; i < MAX_BIRDS; i++) {
      const obj = new THREE.Mesh(this.geometry)
      obj.matrixAutoUpdate = false
      obj.visible = false
      const handle = shadowCasters.add(obj, { owner: i + 1, fakeHeight: FAKE_H.pale, type: CASTER_TYPE.footprint, followVisibility: true })
      this.slots.push({ obj, handle })
    }
  }

  /**
   * Place les empreintes. `shadowDirX/Y` : direction des ombres (sim). Les oiseaux
   * absents sont masqués. Aucune allocation.
   */
  update(inputs: ReadonlyArray<FootprintInput>, count: number, shadowDirX: number, shadowDirY: number): void {
    for (const s of this.slots) s.obj.visible = false
    const theta = Math.atan2(shadowDirY, shadowDirX)
    const c = Math.cos(theta)
    const sn = Math.sin(theta)
    // axe et ellipses exposés au sol (tirets du liseré pâle, polish W11)
    NPR.uFpDir.value.set(c, -sn)
    const ell = NPR.uFpEllipse.value
    for (let i = 0; i < count; i++) {
      const f = inputs[i]!
      const s = this.slots[f.slot]
      if (!s) continue
      // Rotation autour de Y : x local -> (cos θ, 0, −sin θ) = direction des ombres en xz three.
      const e = s.obj.matrix.elements
      const ax = f.rAlong
      const az = f.r
      e[0] = c * ax
      e[1] = 0
      e[2] = -sn * ax
      e[3] = 0
      e[4] = 0
      e[5] = 1
      e[6] = 0
      e[7] = 0
      e[8] = sn * az
      e[9] = 0
      e[10] = c * az
      e[11] = 0
      e[12] = f.cx
      e[13] = 0
      e[14] = -f.cy
      e[15] = 1
      s.obj.matrixWorld.copy(s.obj.matrix)
      s.obj.visible = true
      ell[f.slot + 1]?.set(f.cx, -f.cy, f.rAlong, f.r)
      s.handle.setOwner(f.slot + 1)
      s.handle.setStrength(f.strong ? FOOTPRINT_OPACITY.strong : FOOTPRINT_OPACITY.pale)
      s.handle.setFakeHeight(f.strong ? FAKE_H.strong : FAKE_H.pale)
      s.handle.setType(f.paints ? CASTER_TYPE.footprint : CASTER_TYPE.footprintIdle)
    }
  }

  private readonly scratch: FootprintInput[] = Array.from({ length: MAX_BIRDS }, () => ({
    slot: 0,
    cx: 0,
    cy: 0,
    r: 1,
    rAlong: 1,
    strong: false,
    paints: false,
  }))

  /** Depuis l'état de sim, interpolé entre le tick précédent et le courant (alpha). */
  updateFromSim(sim: SimState, prevBirds: ReadonlyArray<BirdState | undefined>, alpha: number): void {
    let n = 0
    for (const b of sim.birds) {
      if (n >= MAX_BIRDS) break
      const p = prevBirds[b.slot]?.shadow ?? b.shadow
      const s = b.shadow
      const o = this.scratch[n++]!
      o.slot = b.slot
      o.cx = p.cx + (s.cx - p.cx) * alpha
      o.cy = p.cy + (s.cy - p.cy) * alpha
      o.r = p.r + (s.r - p.r) * alpha
      o.rAlong = p.rAlong + (s.rAlong - p.rAlong) * alpha
      o.strong = s.strong
      o.paints = s.paints
    }
    this.update(this.scratch, n, sim.sun.shadowDirX, sim.sun.shadowDirY)
  }

  dispose(): void {
    for (const s of this.slots) s.handle.dispose()
    this.geometry.dispose()
  }
}
