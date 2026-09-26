// Chunk `tint` : deux tons par objet, teintés par la lumière de la keyframe
// (ART_BIBLE §2.6, R6-R8). Tout se calcule en OKLab à partir de l'albédo :
//   objet (tours, décor) : éclairé = mix(A, sandLit, k) ; ombré = L × ratio, ab tiré à 55 % vers castShadow
//   oiseau               : éclairé = mix(A, mix(sun, sandLit, warm), k) ; ombré = (L × 0,867) tiré vers castShadow
// Derrière le front de nuit (n = 1) : formules « nuit » sur la palette KF-4.
// Requiert `palette`.
export const tint = /* glsl */ `
#ifndef NPR_CHUNK_TINT
#define NPR_CHUNK_TINT
#define NPR_FAMILY_OBJECT 0.0
#define NPR_FAMILY_BIRD 1.0
vec3 nprLitLab(vec3 albedoLab, float family, float n){
  vec4 K = mix(uTintK, uNTintK, n);
  vec3 lightLab = family < 0.5 ? mix(uLabSandLit, uNLabSandLit, n) : mix(uLabBirdLight, uNLabBirdLight, n);
  return mix(albedoLab, lightLab, family < 0.5 ? K.x : K.z);
}
vec3 nprShadeLab(vec3 litLab, vec3 albedoLab, float family, float n){
  vec4 K = mix(uTintK, uNTintK, n);
  vec3 castLab = mix(uLabCast, uNLabCast, n);
  if (family < 0.5) return vec3(litLab.x * K.y, mix(litLab.yz, castLab.yz, 0.55));
  return mix(vec3(albedoLab.x * 0.867, albedoLab.yz), castLab, K.w);
}
// Terminateur net à N·L = 0,05, AA sur ~1 px (fl = fwidth(ndl), calculé hors branche).
float nprTerminator(float ndl, float fl){ return smoothstep(0.05 - fl, 0.05 + fl, ndl); }
#endif
`
