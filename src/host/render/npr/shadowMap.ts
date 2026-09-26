// Height shadow map en espace sol (NPR §4.5, ART_BIBLE §5) et registre des casters.
//
// Chaque sommet de caster est projeté le long du rayon solaire sur le sol (y = 0) ;
// on écrit sa hauteur, et le depth test garde la plus haute. Un point P est à
// l'ombre si hmax(p0(P)) > P.y + biais. Résolution au sol constante quelle que
// soit l'élévation : des bouts d'ombre nets à 270 m.
//
// Les casters vivent dans une scène séparée : des proxies qui partagent la
// géométrie et la matrixWorld (par référence) des maillages visibles. Appeler
// scene.updateMatrixWorld() AVANT render() (fait par NprPipeline).
import * as THREE from 'three'
import type { VertexDeform } from './material.ts'
import { NPR_VERTEX_HEADER, NPR_VERTEX_TRANSFORM } from './material.ts'
import { NPR } from './uniforms.ts'

/** Type écrit dans le canal A de la height map. */
export const CASTER_TYPE = { solid: 1, footprint: 2, footprintIdle: 3 } as const

export interface CasterOptions {
  /** Code propriétaire : 0 = neutre (tours, décor), slot + 1 pour un oiseau (ombre teintée). */
  owner?: number
  /** Opacité de l'ombre : 1 pour les tours ; âme d'oiseau 1,0 (BAS) / 0,6 (HAUT). */
  strength?: number
  /** Déformation de sommets identique à celle du matériau visible (battement d'ailes…). */
  deform?: VertexDeform
  /**
   * Hauteur factice (m) écrite à la place de la hauteur réelle (≥ 0) : empreintes
   * d'oiseau (ART_BIBLE §5.3). Défaut : hauteur réelle.
   */
  fakeHeight?: number
  /** Type (canal A), défaut `solid`. */
  type?: number
}

export interface CasterHandle {
  readonly proxy: THREE.Mesh
  setStrength(v: number): void
  setOwner(code: number): void
  setType(type: number): void
  setFakeHeight(h: number): void
  /** Active/désactive le caster (ex. oiseau absent) indépendamment de la visibilité de la source. */
  setEnabled(on: boolean): void
  /** Retire le caster (à appeler au démontage du maillage). */
  dispose(): void
}

/** Zone couverte par la cascade en cours de rendu (partagée par tous les casters). */
const uCasterArea = { value: new THREE.Vector4(0, 0, 270, 400) }

const CASTER_FRAGMENT = /* glsl */ `
uniform float uOwner, uStrength, uType;
varying float vH;
void main(){ gl_FragColor = vec4(vH + 100.0, uOwner, uStrength, uType); }
`

function casterVertex(deform?: VertexDeform): string {
  return /* glsl */ `
${NPR_VERTEX_HEADER}
${deform?.pars ?? ''}
uniform vec3 uSunDir;
uniform vec4 uCasterArea;
uniform float uFakeH;
varying float vH;
void main(){
  vec3 transformed = vec3(position);
  vec3 objectNormal = vec3(normal);
  ${deform?.main ?? ''}
  ${NPR_VERTEX_TRANSFORM}
  vec3 wp = nprWorld.xyz;
  vec2 p0 = wp.xz - wp.y * uSunDir.xz / max(uSunDir.y, 0.035);   // projection oblique le long du rayon solaire
  vH = uFakeH >= 0.0 ? uFakeH : wp.y;
  float z = 1.0 - 2.0 * clamp((vH + 100.0) / uCasterArea.w, 0.0, 1.0); // plus haut = plus proche : le depth test garde le max
  gl_Position = vec4((p0 - uCasterArea.xy) / uCasterArea.z, z, 1.0);
}
`
}

/** Matériau caster (utile pour un proxy maison ; `shadowCasters.add` le crée pour vous). */
export function createCasterMaterial(opts: CasterOptions = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'npr.caster',
    side: THREE.DoubleSide,
    uniforms: {
      ...(opts.deform?.uniforms ?? {}),
      uSunDir: NPR.uSunDir,
      uCasterArea,
      uFakeH: { value: opts.fakeHeight ?? -1 },
      uOwner: { value: opts.owner ?? 0 },
      uStrength: { value: opts.strength ?? 1 },
      uType: { value: opts.type ?? CASTER_TYPE.solid },
    },
    vertexShader: casterVertex(opts.deform),
    fragmentShader: CASTER_FRAGMENT,
  })
}

