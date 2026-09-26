// Lots GPU des FX « encre » : chaque lot est UN draw call, rempli en mode
// immédiat à chaque frame (tampons préalloués, aucune allocation par frame).
//   SpriteBatch : formes SDF instanciées (bouffées, plumes, chevrons, icônes…)
//   StrokeBatch : segments d'encre instanciés à épaisseur en pixels (rayons, tirets…)
//   RibbonBatch : rubans (traînées, filets d'air, coups de pinceau), largeur mètres ≥ pixels.
// Formes plates, bord AA par fwidth, AUCUN additif : mélange normal, et la sortie
// MRT gNormalId = 0 (alpha nul) laisse intactes normales et ID (pas de contour post).
import {
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  ShaderMaterial,
  Uint16BufferAttribute,
  type BufferAttribute,
} from 'three'
import { GLSL_PRELUDE, GLSL_VERTEX_PRELUDE, nprUniforms } from '../bird/npr.ts'
import { GLSL_SHAPES } from './glsl.ts'

function dyn(attr: BufferAttribute | InstancedBufferAttribute): typeof attr {
  attr.setUsage(DynamicDrawUsage)
  return attr
}

function upload(attr: BufferAttribute, count: number): void {
  attr.clearUpdateRanges()
  if (count > 0) attr.addUpdateRange(0, count * attr.itemSize)
  attr.needsUpdate = true
}

// ─── Sprites SDF ──────────────────────────────────────────────────────────

const SPRITE_VERT = /* glsl */ `
${GLSL_VERTEX_PRELUDE}
attribute vec2 corner;
attribute vec3 iPos;
attribute vec4 iSize;   // demi-taille (m), demi-taille min (px 1080p), décalage écran (px 1080p)
attribute vec2 iRot;    // rotation (rad), forme
attribute vec4 iFill;   // rgb linéaire, alpha
attribute vec4 iLine;   // rgb linéaire, alpha
attribute vec4 iParam;  // paramètres de forme ; w = dissolution
attribute vec2 iMisc;   // épaisseur du liseré (px 1080p), épaisseur relative du détail
varying vec2 vLocal;
varying float vHalfPx;
varying vec4 vFill;
varying vec4 vLine;
varying vec4 vParam;
varying float vShape;
varying vec2 vMisc;
varying float vDist;
void main(){
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vec4 clip = projectionMatrix * mv;
  float pxPerM = uResolution.y * 0.5 * projectionMatrix[1][1] / max(clip.w, 1e-3);
  float halfPx = max(iSize.x * pxPerM, iSize.y * uPx);
  float margin = 1.0 + (iMisc.x * uPx + 2.0) / max(halfPx, 1.0);
  vec2 c = corner * margin;
  float cs = cos(iRot.x), sn = sin(iRot.x);
  vec2 off = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * halfPx + iSize.zw * uPx;
  clip.xy += off * 2.0 / uResolution * clip.w;
  gl_Position = clip;
  vLocal = c;
  vHalfPx = halfPx;
  vFill = iFill;
  vLine = iLine;
  vParam = iParam;
  vShape = iRot.y;
  vMisc = iMisc;
  vDist = length(mv.xyz);
}
`

const SPRITE_FRAG = /* glsl */ `
${GLSL_PRELUDE}
varying vec2 vLocal;
varying float vHalfPx;
varying vec4 vFill;
varying vec4 vLine;
varying vec4 vParam;
varying float vShape;
varying vec2 vMisc;
varying float vDist;
${GLSL_SHAPES}
void main(){
  float dBody, dInk;
  fxShape(int(vShape + 0.5), vLocal, vParam, dBody, dInk);
  float bPx = dBody * vHalfPx;
  float iPx = dInk * vHalfPx;
  float lw = vMisc.x * uPx;
  float body = 1.0 - smoothstep(-0.5, 0.5, bPx);
  float outline = lw > 0.0 ? (1.0 - smoothstep(lw - 0.5, lw + 0.5, abs(bPx + lw * 0.35))) : 0.0;
  // Détail intérieur : pour les formes « traits » (sans corps), épaissi d'au moins 1 px.
  float ink = 1.0 - smoothstep(-0.5 - vMisc.y, 0.5 - vMisc.y, iPx);
  float fillA = body * vFill.a;
  vec3 col = vFill.rgb;
  float a = fillA;
  float inkA = max(outline, ink) * vLine.a;
  col = mix(col, vLine.rgb, inkA / max(a + inkA * (1.0 - a), 1e-4) * (1.0));
  a = a + inkA * (1.0 - a);
  // Disparition par trame (screen-door attaché à la forme, pas de fondu gris).
  if (vParam.w > 0.0 && hash12(floor(vLocal * vHalfPx / max(uPx, 0.5) / 1.5) + vParam.zz * 37.0) < vParam.w) discard;
  if (a < 0.004) discard;
  float fog = fogAt(vDist);
  col = mix(col, fogColor(fog, 0.0), fog);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
  gNormalId = vec4(0.0);
}
`

