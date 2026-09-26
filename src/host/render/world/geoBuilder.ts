// Petit constructeur de géométrie indexée avec les attributs des tours et du décor.
//   position, normal (monde)
//   tloc  vec4 : position relative à l'axe de la tour (xyz) + rayon de profil (w)
//   albedo vec3 : albédo OKLab
//   tdeco vec4 : (décalage d'ID, mode de décor, graine, cavité AO)
//   tzone vec2 : zone de fenêtres (z0, z1) ou paramètres du décor (fanion : u, amplitude)
import * as THREE from 'three'
import type { Vec3 } from '../npr/oklab.ts'

export const DECO = {
  plain: 0,
  windows: 1,
  ribs: 2,
  flutes: 3,
  underside: 4,
  skirt: 5,
  flag: 6,
  ink: 7,
  bands: 8,
  /** Dessus de disque : panneaux d'ombrelle alternés, coutures et cercle d'encre. */
  panels: 9,
} as const

export interface VertexAttrs {
  loc: [number, number, number, number]
  albedo: Readonly<Vec3>
  /** (id, mode, graine, cavité) */
  deco: [number, number, number, number]
  zone: [number, number]
}

export class GeoBuilder {
  private pos: number[] = []
  private nrm: number[] = []
  private loc: number[] = []
  private alb: number[] = []
  private deco: number[] = []
  private zone: number[] = []
  private idx: number[] = []

  get vertexCount(): number {
    return this.pos.length / 3
  }

  vertex(p: Readonly<Vec3>, n: Readonly<Vec3>, a: VertexAttrs): number {
    this.pos.push(p[0], p[1], p[2])
    this.nrm.push(n[0], n[1], n[2])
    this.loc.push(a.loc[0], a.loc[1], a.loc[2], a.loc[3])
    this.alb.push(a.albedo[0], a.albedo[1], a.albedo[2])
    this.deco.push(a.deco[0], a.deco[1], a.deco[2], a.deco[3])
    this.zone.push(a.zone[0], a.zone[1])
    return this.vertexCount - 1
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c)
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d)
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('tloc', new THREE.Float32BufferAttribute(this.loc, 4))
    g.setAttribute('albedo', new THREE.Float32BufferAttribute(this.alb, 3))
    g.setAttribute('tdeco', new THREE.Float32BufferAttribute(this.deco, 4))
    g.setAttribute('tzone', new THREE.Float32BufferAttribute(this.zone, 2))
    g.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}