type CasterSource = THREE.Mesh | THREE.SkinnedMesh | THREE.InstancedMesh

interface CasterEntry {
  source: CasterSource
  proxy: THREE.Mesh
  enabled: boolean
  /** Suivre la visibilité de la source (et de ses parents). */
  followVisibility: boolean
}

function visibleInWorld(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
}

class ShadowCasterRegistry {
  /** Scène des proxies (ne contient que des casters). */
  readonly scene = new THREE.Scene()
  private readonly entries = new Set<CasterEntry>()

  /**
   * Ajoute un caster qui suit `source` (même géométrie, même matrixWorld). Pour un
   * SkinnedMesh, le proxy est lié au même squelette ; pour un InstancedMesh, il
   * partage instanceMatrix et suit `count`. Le caster suit la visibilité de la
   * source (et de ses parents), sauf `followVisibility: false` (source invisible
   * qui ne sert qu'à l'ombre).
   */
  add(source: CasterSource, opts: CasterOptions & { followVisibility?: boolean } = {}): CasterHandle {
    const mat = createCasterMaterial(opts)
    let proxy: THREE.Mesh
    if ((source as THREE.SkinnedMesh).isSkinnedMesh) {
      const src = source as THREE.SkinnedMesh
      const sk = new THREE.SkinnedMesh(src.geometry, mat)
      sk.bind(src.skeleton, src.bindMatrix)
      sk.bindMode = src.bindMode
      // bindMatrix / bindMatrixInverse PARTAGÉES avec la source : en mode 'attached', la
      // source recalcule bindMatrixInverse dans son updateMatrixWorld (le proxy, lui, n'est
      // jamais mis à jour) ; sans ce partage, le caster serait transformé deux fois.
      sk.bindMatrix = src.bindMatrix
      sk.bindMatrixInverse = src.bindMatrixInverse
      proxy = sk
    } else if ((source as THREE.InstancedMesh).isInstancedMesh) {
      const src = source as THREE.InstancedMesh
      const im = new THREE.InstancedMesh(src.geometry, mat, src.count)
      im.instanceMatrix = src.instanceMatrix
      proxy = im
    } else {
      proxy = new THREE.Mesh(source.geometry, mat)
    }
    proxy.matrixAutoUpdate = false
    proxy.matrixWorldAutoUpdate = false
    proxy.frustumCulled = false
    proxy.matrixWorld = source.matrixWorld // référence partagée
    proxy.name = `caster:${source.name || source.uuid.slice(0, 8)}`
    this.scene.add(proxy)
    const entry: CasterEntry = { source, proxy, enabled: true, followVisibility: opts.followVisibility ?? true }
    this.entries.add(entry)
    const u = mat.uniforms as Record<'uOwner' | 'uStrength' | 'uType' | 'uFakeH', THREE.IUniform<number>>
    return {
      proxy,
      setStrength: (v) => void (u.uStrength.value = v),
      setOwner: (c) => void (u.uOwner.value = c),
      setType: (t) => void (u.uType.value = t),
      setFakeHeight: (h) => void (u.uFakeH.value = h),
      setEnabled: (on) => void (entry.enabled = on),
      dispose: () => {
        this.scene.remove(proxy)
        this.entries.delete(entry)
        mat.dispose()
      },
    }
  }

  /** Synchronise visibilité et `count` des proxies avant le rendu. */
  sync(): void {
    for (const e of this.entries) {
      e.proxy.visible = e.enabled && (!e.followVisibility || visibleInWorld(e.source))
      if ((e.source as THREE.InstancedMesh).isInstancedMesh) (e.proxy as THREE.InstancedMesh).count = (e.source as THREE.InstancedMesh).count
    }
  }

  get size(): number {
    return this.entries.size
  }
}

/** Registre global des casters : les modules (tours, oiseaux, décor) s'y inscrivent. */
export const shadowCasters = new ShadowCasterRegistry()

export interface ShadowAreas {
  /** Centre (x, z three) de la cascade proche et sa demi-taille (m). */
  cx: number
  cz: number
  half: number
  /** Demi-taille de la cascade lointaine (m), centrée au même point. */
  halfFar: number
  /**
   * Cascade « focus » (plans bas, caméra proche du sol) : petite zone devant la caméra
   * à très haute résolution, sinon les bords des longues ombres montrent l'escalier
   * des texels (0,25 m) près de l'objectif. Désactivée en vue de jeu.
   */
  focusOn: boolean
  fx: number
  fz: number
  focusHalf: number
  /** Cascade lointaine utile (soleil bas : les ombres sortent de la zone proche). */
  farOn: boolean
}