export interface SpriteSpec {
  x: number
  y: number
  z: number
  /** Demi-taille en mètres et demi-taille minimale en pixels (1080p). */
  size: number
  minPx: number
  offX?: number
  offY?: number
  rot?: number
  shape: number
  fill: ArrayLike<number> // r, g, b, a
  line: ArrayLike<number> // r, g, b, a
  lineW?: number
  inkBoost?: number
  p0?: number
  p1?: number
  p2?: number
  dissolve?: number
}

export class SpriteBatch {
  readonly mesh: Mesh
  readonly capacity: number
  private n = 0
  private readonly geo: InstancedBufferGeometry
  private readonly a: Record<'pos' | 'size' | 'rot' | 'fill' | 'line' | 'param' | 'misc', InstancedBufferAttribute>

  constructor(capacity: number, opts: { depthTest: boolean; renderOrder: number }) {
    this.capacity = capacity
    const g = new InstancedBufferGeometry()
    g.setAttribute('corner', new Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2))
    g.setIndex([0, 1, 2, 0, 2, 3])
    const mk = (size: number) => dyn(new InstancedBufferAttribute(new Float32Array(capacity * size), size)) as InstancedBufferAttribute
    this.a = { pos: mk(3), size: mk(4), rot: mk(2), fill: mk(4), line: mk(4), param: mk(4), misc: mk(2) }
    g.setAttribute('iPos', this.a.pos)
    g.setAttribute('iSize', this.a.size)
    g.setAttribute('iRot', this.a.rot)
    g.setAttribute('iFill', this.a.fill)
    g.setAttribute('iLine', this.a.line)
    g.setAttribute('iParam', this.a.param)
    g.setAttribute('iMisc', this.a.misc)
    g.instanceCount = 0
    this.geo = g
    const mat = new ShaderMaterial({
      name: 'FxSprites',
      uniforms: { ...nprUniforms },
      vertexShader: SPRITE_VERT,
      fragmentShader: SPRITE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: opts.depthTest,
      blending: NormalBlending,
    })
    this.mesh = new Mesh(g, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = opts.renderOrder
    this.mesh.name = 'fxSprites'
  }

  begin(): void {
    this.n = 0
  }

  get count(): number {
    return this.n
  }

  push(s: SpriteSpec): boolean {
    if (this.n >= this.capacity) return false
    const i = this.n++
    const A = this.a
    const p = A.pos.array as Float32Array
    p[i * 3] = s.x
    p[i * 3 + 1] = s.y
    p[i * 3 + 2] = s.z
    const z = A.size.array as Float32Array
    z[i * 4] = s.size
    z[i * 4 + 1] = s.minPx
    z[i * 4 + 2] = s.offX ?? 0
    z[i * 4 + 3] = s.offY ?? 0
    const r = A.rot.array as Float32Array
    r[i * 2] = s.rot ?? 0
    r[i * 2 + 1] = s.shape
    const f = A.fill.array as Float32Array
    f[i * 4] = s.fill[0]!
    f[i * 4 + 1] = s.fill[1]!
    f[i * 4 + 2] = s.fill[2]!
    f[i * 4 + 3] = s.fill[3]!
    const l = A.line.array as Float32Array
    l[i * 4] = s.line[0]!
    l[i * 4 + 1] = s.line[1]!
    l[i * 4 + 2] = s.line[2]!
    l[i * 4 + 3] = s.line[3]!
    const q = A.param.array as Float32Array
    q[i * 4] = s.p0 ?? 0
    q[i * 4 + 1] = s.p1 ?? 0
    q[i * 4 + 2] = s.p2 ?? 0
    q[i * 4 + 3] = s.dissolve ?? 0
    const m = A.misc.array as Float32Array
    m[i * 2] = s.lineW ?? 0
    m[i * 2 + 1] = s.inkBoost ?? 0
    return true
  }

