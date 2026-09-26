// Formes plates des FX « encre » (ART_BIBLE §6.8) en champs de distance 2D.
// Repère local : la forme tient dans [-1, 1]², y vers le haut de l'écran.
// Chaque forme fournit deux distances (unités locales, < 0 = dedans) :
//   dBody : le corps rempli (couleur de remplissage, cerné d'encre) ;
//   dInk  : le détail intérieur dessiné à l'encre (couleur de trait).
import { GLSL_GLYPHS } from '../bird/glyphs.ts'

export const SHAPE = {
  puff: 0,
  feather: 1,
  chevron: 2,
  bang: 3,
  eyeSlash: 4,
  featherIcon: 5,
  glyphToken: 6,
  ring: 7,
  cross4: 8,
  dot: 9,
  clod: 10,
  arc: 11,
} as const

export type ShapeId = (typeof SHAPE)[keyof typeof SHAPE]

export const GLSL_SHAPES = /* glsl */ `
${GLSL_GLYPHS}
float sSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
// Plume : vexille asymétrique en amande + rachis.
float sFeather(vec2 p){
  vec2 q = p; q.x -= 0.08 * (q.y + 1.0) * (q.y - 1.0) * -0.6;
  float w = 0.34 * sqrt(max(0.0, 1.0 - q.y * q.y)) * (q.x > 0.0 ? 1.0 : 0.78);
  return max(abs(q.x) - w, abs(q.y) - 0.98);
}
float sEye(vec2 p){
  // Amande : intersection de deux disques.
  float a = length(p - vec2(0.0, -0.55)) - 0.95;
  float b = length(p - vec2(0.0, 0.55)) - 0.95;
  return max(a, b);
}
void fxShape(int k, vec2 p, vec4 prm, out float dBody, out float dInk){
  dBody = 1e3; dInk = 1e3;
  if (k == ${SHAPE.puff}) {
    // Disque festonné (4 à 6 lobes).
    float a = atan(p.y, p.x);
    float lobes = prm.y;
    float r = 0.8 + 0.12 * cos(lobes * a + prm.z * 6.2831);
    dBody = length(p) - r;
  } else if (k == ${SHAPE.feather}) {
    dBody = sFeather(p);
    dInk = abs(p.x - 0.08 * (p.y + 1.0) * (p.y - 1.0) * -0.6) - 0.035;
    dInk = max(dInk, abs(p.y + 0.12) - 0.95);
  } else if (k == ${SHAPE.chevron}) {
    dBody = min(sSeg(p, vec2(-0.78, 0.42), vec2(0.0, -0.42)), sSeg(p, vec2(0.78, 0.42), vec2(0.0, -0.42))) - 0.26;
  } else if (k == ${SHAPE.bang}) {
    dBody = length(p) - 0.92;
    float bar = sSeg(p, vec2(0.0, 0.52), vec2(0.0, -0.12)) - 0.15 + 0.06 * (p.y - 0.2);
    float dotd = length(p - vec2(0.0, -0.47)) - 0.15;
    dInk = min(bar, dotd);
  } else if (k == ${SHAPE.eyeSlash}) {
    dBody = length(p) - 0.92;
    vec2 q = p * 1.45;
    float e = abs(sEye(q)) - 0.09;
    float pupil = length(q) - 0.26;
    float slash = sSeg(p, vec2(-0.6, -0.6), vec2(0.6, 0.6)) - 0.09;
    dInk = min(min(e / 1.45, pupil / 1.45), slash);
  } else if (k == ${SHAPE.featherIcon}) {
    dBody = length(p) - 0.92;
    vec2 q = vec2(p.x * 0.7071 - p.y * 0.7071, p.x * 0.7071 + p.y * 0.7071) * 1.25;
    float v = abs(sFeather(q)) - 0.07;
    float r = max(abs(q.x - 0.08 * (q.y + 1.0) * (q.y - 1.0) * -0.6) - 0.05, abs(q.y) - 1.05);
    dInk = min(v, r) / 1.25;
  } else if (k == ${SHAPE.glyphToken}) {
    dBody = length(p) - 0.92;
    dInk = glyphSdf(int(prm.x + 0.5), p * 1.75) / 1.75;
  } else if (k == ${SHAPE.ring}) {
    dInk = abs(length(p) - 0.85) - prm.y;
  } else if (k == ${SHAPE.cross4}) {
    vec2 q = abs(p);
    float arm = min(sSeg(q, vec2(0.0), vec2(1.0, 0.0)), sSeg(q, vec2(0.0), vec2(0.0, 1.0)));
    dInk = arm - 0.2 * (1.0 - max(q.x, q.y));
  } else if (k == ${SHAPE.dot}) {
    dBody = length(p) - 0.8;
  } else if (k == ${SHAPE.clod}) {
    dInk = length(p / vec2(1.0, 0.55)) * 0.55 - 0.5;
  } else if (k == ${SHAPE.arc}) {
    // Arc de souffle (esquive) : deux arcs concentriques centrés sur +x, épais au milieu,
    // effilés aux extrémités ; prm.x = demi-ouverture (rad), prm.y = épaisseur relative.
    float a = atan(p.y, p.x);
    float t = clamp(1.0 - abs(a) / max(prm.x, 1e-3), 0.0, 1.0);
    float w = prm.y * sqrt(t);
    float r = length(p);
    float d1 = abs(r - 0.86) - w;
    float d2 = abs(r - 0.64) - w * 0.7;
    float cut = (abs(a) - prm.x) * r;
    dInk = max(min(d1, d2), cut);
  }
}
`
