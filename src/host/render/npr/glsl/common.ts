// Chunk `common` : hash, IGN (dithering), couverture de lignes AA, hachures à
// octaves imbriquées (Tonal Art Maps en procédural, NPR §4.4), pointillé.
// Tout motif est en espace objet/monde avec une densité ÉCRAN constante :
// jamais de trame en espace écran (elle « nage » avec la caméra).
export const common = /* glsl */ `
#ifndef NPR_CHUNK_COMMON
#define NPR_CHUNK_COMMON
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// Interleaved gradient noise : dithering avant stockage 8 bits (anti-banding des dégradés).
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float saturate1(float x){ return clamp(x, 0.0, 1.0); }
// Couverture AA de lignes parallèles : u coordonnée transverse, s espacement,
// du unités par pixel, wPx largeur (px). Largeur < 1 px -> opacité.
float lineCov(float u, float s, float du, float wPx){
  float d = abs(fract(u / s + 0.5) - 0.5) * s / du;
  return (1.0 - smoothstep(wPx * 0.5 - 0.5, wPx * 0.5 + 0.5, d)) * clamp(wPx, 0.0, 1.0);
}
// Hachures ancrées objet à espacement écran ~constant : les lignes d'espacement 2s
// sont un sous-ensemble de celles d'espacement s ; les impaires s'effacent avec la
// fraction de LOD -> ni pop, ni moiré, ni nage. du = |grad u| en unités/px, calculé
// HORS de toute branche.
float hatchU(float u, float du, float spacingPx, float wPx){
  du = max(du, 1e-6);
  float lod = log2(spacingPx * du);
  float l0 = floor(lod), t = lod - l0;
  float s = exp2(l0);
  float odd = mod(floor(u / s + 0.5), 2.0);
  return lineCov(u, s, du, wPx) * mix(1.0, 1.0 - t, odd);
}
// Ton -> couches : les traits naissent en épaississant (Webb 2002), la couche
// croisée n'arrive que pour les tons les plus sombres (creux).
float hatchTone(float tone, float u1, float du1, float u2, float du2, float spacingPx, float px){
  float w1 = clamp((tone - 0.20) * 4.0, 0.0, 1.0) * 1.1 * px;
  float w2 = clamp((tone - 0.60) * 4.0, 0.0, 1.0) * 1.0 * px;
  return max(hatchU(u1, du1, spacingPx, w1), hatchU(u2, du2, spacingPx, w2));
}
// Pointillé à grille régulière et octaves imbriquées (R14). p en unités de surface.
float stipple(vec2 p, float du, float tone, float cellPx, float dotPx){
  du = max(du, 1e-6);
  float lod = log2(cellPx * du), l0 = floor(lod), t = lod - l0, s = exp2(l0);
  vec2 cell = floor(p / s + 0.5);
  float d = length(p - cell * s) / du;
  float keep = step(hash12(cell * s), tone);
  float odd = max(mod(cell.x, 2.0), mod(cell.y, 2.0));
  return keep * mix(1.0, 1.0 - t, odd) * (1.0 - smoothstep(dotPx * 0.5 - 0.5, dotPx * 0.5 + 0.5, d));
}
// Pas AA générique : 0 -> 1 autour de e sur ~1 px (w = fwidth de x).
float aaStep(float e, float x, float w){ return smoothstep(e - w, e + w, x); }
#endif
`
