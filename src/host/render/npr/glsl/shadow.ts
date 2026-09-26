// Chunk `shadow` : lecture de la height shadow map en espace sol (NPR §4.5).
//
// Texel = caster le plus haut le long du rayon solaire passant par ce point du sol :
//   R = hauteur + 100 (le clear à 0 ne fait jamais d'ombre)
//   G = code propriétaire (0 = neutre : tours, décor ; 1..12 = slot + 1 : oiseaux)
//   B = force / opacité (tours 1 ; âme d'oiseau 1,0 / 0,6 ; empreinte 0,7 / 0,35)
//   A = type (1 = caster solide, 2 = empreinte qui peint, 3 = empreinte qui ne peint pas)
// Deux cascades : proche (arène, ~0,2 m/texel) et lointaine (dunes, horizon).
//
// sampleShadow(wp, bias) renvoie vec4(couverture 0..1, code, force, type) ; la
// couverture est la moyenne bilinéaire des 4 tests binaires : le contour à 0,5 est
// net, on l'antialiase avec fwidth dans l'appelant (HORS branche).
export const shadow = /* glsl */ `
#ifndef NPR_CHUNK_SHADOW
#define NPR_CHUNK_SHADOW
uniform highp sampler2D uShadowMap;
uniform highp sampler2D uShadowMapFar;
uniform highp sampler2D uShadowMapFocus;
uniform vec4 uShadowArea;     // (cx, cz, demi-taille, plage de hauteur)
uniform vec4 uShadowAreaFar;
uniform vec4 uShadowAreaFocus; // (cx, cz, demi-taille, active)
uniform float uShadowRes, uShadowResFar, uShadowResFocus;
vec4 shadowTaps(highp sampler2D map, float res, vec2 uv, float ref){
  vec2 tc = uv * res - 0.5;
  vec2 f = fract(tc);
  ivec2 i0 = ivec2(floor(tc));
  ivec2 mx = ivec2(int(res) - 1);
  vec4 a = texelFetch(map, clamp(i0, ivec2(0), mx), 0);
  vec4 b = texelFetch(map, clamp(i0 + ivec2(1, 0), ivec2(0), mx), 0);
  vec4 c = texelFetch(map, clamp(i0 + ivec2(0, 1), ivec2(0), mx), 0);
  vec4 d = texelFetch(map, clamp(i0 + ivec2(1, 1), ivec2(0), mx), 0);
  vec4 s = step(vec4(ref), vec4(a.r, b.r, c.r, d.r));
  float v = mix(mix(s.x, s.y, f.x), mix(s.z, s.w, f.x), f.y);
  vec4 hi = a;
  if (b.r > hi.r) hi = b;
  if (c.r > hi.r) hi = c;
  if (d.r > hi.r) hi = d;
  return vec4(v, hi.g, hi.b, hi.a);
}
vec2 shadowProject(vec3 wp){ return wp.xz - wp.y * uSunDir.xz / max(uSunDir.y, 0.035); }
// Variante lissée (B-spline quadratique 3×3 des tests binaires) : le contour à 0,5 est
// arrondi au lieu de suivre la grille des texels (escaliers visibles en plan rapproché).
vec4 shadowTaps9(highp sampler2D map, float res, vec2 uv, float ref){
  vec2 g = uv * res;
  vec2 c = floor(g);
  vec2 f = g - c - 0.5;
  ivec2 ic = ivec2(c);
  ivec2 mx = ivec2(int(res) - 1);
  vec3 wx = vec3(0.5 * (0.5 - f.x) * (0.5 - f.x), 0.75 - f.x * f.x, 0.5 * (0.5 + f.x) * (0.5 + f.x));
  vec3 wy = vec3(0.5 * (0.5 - f.y) * (0.5 - f.y), 0.75 - f.y * f.y, 0.5 * (0.5 + f.y) * (0.5 + f.y));
  float v = 0.0;
  vec4 hi = vec4(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec4 t = texelFetch(map, clamp(ic + ivec2(i, j), ivec2(0), mx), 0);
      v += wx[i + 1] * wy[j + 1] * step(ref, t.r);
      if (t.r > hi.r) hi = t;
    }
  }
  return vec4(v, hi.g, hi.b, hi.a);
}
vec4 sampleShadowSmooth(vec3 wp, float bias){
  vec2 p0 = shadowProject(wp);
  float ref = wp.y + 100.0 + bias;
  if (uShadowAreaFocus.w > 0.5) {
    vec2 uvc = (p0 - uShadowAreaFocus.xy) / (2.0 * uShadowAreaFocus.z) + 0.5;
    if (all(greaterThan(uvc, vec2(0.002))) && all(lessThan(uvc, vec2(0.998)))) return shadowTaps9(uShadowMapFocus, uShadowResFocus, uvc, ref);
  }
  vec2 uv = (p0 - uShadowArea.xy) / (2.0 * uShadowArea.z) + 0.5;
  if (all(greaterThan(uv, vec2(0.001))) && all(lessThan(uv, vec2(0.999)))) return shadowTaps9(uShadowMap, uShadowRes, uv, ref);
  vec2 uvf = (p0 - uShadowAreaFar.xy) / (2.0 * uShadowAreaFar.z) + 0.5;
  if (all(greaterThan(uvf, vec2(0.0))) && all(lessThan(uvf, vec2(1.0)))) return shadowTaps9(uShadowMapFar, uShadowResFar, uvf, ref);
  return vec4(0.0);
}
vec4 sampleShadow(vec3 wp, float bias){
  vec2 p0 = shadowProject(wp);
  float ref = wp.y + 100.0 + bias;
  if (uShadowAreaFocus.w > 0.5) {
    vec2 uvc = (p0 - uShadowAreaFocus.xy) / (2.0 * uShadowAreaFocus.z) + 0.5;
    if (all(greaterThan(uvc, vec2(0.002))) && all(lessThan(uvc, vec2(0.998)))) return shadowTaps(uShadowMapFocus, uShadowResFocus, uvc, ref);
  }
  vec2 uv = (p0 - uShadowArea.xy) / (2.0 * uShadowArea.z) + 0.5;
  if (all(greaterThan(uv, vec2(0.001))) && all(lessThan(uv, vec2(0.999)))) return shadowTaps(uShadowMap, uShadowRes, uv, ref);
  vec2 uvf = (p0 - uShadowAreaFar.xy) / (2.0 * uShadowAreaFar.z) + 0.5;
  if (all(greaterThan(uvf, vec2(0.0))) && all(lessThan(uvf, vec2(1.0)))) return shadowTaps(uShadowMapFar, uShadowResFar, uvf, ref);
  return vec4(0.0);
}
#endif
`
