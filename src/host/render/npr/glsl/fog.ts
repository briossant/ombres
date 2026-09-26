// Chunk `fog` : perspective atmosphérique (ART_BIBLE §6.4). Même fonction dans
// l'InkEffect pour le fondu des lignes « à la Sable ». uFogStart est réglé par
// frame pour que la brume reste ≤ 0,15 dans l'arène. Requiert `palette`.
export const fog = /* glsl */ `
#ifndef NPR_CHUNK_FOG
#define NPR_CHUNK_FOG
uniform float uFogK, uFogStart;
float fogAt(float d){ return 1.0 - exp(-max(d - uFogStart, 0.0) * uFogK); }
// Le lointain prend la couleur de l'horizon : le haut du cadre raccorde le sol au ciel.
vec3 fogColor(float f, float n){ return mix(palHaze(n), palHorizon(n), smoothstep(0.5, 0.9, f)); }
vec3 applyFog(vec3 col, float f, float n){ return mix(col, fogColor(f, n), f); }
#endif
`