  end(): void {
    const A = this.a
    upload(A.pos, this.n)
    upload(A.size, this.n)
    upload(A.rot, this.n)
    upload(A.fill, this.n)
    upload(A.line, this.n)
    upload(A.param, this.n)
    upload(A.misc, this.n)
    this.geo.instanceCount = this.n
    this.mesh.visible = this.n > 0
  }

  dispose(): void {
    this.geo.dispose()
    ;(this.mesh.material as ShaderMaterial).dispose()
  }
}

// ─── Traits d'encre (segments) ────────────────────────────────────────────

const STROKE_VERT = /* glsl */ `
${GLSL_VERTEX_PRELUDE}
attribute vec2 corner;  // x : 0 → 1 le long du trait, y : -1 / 1 en travers
attribute vec3 iA;
attribute vec3 iB;
attribute vec2 iW;      // épaisseur (px 1080p) en A et en B
attribute vec4 iColor;
varying vec2 vP;        // position (px) le long / en travers
varying float vLen;
varying float vHalf;
varying vec4 vColor;
varying float vDist;
void main(){
  vec4 mA = viewMatrix * vec4(iA, 1.0);
  vec4 mB = viewMatrix * vec4(iB, 1.0);
  vec4 cA = projectionMatrix * mA;
  vec4 cB = projectionMatrix * mB;
  if (cA.w <= 0.0 || cB.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 sA = cA.xy / cA.w * uResolution * 0.5;
  vec2 sB = cB.xy / cB.w * uResolution * 0.5;
  vec2 d = sB - sA;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  float hw = mix(iW.x, iW.y, corner.x) * uPx * 0.5;
  float ext = hw + 1.0;
  vec2 s = mix(sA, sB, corner.x) + n * corner.y * ext + dir * (corner.x * 2.0 - 1.0) * ext;
  vec4 c = mix(cA, cB, corner.x);
  gl_Position = vec4(s / (uResolution * 0.5) * c.w, c.z, c.w);
  vP = vec2(corner.x * len + (corner.x * 2.0 - 1.0) * ext, corner.y * ext);
  vLen = len;
  vHalf = hw;
  vColor = iColor;
  vDist = length(mix(mA.xyz, mB.xyz, corner.x));
}
`

const STROKE_FRAG = /* glsl */ `
${GLSL_PRELUDE}
varying vec2 vP;
varying float vLen;
varying float vHalf;
varying vec4 vColor;
varying float vDist;
void main(){
  float along = max(0.0, max(-vP.x, vP.x - vLen));
  float d = length(vec2(along, vP.y)) - vHalf;
  // Trait plus fin qu'un pixel : opacité proportionnelle (pas de scintillement).
  float cov = (1.0 - smoothstep(-0.5, 0.5, d)) * clamp(vHalf * 2.0, 0.0, 1.0);
  float a = cov * vColor.a;
  if (a < 0.004) discard;
  float fog = fogAt(vDist);
  gl_FragColor = vec4(mix(vColor.rgb, fogColor(fog, 0.0), fog), a);
  #include <colorspace_fragment>
  gNormalId = vec4(0.0);
}
`

export class StrokeBatch {
  readonly mesh: Mesh
  readonly capacity: number
  private n = 0
  private readonly geo: InstancedBufferGeometry
  private readonly A: InstancedBufferAttribute
  private readonly B: InstancedBufferAttribute
  private readonly W: InstancedBufferAttribute
  private readonly C: InstancedBufferAttribute

