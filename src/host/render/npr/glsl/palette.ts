// Chunk `palette` : déclaration des uniforms de palette partagés (jour + nuit)
// et du soleil. Les valeurs sont poussées une fois par frame par palette.ts.
// Toutes les couleurs sont en RGB linéaire ; les uLab* en OKLab.
export const palette = /* glsl */ `
#ifndef NPR_CHUNK_PALETTE
#define NPR_CHUNK_PALETTE
uniform vec3 uSkyTop, uSkyMid, uSkyHorizon, uSun, uHaze;
uniform vec3 uSandLit, uGroundFlat, uSandShade, uCastShadow, uInk, uHatchCol, uBirdLit, uBirdShade;
uniform float uHatchOpacity, uPaintC, uWarm, uPaletteElev;
uniform vec3 uLabGround, uLabSandLit, uLabCast, uLabBirdLight;
uniform vec4 uTintK;
uniform vec3 uNGroundFlat, uNSandShade, uNCastShadow, uNInk, uNHaze, uNHatchCol, uNBirdLit, uNBirdShade;
uniform float uNHatchOpacity, uNPaintC;
uniform vec3 uNLabGround, uNLabSandLit, uNLabCast, uNLabBirdLight;
uniform vec4 uNTintK;
uniform vec3 uNSkyTop, uNSkyMid, uNSkyHorizon, uNSun, uLipColor;
uniform vec3 uSunDir, uSunDiscDir;
uniform vec2 uShadowDir;
uniform float uPx, uTime;
uniform vec2 uResolution;
uniform vec4 uQuality;       // (hachures, granulation/pointillé, rides, tremblé)
uniform sampler2D uNoise;    // R,G warp basse fréquence, B moyenne, A grain fin
// Accès « jour ou nuit » : n = masque de nuit du pixel (0 jour, 1 nuit).
vec3 palInk(float n){ return mix(uInk, uNInk, n); }
vec3 palCast(float n){ return mix(uCastShadow, uNCastShadow, n); }
vec3 palGround(float n){ return mix(uGroundFlat, uNGroundFlat, n); }
vec3 palHaze(float n){ return mix(uHaze, uNHaze, n); }
vec3 palHorizon(float n){ return mix(uSkyHorizon, uNSkyHorizon, n); }
vec3 palHatch(float n){ return mix(uHatchCol, uNHatchCol, n); }
float palHatchOpacity(float n){ return mix(uHatchOpacity, uNHatchOpacity, n); }
float palPaintC(float n){ return mix(uPaintC, uNPaintC, n); }
#endif
`
