// Chunk `hatch` : coordonnées de hachure selon la forme (R12) et application.
// - Fûts, dômes, bulbes (révolution) : u = angle autour de l'axe × rayon de
//   référence ; la couture d'atan est tournée vers la face au soleil (jamais
//   hachurée). Les lignes sont des méridiens : verticales sur les fûts, qui
//   convergent sur les dômes, comme chez un dessinateur.
// - Assets quelconques : attribut `hatchUv` (x = coordonnée transverse, en m).
// - Oiseau : x objet (lignes le long de la corde), ventre seulement.
// Requiert `common` et `palette`.
export const hatch = /* glsl */ `
#ifndef NPR_CHUNK_HATCH
#define NPR_CHUNK_HATCH
// p : position objet (axe de révolution = Y), sunXZ : direction horizontale du soleil (objet).
float hatchCylU(vec3 p, vec2 sunXZ, float refRadius){
  vec2 sd = normalize(sunXZ + vec2(1e-5, 0.0));
  vec2 pr = vec2(-dot(p.xz, sd), sd.x * p.z - sd.y * p.x);
  return atan(pr.y, pr.x) * refRadius;
}
// Couverture des hachures d'un flanc à l'ombre. shade = 1 - lumière (0..1),
// cavity < 0,35 -> couche croisée à 90°. u2 = coordonnée de la couche croisée.
float hatchShade(float u, float du, float u2, float du2, float shade, float cavity, float px){
  float h = hatchU(u, du, 6.0 * px, 1.0 * px);
  float h2 = hatchU(u2, du2, 6.0 * px, 1.0 * px) * (1.0 - smoothstep(0.25, 0.35, cavity));
  return max(h, h2) * shade;
}
#endif
`