  constructor(capacity: number, opts: { depthTest: boolean; renderOrder: number }) {
    this.capacity = capacity
    const g = new InstancedBufferGeometry()
    g.setAttribute('corner', new Float32BufferAttribute([0, -1, 1, -1, 1, 1, 0, 1], 2))
    g.setIndex([0, 1, 2, 0, 2, 3])
    const mk = (size: number) => dyn(new InstancedBufferAttribute(new Float32Array(capacity * size), size)) as InstancedBufferAttribute
    this.A = mk(3)
    this.B = mk(3)
    this.W = mk(2)
    this.C = mk(4)
    g.setAttribute('iA', this.A)
    g.setAttribute('iB', this.B)
    g.setAttribute('iW', this.W)
    g.setAttribute('iColor', this.C)
    g.instanceCount = 0
    this.geo = g
    const mat = new ShaderMaterial({
      name: 'FxStrokes',
      uniforms: { ...nprUniforms },
      vertexShader: STROKE_VERT,
      fragmentShader: STROKE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: opts.depthTest,
      blending: NormalBlending,
    })
    this.mesh = new Mesh(g, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = opts.renderOrder
    this.mesh.name = 'fxStrokes'
  }

  begin(): void {
    this.n = 0
  }

  get count(): number {
    return this.n
  }

  push(ax: number, ay: number, az: number, bx: number, by: number, bz: number, wA: number, wB: number, color: ArrayLike<number>, alpha: number): boolean {
    if (this.n >= this.capacity || alpha <= 0.004) return false
    const i = this.n++
    const a = this.A.array as Float32Array
    const b = this.B.array as Float32Array
    const w = this.W.array as Float32Array
    const c = this.C.array as Float32Array
    a[i * 3] = ax
    a[i * 3 + 1] = ay
    a[i * 3 + 2] = az
    b[i * 3] = bx
    b[i * 3 + 1] = by
    b[i * 3 + 2] = bz
    w[i * 2] = wA
    w[i * 2 + 1] = wB
    c[i * 4] = color[0]!
    c[i * 4 + 1] = color[1]!
    c[i * 4 + 2] = color[2]!
    c[i * 4 + 3] = alpha
    return true
  }

  end(): void {
    upload(this.A, this.n)
    upload(this.B, this.n)
    upload(this.W, this.n)
    upload(this.C, this.n)
    this.geo.instanceCount = this.n
    this.mesh.visible = this.n > 0
  }

  dispose(): void {
    this.geo.dispose()
    ;(this.mesh.material as ShaderMaterial).dispose()
  }
}

// ─── Rubans ───────────────────────────────────────────────────────────────

const RIBBON_VERT = /* glsl */ `
${GLSL_VERTEX_PRELUDE}
attribute vec3 aTan;
attribute float aSide;
attribute vec3 aWidth;  // largeur (m), largeur min (px 1080p), liseré d'encre (px 1080p)
attribute vec4 aColor;
varying float vSide;
varying float vHalf;
varying float vEdge;
varying vec4 vColor;
varying float vDist;
void main(){
  vec4 mv = viewMatrix * vec4(position, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec4 clipT = projectionMatrix * (viewMatrix * vec4(position + aTan, 1.0));
  vec2 s0 = clip.xy / max(clip.w, 1e-3) * uResolution * 0.5;
  vec2 s1 = clipT.xy / max(clipT.w, 1e-3) * uResolution * 0.5;
  vec2 d = s1 - s0;
  float l = length(d);
  vec2 n = l > 1e-5 ? vec2(-d.y, d.x) / l : vec2(0.0, 1.0);
  float pxPerM = uResolution.y * 0.5 * projectionMatrix[1][1] / max(clip.w, 1e-3);
  float hw = max(aWidth.x * pxPerM, aWidth.y * uPx) * 0.5;
  float ext = hw + 0.75;
  clip.xy += n * aSide * ext * 2.0 / uResolution * clip.w;
  gl_Position = clip;
  vSide = aSide * ext;
  vHalf = hw;
  vEdge = aWidth.z * uPx;
  vColor = aColor;
  vDist = length(mv.xyz);
}
`

const RIBBON_FRAG = /* glsl */ `
${GLSL_PRELUDE}
varying float vSide;
varying float vHalf;
varying float vEdge;
varying vec4 vColor;
varying float vDist;
void main(){
  float d = abs(vSide) - vHalf;
  float cov = (1.0 - smoothstep(-0.5, 0.5, d)) * clamp(vHalf * 2.0, 0.0, 1.0);
  // Liseré d'encre sur les rubans assez larges (≥ 4 px) : ligne claire.
  float edge = vEdge > 0.0 ? smoothstep(-vEdge - 0.5, -vEdge + 0.5, d) * smoothstep(3.0, 5.0, vHalf * 2.0) : 0.0;
  vec3 col = mix(vColor.rgb, uInk, edge);
  float a = cov * max(vColor.a, edge);
  if (a < 0.004) discard;
  float fog = fogAt(vDist);
  gl_FragColor = vec4(mix(col, fogColor(fog, 0.0), fog), a);
  #include <colorspace_fragment>
  gNormalId = vec4(0.0);
}
`

export class RibbonBatch {
  readonly mesh: Mesh
  readonly capacity: number
  private nv = 0
  private ni = 0
  private readonly geo: BufferGeometry
  private readonly pos: Float32BufferAttribute
  private readonly tan: Float32BufferAttribute
  private readonly side: Float32BufferAttribute
  private readonly width: Float32BufferAttribute
  private readonly color: Float32BufferAttribute
  private readonly index: Uint16BufferAttribute
  private stripStart = -1

