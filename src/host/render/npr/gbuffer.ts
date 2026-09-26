// G-buffer MRT (NPR §2, §5) : couleur sRGB8 | normale de vue + ID RGBA8 | profondeur Float32.
// Une seule passe géométrique ; l'InkEffect lit ces trois textures.
import * as THREE from 'three'
import { Pass } from 'postprocessing'

export function createGBuffer(width = 1, height = 1): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(width, height, {
    count: 2,
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
    depthTexture: new THREE.DepthTexture(width, height, THREE.FloatType),
  })
  rt.textures[0]!.colorSpace = THREE.SRGBColorSpace // pas de banding dans les sombres
  rt.textures[0]!.name = 'gbuffer.color'
  rt.textures[1]!.name = 'gbuffer.normalId' // données brutes (NoColorSpace)
  return rt
}

/**
 * Passe géométrique : rend la scène dans le G-buffer. N'écrit pas dans les
 * buffers du composer (needsSwap = false) : l'InkEffect lit directement la cible.
 */
export class GBufferPass extends Pass {
  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    readonly target: THREE.WebGLRenderTarget,
  ) {
    super('GBufferPass', scene, camera)
    this.needsSwap = false
  }

  override render(renderer: THREE.WebGLRenderer): void {
    const prevTarget = renderer.getRenderTarget()
    const prevAutoClear = renderer.autoClear
    renderer.setRenderTarget(this.target)
    renderer.setClearColor(0x000000, 0)
    renderer.clear(true, true, false)
    renderer.autoClear = false
    renderer.render(this.scene!, this.camera!)
    renderer.autoClear = prevAutoClear
    renderer.setRenderTarget(prevTarget)
  }

  override setSize(width: number, height: number): void {
    this.target.setSize(width, height)
  }

  setScene(scene: THREE.Scene, camera: THREE.Camera): void {
    this.scene = scene
    this.camera = camera
  }
}

/**
 * Fait vivre un matériau three/drei (MeshBasicMaterial, Text de troika, Line2,
 * sprite…) dans la passe MRT : ajoute la sortie `gNormalId` (normale « face
 * caméra » + objId). Sans elle, le draw call est ignoré (GL_INVALID_OPERATION).
 * `objId = 0` : pas de contour d'encre ; transparent : passer `transparentId = true`
 * pour écrire vec4(0) (la normale/ID du dessous restent intactes).
 */
export function withGBuffer<T extends THREE.Material>(mat: T, objId = 0, transparentId = false): T {
  const prev = mat.onBeforeCompile.bind(mat)
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer)
    shader.uniforms.uObjId = { value: objId / 255 }
    const out = transparentId ? 'vec4(0.0)' : 'vec4(0.5, 0.5, 1.0, uObjId)'
    shader.fragmentShader =
      'layout(location = 1) out highp vec4 gNormalId;\nuniform float uObjId;\n' +
      shader.fragmentShader.replace(/}\s*$/, `  gNormalId = ${out};\n}`)
  }
  const prevKey = mat.customProgramCacheKey.bind(mat)
  mat.customProgramCacheKey = () => `${prevKey()}|gbuf|${transparentId ? 't' : 'o'}`
  return mat
}
