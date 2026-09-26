// <Horizon> : les trois plans lointains (ART_BIBLE §6.3), vus dans les plans bas.
//   1. (les dunes sont le sol, 400-900 m)
//   2. Mesas et Géantes lointaines (1,1-2,6 km) : aplats brumeux mix(sandShade, haze, 0,5)
//      côté soleil et mix(castShadow, haze, 0,4) à l'ombre, petits tirets de strates au sommet.
//   3. La Falaise (1,7 km à l'ouest) : aplat mix(castShadow, haze, 0,3) et 2-3 bandes de
//      strates ; sa crête reprend le profil de la sim (front de la Grande Ombre) et culmine
//      à E_end = 9° : le soleil la touche en fin de manche.
// Couleurs calculées dans le shader depuis la palette partagée (jour/nuit). Pas de caster.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { getCliffProfile } from '../../../sim/maps.ts'
import { gameView } from '../../view.ts'
import { NPR_FRAGMENT_PRELUDE } from '../npr/glsl/index.ts'
import { OBJ_ID } from '../npr/ids.ts'
import { NPR } from '../npr/uniforms.ts'

const KIND = { falaise: 0, mesa: 1, giant: 2 } as const

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class HBuilder {
  pos: number[] = []
  nrm: number[] = []
  kind: number[] = []
  hgt: number[] = []
  idx: number[] = []
  v(p: [number, number, number], n: [number, number, number], kind: number, h01: number): number {
    this.pos.push(...p)
    this.nrm.push(...n)
    this.kind.push(kind)
    this.hgt.push(h01)
    return this.pos.length / 3 - 1
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('hkind', new THREE.Float32BufferAttribute(this.kind, 1))
    g.setAttribute('hh', new THREE.Float32BufferAttribute(this.hgt, 1))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    return g
  }
}

/** Falaise : mur à x = −distance, crête dentelée (profil de la sim au centre, prolongé). */
function buildFalaise(b: HBuilder, crest: Float32Array, jagSpan: number, distance: number, height: number, seed: number): void {
  const r = rng(seed)
  const half = 1500
  const step = 6
  const n = Math.round((2 * half) / step)
  // prolongement du profil au-delà de ±jagSpan : plateaux aléatoires qui s'abaissent vers les bouts
  const tops: number[] = []
  let level = 0
  let run = 0
  for (let i = 0; i <= n; i++) {
    const q = -half + i * step
    let c: number
    if (Math.abs(q) <= jagSpan) {
      const x = ((q + jagSpan) / (2 * jagSpan)) * (crest.length - 1)
      const i0 = Math.floor(x)
      const i1 = Math.min(crest.length - 1, i0 + 1)
      c = crest[i0]! + (crest[i1]! - crest[i0]!) * (x - i0)
      level = c
    } else {
      if (run <= 0) {
        level = Math.max(-1, Math.min(1, level + (r() - 0.5) * 1.4))
        run = 4 + Math.floor(r() * 9)
      }
      run--
      c = level
    }
    const fall = 1 - Math.pow(Math.max(0, (Math.abs(q) - 900) / (half - 900)), 1.6)
    tops.push(height * (1 + 0.05 * c) * Math.max(0.05, fall))
  }
  // mur (60 % haut, quasi vertical) + talus d'éboulis (40 % bas)
  const rows = [0, 0.38, 0.42, 1]
  const xOff = [140, 40, 18, 0]
  const base = b.pos.length / 3
  for (let i = 0; i <= n; i++) {
    const q = -half + i * step
    const bend = (q * q) / (2 * 5200) // légère courbure : la Falaise enveloppe l'horizon ouest
    for (let k = 0; k < rows.length; k++) {
      const h = tops[i]! * rows[k]!
      const x = -distance - xOff[k]! * (1 + 0.3 * Math.sin(q * 0.013)) + bend
      const nx = k < 2 ? 0.55 : 0.97
      b.v([x, h, q], [nx, k < 2 ? 0.8 : 0.24, 0], KIND.falaise, rows[k]!)
    }
  }
  const R = rows.length
  for (let i = 0; i < n; i++)
    for (let k = 0; k < R - 1; k++) {
      const a = base + i * R + k
      const c = base + (i + 1) * R + k
      b.idx.push(a, c, c + 1, a, c + 1, a + 1)
    }
  // dessus plat (en retrait) pour que la crête ait une épaisseur vue d'en haut
  const topBase = b.pos.length / 3
  for (let i = 0; i <= n; i++) {
    const q = -half + i * step
    const bend = (q * q) / (2 * 5200)
    b.v([-distance + bend, tops[i]!, q], [0, 1, 0], KIND.falaise, 1)
    b.v([-distance - 400 + bend, tops[i]! * 0.98, q], [0, 1, 0], KIND.falaise, 1)
  }
  for (let i = 0; i < n; i++) {
    const a = topBase + i * 2
    b.idx.push(a, a + 1, a + 3, a, a + 3, a + 2)
  }
}