  /** @param capacity nombre maximal de points (2 sommets chacun) */
  constructor(capacity: number, opts: { depthTest: boolean; renderOrder: number }) {
    this.capacity = Math.min(capacity, 32000)
    const V = this.capacity * 2
    const g = new BufferGeometry()
    this.pos = dyn(new Float32BufferAttribute(new Float32Array(V * 3), 3)) as Float32BufferAttribute
    this.tan = dyn(new Float32BufferAttribute(new Float32Array(V * 3), 3)) as Float32BufferAttribute
    this.side = new Float32BufferAttribute(new Float32Array(V), 1)
    for (let i = 0; i < V; i++) (this.side.array as Float32Array)[i] = i % 2 ? 1 : -1
    this.width = dyn(new Float32BufferAttribute(new Float32Array(V * 3), 3)) as Float32BufferAttribute
    this.color = dyn(new Float32BufferAttribute(new Float32Array(V * 4), 4)) as Float32BufferAttribute
    this.index = dyn(new Uint16BufferAttribute(new Uint16Array(this.capacity * 6), 1)) as Uint16BufferAttribute
    g.setAttribute('position', this.pos)
    g.setAttribute('aTan', this.tan)
    g.setAttribute('aSide', this.side)
    g.setAttribute('aWidth', this.width)
    g.setAttribute('aColor', this.color)
    g.setIndex(this.index)
    g.setDrawRange(0, 0)
    this.geo = g
    const mat = new ShaderMaterial({
      name: 'FxRibbons',
      uniforms: { ...nprUniforms },
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      // L'orientation des triangles dépend du sens de la tangente fournie : pas de culling.
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      depthTest: opts.depthTest,
      blending: NormalBlending,
    })
    this.mesh = new Mesh(g, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = opts.renderOrder
    this.mesh.name = 'fxRibbons'
  }

  begin(): void {
    this.nv = 0
    this.ni = 0
    this.stripStart = -1
  }

  /** Commence un ruban ; les points suivants sont reliés entre eux. */
  beginStrip(): void {
    this.stripStart = this.nv
  }

  /** Ajoute un point au ruban courant (tangente monde tx, ty, tz non nécessairement unitaire). */
  point(x: number, y: number, z: number, tx: number, ty: number, tz: number, widthM: number, minPx: number, edgePx: number, color: ArrayLike<number>, alpha: number): boolean {
    if (this.nv + 2 > this.capacity * 2 || this.stripStart < 0) return false
    const v = this.nv
    const P = this.pos.array as Float32Array
    const T = this.tan.array as Float32Array
    const W = this.width.array as Float32Array
    const C = this.color.array as Float32Array
    for (let k = 0; k < 2; k++) {
      const j = v + k
      P[j * 3] = x
      P[j * 3 + 1] = y
      P[j * 3 + 2] = z
      T[j * 3] = tx
      T[j * 3 + 1] = ty
      T[j * 3 + 2] = tz
      W[j * 3] = widthM
      W[j * 3 + 1] = minPx
      W[j * 3 + 2] = edgePx
      C[j * 4] = color[0]!
      C[j * 4 + 1] = color[1]!
      C[j * 4 + 2] = color[2]!
      C[j * 4 + 3] = alpha
    }
    if (v > this.stripStart) {
      const I = this.index.array as Uint16Array
      const a = v - 2
      I[this.ni++] = a
      I[this.ni++] = a + 1
      I[this.ni++] = v
      I[this.ni++] = a + 1
      I[this.ni++] = v + 1
      I[this.ni++] = v
    }
    this.nv += 2
    return true
  }

  endStrip(): void {
    this.stripStart = -1
  }

  end(): void {
    upload(this.pos, this.nv)
    upload(this.tan, this.nv)
    upload(this.width, this.nv)
    upload(this.color, this.nv)
    upload(this.index, this.ni)
    this.geo.setDrawRange(0, this.ni)
    this.mesh.visible = this.ni > 0
  }

  dispose(): void {
    this.geo.dispose()
    ;(this.mesh.material as ShaderMaterial).dispose()
  }
}
