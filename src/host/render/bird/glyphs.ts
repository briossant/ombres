// Les 12 glyphes des joueurs (mode daltonien, ART_BIBLE §3.5) en champs de
// distance signée 2D, pour le fanion de l'oiseau et les jetons des FX.
// Ordre = index de couleur : croix, vagues, croissant, disque, triangle, carré,
// goutte, étoile, chevron, losange, anneau, éclair.
// Convention : le glyphe tient dans le carré [-1, 1]², distance < 0 = dedans.
import { PLAYER_COLORS } from '../../../shared/players.ts'

const ORDER = ['cross', 'waves', 'crescent', 'disc', 'triangle', 'square', 'drop', 'star', 'chevron', 'diamond', 'ring', 'bolt']

/** Index de glyphe (0..11) d'un index de couleur. */
export function glyphIndex(colorIndex: number): number {
  const g = PLAYER_COLORS[colorIndex]?.glyph
  const i = g ? ORDER.indexOf(g) : -1
  return i >= 0 ? i : colorIndex % 12
}

export const GLSL_GLYPHS = /* glsl */ `
float gSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float gBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float gTri(vec2 p, float r){
  const float k = 1.7320508;
  p.x = abs(p.x) - r; p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
float gStar(vec2 p, float r, float rf){
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
// Distance signée du glyphe k (0..11) au point p.
float glyphSdf(int k, vec2 p){
  if (k == 0) { float a = gBox(p, vec2(0.78, 0.24)); float b = gBox(p, vec2(0.24, 0.78)); return min(a, b) - 0.04; }
  if (k == 1) {
    float d = 1e5;
    for (int i = 0; i < 2; i++) {
      float y0 = i == 0 ? 0.3 : -0.3;
      vec2 q = p - vec2(0.0, y0);
      float w = 0.22 * sin(q.x * 3.6);
      float dd = abs(q.y - w) / sqrt(1.0 + pow(0.22 * 3.6 * cos(q.x * 3.6), 2.0));
      dd = max(dd, abs(q.x) - 0.82);
      d = min(d, dd - 0.13);
    }
    return d;
  }
  if (k == 2) { float a = length(p) - 0.82; float b = length(p - vec2(0.36, 0.2)) - 0.66; return max(a, -b); }
  if (k == 3) return length(p) - 0.72;
  if (k == 4) return gTri(p - vec2(0.0, -0.08), 0.8) - 0.04;
  if (k == 5) return gBox(p, vec2(0.62)) - 0.06;
  if (k == 6) { vec2 q = p - vec2(0.0, -0.22); float c = length(q) - 0.56; float t = gTri(vec2(q.x, q.y - 0.62), 0.5); return min(c, max(t, q.y - 0.95)) ; }
  if (k == 7) return gStar(p * vec2(1.0, -1.0) * -1.0 + vec2(0.0, 0.06), 0.9, 0.45);
  if (k == 8) { return min(gSeg(p, vec2(-0.7, -0.35), vec2(0.0, 0.35)), gSeg(p, vec2(0.7, -0.35), vec2(0.0, 0.35))) - 0.18; }
  if (k == 9) { vec2 q = abs(p); return (q.x + q.y - 0.86) * 0.7071; }
  if (k == 10) return abs(length(p) - 0.6) - 0.18;
  float a = gSeg(p, vec2(0.28, 0.85), vec2(-0.25, 0.02));
  float b = gSeg(p, vec2(-0.25, 0.02), vec2(0.25, 0.02));
  float c = gSeg(p, vec2(0.25, 0.02), vec2(-0.28, -0.85));
  return min(min(a, b), c) - 0.14;
}
`
