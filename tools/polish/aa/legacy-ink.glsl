
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform highp sampler2D tDepth;
uniform sampler2D uNoise;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uInk, uNInk, uHaze, uNHaze, uSkyHorizon, uNSkyHorizon;
uniform float uFogK, uFogStart;
uniform vec2 uThickRange;
uniform float uThick, uWobble, uPaper, uDepthK, uNormalK, uFlash, uVignette, uSketch, uSketchFront, uSketchSpan;
uniform int uDebug;

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

float linZ(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).r, cameraNear, cameraFar); }
vec3 nrm(vec4 t){ return t.xyz * 2.0 - 1.0; }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  float s = resolution.y / 1080.0;
  vec3 base = texture2D(tColor, uv).rgb;                 // couleur MRT (pas inputBuffer)
  float d0 = texture2D(tDepth, uv).r;
  vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, d0 * 2.0 - 1.0, 1.0);
  vp /= vp.w;
  vec3 wpos = (uCamWorld * vp).xyz;
  float dist = length(vp.xyz);
  float fog = 1.0 - exp(-max(dist - uFogStart, 0.0) * uFogK);
  // R5 : tremblé basse fréquence ANCRÉ DANS LE MONDE
  vec2 wob = texture2D(uNoise, wpos.xz * (1.0 / 37.0) + wpos.y * (1.0 / 53.0)).rg - 0.5;
  vec2 c = uv + wob * 2.0 * uWobble * s * texelSize;
  // R2 : plus épais devant, plus fin au loin (< 1 px -> opacité)
  float wgt = uThick * s * mix(1.0, 0.5, smoothstep(uThickRange.x, uThickRange.y, dist));
  vec2 o = texelSize * max(wgt, 1.0);
  float z0 = linZ(c);
  float w0 = 1.0 / z0;
  float wl = 1.0 / linZ(c - vec2(o.x, 0.0)), wr = 1.0 / linZ(c + vec2(o.x, 0.0));
  float wd = 1.0 / linZ(c - vec2(0.0, o.y)), wu = 1.0 / linZ(c + vec2(0.0, o.y));
  float lap = min(wl + wr, wd + wu) - 2.0 * w0;           // le plus négatif = centre devant ses voisins
  float eDepth = smoothstep(uDepthK, 2.0 * uDepthK, -lap / w0) * min(wgt, 1.0);
  // plis (normales, anneau de 1 px) + frontières d'ID (R3)
  vec2 o1 = texelSize * max(s, 1.0);
  vec4 t0 = texture2D(tNormal, c);
  vec4 tl = texture2D(tNormal, c - vec2(o1.x, 0.0)), tr = texture2D(tNormal, c + vec2(o1.x, 0.0));
  vec4 td = texture2D(tNormal, c - vec2(0.0, o1.y)), tu = texture2D(tNormal, c + vec2(0.0, o1.y));
  vec3 n0 = nrm(t0);
  // trame de dissolution (ID 254, polish W9) : ni trait sur ses pixels, ni frontière avec eux
  float sdC = step(253.5 / 255.0, t0.a);
  vec4 keep = 1.0 - step(vec4(253.5 / 255.0), vec4(tl.a, tr.a, td.a, tu.a));
  float dn = max(max((1.0 - dot(n0, nrm(tl))) * keep.x, (1.0 - dot(n0, nrm(tr))) * keep.y), max((1.0 - dot(n0, nrm(td))) * keep.z, (1.0 - dot(n0, nrm(tu))) * keep.w));
  float eNormal = smoothstep(uNormalK, 1.8 * uNormalK, dn) * step(1.5 / 255.0, t0.a);
  float eId = step(0.5 / 255.0, max(max(abs(tl.a - t0.a) * keep.x, abs(tr.a - t0.a) * keep.y), max(abs(td.a - t0.a) * keep.z, abs(tu.a - t0.a) * keep.w)))
            * step(1.5 / 255.0, t0.a);                   // pas sur le sol (1) ni le ciel (0)
  float interior = max(eNormal, eId) * 0.85 * (1.0 - smoothstep(0.4, 0.5, fog));   // R4 : plus de traits internes au-delà de 0,5
  float isSky = step(t0.a, 0.5 / 255.0) * step(cameraFar * 0.5, z0);
  float edge = max(eDepth, interior) * (1.0 - isSky) * (1.0 - smoothstep(0.35, 0.85, fog)) * (1.0 - sdC);   // R4 : fondu « Sable »
  // encre : jour/nuit selon le front, se brume au loin (R1)
  float nd = nightDist(wpos.xz);
  float n = max(uNightAll, step(0.0, nd));
  vec3 haze = mix(mix(uHaze, uNHaze, n), mix(uSkyHorizon, uNSkyHorizon, n), smoothstep(0.5, 0.9, fog));
  vec3 ink = mix(mix(uInk, uNInk, n), haze, fog * 0.8);
  // flash « planche » : la couleur recule vers le papier, les traits restent (crayonné) ; au compte
  // à rebours, crayonné tenu à l'est du front de couleur qui coule d'ouest en est (W13)
  float sketch = 0.0;
  if (uSketch > 0.0) sketch = uSketch * smoothstep(uSketchFront - 8.0, uSketchFront + 8.0, clamp(wpos.x, -uSketchSpan, uSketchSpan));
  base = mix(base, vec3(0.930, 0.871, 0.776), 0.7 * max(uFlash, sketch));
  vec3 col = mix(base, ink, edge);
  col *= 1.0 - uPaper * (texture2D(uNoise, uv * resolution / (256.0 * s)).a - 0.4);   // R21 : grain statique
  vec2 vv = uv - 0.5;
  col *= 1.0 - uVignette * dot(vv, vv);                   // R22 : vignette ≤ 5 %
  if (uDebug == 1) col = vec3(1.0 - edge);
  if (uDebug == 2) col = t0.xyz;
  if (uDebug == 3) col = vec3(fract(z0 / 50.0));
  if (uDebug == 4) col = vec3(fract(t0.a * 255.0 / 7.0), fract(t0.a * 255.0 / 3.0), t0.a * 2.0);
  outputColor = vec4(col, 1.0);
}
