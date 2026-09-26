// API publique du framework NPR (voir README.md dans ce dossier).
export { NPR, nprUniforms, setNightJag, OWNER_CODES, NIGHT_JAG_SAMPLES, type NprUniforms } from './uniforms.ts'
export {
  updatePalette,
  updateOwnerTables,
  paletteElev,
  gameElevForPalette,
  sunElevationDeg,
  sunAzimuthDeg,
  paletteColor,
  paletteLab,
  KEYFRAME_ELEVS,
  type PaletteFrame,
  type PaletteColorKey,
} from './palette.ts'
export { GLSL, NPR_FRAGMENT_PRELUDE, NPR_VERTEX_PRELUDE } from './glsl/index.ts'
export {
  createNprMaterial,
  setNprAccent,
  setNprAlbedo,
  albedoAttribute,
  fillAlbedo,
  NPR_VERTEX_HEADER,
  NPR_VERTEX_TRANSFORM,
  type NprMaterial,
  type NprMaterialOptions,
  type VertexDeform,
  type HatchMode,
} from './material.ts'
export { createGBuffer, GBufferPass, withGBuffer } from './gbuffer.ts'
export {
  shadowCasters,
  shadowAreas,
  createCasterMaterial,
  HeightShadowMap,
  CASTER_TYPE,
  type CasterOptions,
  type CasterHandle,
} from './shadowMap.ts'
export { BirdFootprints, FOOTPRINT_OPACITY, type FootprintInput } from './footprints.ts'
export { InkEffect, type InkSettings } from './InkEffect.ts'
export { NprPipeline, useNprFrame, requestPlancheFlash, type NprPipelineProps, type NprFrameHook } from './NprPipeline.tsx'
export { useShadowCaster } from './useShadowCaster.ts'
export { OBJ_ID, birdId, birdAccentId, riderId, towerId } from './ids.ts'
export { GpuTimer } from './perf.ts'
export * as oklabCpu from './oklab.ts'
