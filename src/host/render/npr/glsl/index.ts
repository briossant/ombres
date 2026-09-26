// Chunks GLSL partagés du pipeline NPR. Chaque chunk est protégé par #ifndef :
// on peut les concaténer sans se soucier des doublons.
//   common  : hash, ign, lineCov, hatchU, hatchTone, stipple, aaStep
//   oklab   : lin2oklab, oklab2lin, mixLab
//   palette : uniforms de palette jour/nuit, soleil, uPx, uNoise, uQuality
//   night   : front de nuit (nightDist, nightMask)
//   shadow  : sampleShadow (height shadow map, 2 cascades)
//   fog     : fogAt, fogColor, applyFog
//   mrt     : sortie gNormalId + writeGBuffer
//   tint    : deux tons teintés par la lumière (nprLitLab, nprShadeLab, nprTerminator)
//   hatch   : hatchCylU, hatchShade
import { common } from './common.ts'
import { fog } from './fog.ts'
import { hatch } from './hatch.ts'
import { mrt } from './mrt.ts'
import { night } from './night.ts'
import { oklab } from './oklab.ts'
import { palette } from './palette.ts'
import { shadow } from './shadow.ts'
import { tint } from './tint.ts'

export const GLSL = { common, oklab, palette, night, shadow, fog, mrt, tint, hatch }

/** Préambule complet pour un fragment shader NPR (dans l'ordre des dépendances). */
export const NPR_FRAGMENT_PRELUDE = mrt + common + oklab + palette + night + shadow + fog + tint + hatch

/** Préambule minimal pour un vertex shader qui lit l'ombre ou le soleil (cailloux, FX). */
export const NPR_VERTEX_PRELUDE = common + palette + shadow + fog