/** Mesa : prisme à flancs raides et sommet plat, empreinte polygonale irrégulière. */
function buildMesa(b: HBuilder, cx: number, cz: number, radius: number, height: number, r: () => number): void {
  const N = 9 + Math.floor(r() * 5)
  const ring: Array<[number, number]> = []
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + (r() - 0.5) * 0.4
    const rr = radius * (0.65 + r() * 0.55) * (Math.abs(Math.cos(a)) * 0.6 + 0.6) // allongées est-ouest
    ring.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr * 0.7])
  }
  const topShrink = 0.86
  for (let k = 0; k < N; k++) {
    const [x0, z0] = ring[k]!
    const [x1, z1] = ring[(k + 1) % N]!
    const mx = (x0 + x1) / 2 - cx
    const mz = (z0 + z1) / 2 - cz
    const l = Math.hypot(mx, mz) || 1
    const nrm: [number, number, number] = [mx / l, 0.25, mz / l]
    const t0: [number, number] = [cx + (x0 - cx) * topShrink, cz + (z0 - cz) * topShrink]
    const t1: [number, number] = [cx + (x1 - cx) * topShrink, cz + (z1 - cz) * topShrink]
    const a = b.v([x0, 0, z0], nrm, KIND.mesa, 0)
    const c = b.v([x1, 0, z1], nrm, KIND.mesa, 0)
    const d = b.v([t1[0], height, t1[1]], nrm, KIND.mesa, 1)
    const e = b.v([t0[0], height, t0[1]], nrm, KIND.mesa, 1)
    b.idx.push(a, d, c, a, e, d)
  }
  // sommet plat
  const center = b.v([cx, height, cz], [0, 1, 0], KIND.mesa, 1)
  const topStart = b.pos.length / 3
  for (let k = 0; k < N; k++) {
    const [x0, z0] = ring[k]!
    b.v([cx + (x0 - cx) * topShrink, height, cz + (z0 - cz) * topShrink], [0, 1, 0], KIND.mesa, 1)
  }
  for (let k = 0; k < N; k++) b.idx.push(center, topStart + ((k + 1) % N), topStart + k)
}

/** Géante lointaine : fût, bulbe, flèche (profil de révolution simple). */
function buildGiant(b: HBuilder, cx: number, cz: number, h: number, r0: number): void {
  const prof: Array<[number, number]> = [
    [r0, 0],
    [r0 * 0.62, h * 0.72],
    [r0 * 1.25, h * 0.78],
    [r0 * 1.35, h * 0.84],
    [r0 * 0.9, h * 0.9],
    [r0 * 0.2, h * 0.93],
    [0.8, h],
    [0, h * 1.02],
  ]
  const S = 16
  const rings: number[] = []
  for (const [rr, z] of prof) {
    rings.push(b.pos.length / 3)
    for (let k = 0; k < S; k++) {
      const a = (k / S) * Math.PI * 2
      b.v([cx + Math.cos(a) * rr, z, cz - Math.sin(a) * rr], [Math.cos(a), 0.2, -Math.sin(a)], KIND.giant, z / h)
    }
  }
  for (let i = 0; i + 1 < rings.length; i++)
    for (let k = 0; k < S; k++) {
      const k1 = (k + 1) % S
      const a = rings[i]! + k
      const c = rings[i]! + k1
      const d = rings[i + 1]! + k1
      const e = rings[i + 1]! + k
      b.idx.push(a, c, d, a, d, e)
    }
}

