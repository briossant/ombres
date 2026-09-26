// Chunk `night` : front de la Grande Ombre (GDD §7.1, ART_BIBLE §4.6).
// Un point est dans la nuit si dot(p, dir) < s + jag(dot(p, perp)) (sim, converti
// en xz three.js côté CPU). `nightDist` > 0 dans la nuit, en mètres. Le profil
// dentelé (±6 m) est une texture R32F lue en texelFetch + interpolation linéaire.
// Le masque AA se calcule dans main() (fwidth hors branche) :
//   float nd = nightDist(vWorld.xz); float nw = max(fwidth(nd), 1e-3);
//   float night = nightMask(nd, nw);
export const night = /* glsl */ `
#ifndef NPR_CHUNK_NIGHT
#define NPR_CHUNK_NIGHT
uniform float uNightOn, uNightS, uNightSpan, uNightAll, uNightJagN;
uniform vec2 uNightDir, uNightPerp;
uniform highp sampler2D uNightJag;
float nightJagAt(float q){
  float x = clamp((q + uNightSpan) / (2.0 * uNightSpan), 0.0, 1.0) * (uNightJagN - 1.0);
  int i = int(floor(x));
  int j = min(i + 1, int(uNightJagN) - 1);
  return mix(texelFetch(uNightJag, ivec2(i, 0), 0).r, texelFetch(uNightJag, ivec2(j, 0), 0).r, fract(x));
}
float nightDist(vec2 xz){
  return uNightOn > 0.5 ? uNightS + nightJagAt(dot(xz, uNightPerp)) - dot(xz, uNightDir) : -1e4;
}
float nightMask(float nd, float nw){ return max(uNightAll, smoothstep(-nw, nw, nd)); }
#endif
`