/**
 * Zones couvertes par les cascades (partagées) : le monde les règle selon l'arène
 * (proche : ±(max(a, b) + 90) m ; lointaine : ±1 100 m ; focus : devant une caméra basse).
 */
export const shadowAreas: ShadowAreas = { cx: 0, cz: 0, half: 270, halfFar: 1100, focusOn: false, fx: 0, fz: 0, focusHalf: 80, farOn: true }

/**
 * Les cibles de la height map (proche + lointaine + focus) et leur rendu.
 * Branche automatiquement les uniforms partagés NPR.uShadowMap*.
 */
export class HeightShadowMap {
  private near: THREE.WebGLRenderTarget
  private far: THREE.WebGLRenderTarget
  private focus: THREE.WebGLRenderTarget | null = null
  private farCleared = false
  private readonly camera = new THREE.OrthographicCamera() // ignorée par le shader caster
  private readonly clear = new THREE.Color()

  constructor(nearRes: number, farRes = 1024) {
    this.near = HeightShadowMap.target(nearRes, 'shadow.near')
    this.far = HeightShadowMap.target(farRes, 'shadow.far')
    this.bind()
  }

  private static target(res: number, name: string): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(res, res, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    })
    rt.texture.name = name
    return rt
  }

  private bind(): void {
    NPR.uShadowMap.value = this.near.texture
    NPR.uShadowRes.value = this.near.width
    NPR.uShadowMapFar.value = this.far.texture
    NPR.uShadowResFar.value = this.far.width
  }

  /** Change la résolution des cascades (preset) ; la cascade focus suit la proche. */
  setResolution(nearRes: number, farRes = this.far.width): void {
    if (this.near.width !== nearRes) {
      this.near.dispose()
      this.near = HeightShadowMap.target(nearRes, 'shadow.near')
      this.focus?.dispose()
      this.focus = null
    }
    if (this.far.width !== farRes) {
      this.far.dispose()
      this.far = HeightShadowMap.target(farRes, 'shadow.far')
      this.farCleared = false
    }
    this.bind()
  }

  private draw(renderer: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget, cx: number, cz: number, half: number, range: number): void {
    uCasterArea.value.set(cx, cz, half, range)
    renderer.setRenderTarget(rt)
    renderer.clear(true, true, false)
    renderer.render(shadowCasters.scene, this.camera)
  }

  render(renderer: THREE.WebGLRenderer): void {
    const a = shadowAreas
    shadowCasters.sync()
    const prevTarget = renderer.getRenderTarget()
    renderer.getClearColor(this.clear)
    const prevAlpha = renderer.getClearAlpha()
    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setClearColor(0x000000, 0)
    const range = 400
    NPR.uShadowArea.value.set(a.cx, a.cz, a.half, range)
    NPR.uShadowAreaFar.value.set(a.cx, a.cz, a.halfFar, range)
    this.draw(renderer, this.near, a.cx, a.cz, a.half, range)
    if (a.farOn) {
      this.draw(renderer, this.far, a.cx, a.cz, a.halfFar, range)
      this.farCleared = false
    } else if (!this.farCleared) {
      // soleil haut : rien ne sort de la zone proche ; on vide une fois la cascade lointaine
      renderer.setRenderTarget(this.far)
      renderer.clear(true, true, false)
      this.farCleared = true
    }
    if (a.focusOn) {
      this.focus ??= HeightShadowMap.target(this.near.width, 'shadow.focus')
      NPR.uShadowMapFocus.value = this.focus.texture
      NPR.uShadowResFocus.value = this.focus.width
      NPR.uShadowAreaFocus.value.set(a.fx, a.fz, a.focusHalf, 1)
      this.draw(renderer, this.focus, a.fx, a.fz, a.focusHalf, range)
    } else NPR.uShadowAreaFocus.value.w = 0
    renderer.setRenderTarget(prevTarget)
    renderer.setClearColor(this.clear, prevAlpha)
    renderer.autoClear = prevAutoClear
  }

  dispose(): void {
    this.near.dispose()
    this.far.dispose()
    this.focus?.dispose()
  }
}