const VERT = /* glsl */ `
attribute float hkind;
attribute float hh;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vViewN;
varying float vDist;
varying float vKind;
varying float vH;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewN = normalize(normalMatrix * normal);
  vKind = hkind;
  vH = hh;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
${NPR_FRAGMENT_PRELUDE}
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vViewN;
varying float vDist;
varying float vKind;
varying float vH;
void main(){
  vec3 N = normalize(vNormalW);
  float ndl = dot(N, uSunDir);
  float fl = fwidth(ndl);
  float nd = nightDist(vWorld.xz);
  float nw = max(fwidth(nd), 1e-3);
  float y = vWorld.y;
  float dy = max(fwidth(y), 1e-4);
  float dxz = max(length(fwidth(vWorld.xz)), 1e-4);
  float n = nightMask(nd, nw);
  vec3 haze = palHaze(n);
  vec3 hor = palHorizon(n);
  vec3 castC = palCast(n);
  vec3 shade = mix(uSandShade, uNSandShade, n);
  vec3 ink = palInk(n);
  float lit = smoothstep(0.08 - fl, 0.08 + fl, ndl);
  vec3 col;
  float lineA = 0.0;
  if (vKind < 0.5) {
    // Falaise : seule masse sombre de l'horizon ; bandes de strates horizontales
    vec3 base = mixLab(castC, haze, 0.3);
    col = mix(base, mixLab(base, hor, 0.25), lit * 0.5);
    float band = step(0.5, fract(vH * 3.2 + 0.15 * sin(vWorld.z * 0.011))) * step(0.42, vH);
    col = mixLab(col, mixLab(castC, hor, 0.45), band * 0.35);
    lineA = lineCov(vH * 3.2 + 0.15 * sin(vWorld.z * 0.011), 1.0, max(fwidth(vH * 3.2), 1e-5), 1.0 * uPx) * step(0.42, vH) * 0.35;
  } else if (vKind < 1.5) {
    // mesas : deux aplats brumeux, petits tirets verticaux de strates au sommet
    vec3 litC = mixLab(shade, haze, 0.5);
    vec3 shC = mixLab(castC, haze, 0.4);
    col = mix(shC, litC, lit);
    float dash = lineCov(vWorld.x + vWorld.z * 0.7, 9.0, dxz, 1.0 * uPx) * smoothstep(0.78, 0.9, vH) * step(vH, 0.995) * step(abs(N.y), 0.9);
    lineA = dash * 0.5;
  } else {
    // Géantes lointaines : silhouette seule, aplat brumeux
    col = mix(mixLab(castC, haze, 0.45), mixLab(shade, haze, 0.55), lit);
  }
  col = mix(col, ink, lineA * (1.0 - n * 0.5));
  // brume propre aux plans lointains : on garde l'aplat de la bible ; le pied sort de la brume
  float footFog = vKind < 0.5 ? (1.0 - smoothstep(0.0, 0.2, vH)) * 0.45 : (1.0 - smoothstep(0.0, 0.55, vH)) * 0.85;
  col = mixLab(col, fogColor(0.86, n), footFog);
  col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
  writeGBuffer(vViewN, vKind < 0.5 ? ${OBJ_ID.falaise}.0 : vKind < 1.5 ? ${OBJ_ID.mesa}.0 : ${OBJ_ID.horizonGiant}.0);
}
`

export function Horizon({ arena }: { arena: { a: number; b: number } }) {
  const mapId = gameView.sim?.config.mapId ?? 'parasols'
  const geometry = useMemo(() => {
    const b = new HBuilder()
    const cliff = getCliffProfile(mapId, arena)
    buildFalaise(b, cliff.crest, cliff.jagSpan, cliff.distance, cliff.height, 0xfa1a15e)
    const r = rng(0x3e5a)
    // mesas : anneau irrégulier, pas dans l'axe du couchant (la Falaise y règne)
    for (let k = 0; k < 11; k++) {
      const az = (k / 11) * Math.PI * 2 + (r() - 0.5) * 0.4 // depuis +x (est), sens trigo, repère sim
      const sx = Math.cos(az)
      if (sx < -0.55) continue
      const d = 1150 + r() * 1300
      buildMesa(b, Math.cos(az) * d, -Math.sin(az) * d, 70 + r() * 120, 35 + r() * 95, r)
    }
    // Géantes lointaines : deux au nord-ouest devant la Falaise, une au sud-est
    buildGiant(b, -1250, -900, 230, 16)
    buildGiant(b, -1420, -620, 180, 13)
    buildGiant(b, 1500, 1350, 260, 18)
    return b.build()
  }, [mapId, arena])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'world.horizon',
        uniforms: { ...NPR },
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.DoubleSide,
      }),
    [],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  return <mesh geometry={geometry} material={material} name="horizon" frustumCulled={false} />
}
