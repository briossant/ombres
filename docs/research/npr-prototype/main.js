// NPR prototype v3 for "Ombres" (reference for docs/research/npr-techniques.md), style rules from moebius-style.md (R1-R25)
//  - MRT g-buffer: color (sRGB8) + viewNormal/objectId (RGBA8) + depth (float) -> single ink/paper post Effect (pmndrs)
//  - ground-space "height shadow map" (oblique sun projection), flat un-inked cast shadows tinted per player (R9)
//  - territory DataTexture -> bilinear classification -> OKLab pigment wash + darker rim band, no ink (D6)
//  - hatching only on shaded sides of towers / bird bellies, object-space, screen-density-stable octaves (R11-R13)
//  - pebbles/dashes instanced with analytic micro-shadows that lengthen with the sun (R15), crest lines (R16)
//  - flat sky: 3 stops + strata bands + scalloped SDF cumulus + sun disc with 1 flat halo (R17-R18)
// URL flags: sun=<deg> az=<deg> view=game|low|top|far|close q=low|medium|high debug=1(edges)|2(normals)|3(depth)
//   terr=bilin|smooth|nearest cb=1 (colour-blind territory patterns) shadowline=1 (player rim on bird shadows)
//   hdr=1 segs=<n> noaa=1 calib=1 nosky=1 nopebbles=1 basic=1|patched (MRT pitfall demo)
// GPU timings (EXT_disjoint_timer_query_webgl2) land in window.__timings after 240 frames.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer, EffectPass, Effect, Pass, FXAAEffect, SMAAEffect, BlendFunction, EffectAttribute } from 'postprocessing';

const Q = new URLSearchParams(location.search);
const SUN_ELEV = parseFloat(Q.get('sun') ?? '35');
const SUN_AZ = parseFloat(Q.get('az') ?? '200');
const VIEW = Q.get('view') ?? 'game';
const DEBUG = parseInt(Q.get('debug') ?? '0');
const PRESET = Q.get('q') ?? 'high';
const TERR_MODE = { nearest: 0, bilin: 1, smooth: 2 }[Q.get('terr') ?? 'bilin'];
const F = { segs: parseInt(Q.get('segs') ?? '200'), ldr: !Q.get('hdr'), noaa: Q.get('noaa'), nosky: Q.get('nosky'), pebbles: !Q.get('nopebbles') };
const W = innerWidth, H = innerHeight;
const P = {
  low:    { dpr: 0.75, shadowRes: 1024, aa: 'none', thick: 1.0,  wobble: 0.0, paper: 0.0,  hatch: 0, pebbles: 800 },
  medium: { dpr: 1.0,  shadowRes: 2048, aa: 'smaa', thick: 1.25, wobble: 0.7, paper: 0.04, hatch: 1, pebbles: 1500 },
  high:   { dpr: 1.0,  shadowRes: 2048, aa: 'smaa', thick: 1.5,  wobble: 0.7, paper: 0.04, hatch: 1, pebbles: 2200 },
}[PRESET];

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, depth: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(P.dpr);             // presets scale the whole pipeline (browser upscales the canvas for free)
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const RW = Math.round(W * P.dpr), RH = Math.round(H * P.dpr);

// ---------------------------------------------------------------- OKLab helpers + palette keyed on sun elevation
const s2l = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hexToLin = h => { const n = parseInt(h.slice(1), 16); return [s2l((n >> 16 & 255) / 255), s2l((n >> 8 & 255) / 255), s2l((n & 255) / 255)]; };
function linToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function oklabToLin([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map(v => Math.max(0, v));
}
const oklch = (L, C, hDeg) => oklabToLin([L, C * Math.cos(hDeg * Math.PI / 180), C * Math.sin(hDeg * Math.PI / 180)]);
const col3 = lin => new THREE.Color().setRGB(lin[0], lin[1], lin[2], THREE.LinearSRGBColorSpace);
const PAL = await (await fetch('./moebius-palettes.json')).json();
function paletteAt(e) {
  const K = [...PAL.keyframes].sort((a, b) => a.sunElevationDeg - b.sunElevationDeg);
  let a = K[0], b = K[K.length - 1];
  for (let i = 0; i < K.length - 1; i++) if (e >= K[i].sunElevationDeg && e <= K[i + 1].sunElevationDeg) { a = K[i]; b = K[i + 1]; }
  const t = THREE.MathUtils.clamp((e - a.sunElevationDeg) / Math.max(b.sunElevationDeg - a.sunElevationDeg, 1e-3), 0, 1);
  const out = {};
  for (const k of Object.keys(a.hex)) {
    const A = linToOklab(hexToLin(a.hex[k])), B = linToOklab(hexToLin(b.hex[k]));
    out[k] = col3(oklabToLin(A.map((v, i) => v + (B[i] - v) * t)));   // interpolate in OKLab, never in sRGB
  }
  return out;
}
const pal = paletteAt(SUN_ELEV);
// 12 player hues, OKLCH L 0.68 C 0.13 (placeholder until the colour/daltonism agent decides)
const HUES = [28, 55, 95, 128, 155, 185, 215, 245, 275, 305, 335, 5];
const playerCols = [new THREE.Color(0, 0, 0), ...HUES.map(h => col3(oklch(0.68, 0.13, h)))];
const playerAB = [new THREE.Vector2(0, 0), ...HUES.map(h => new THREE.Vector2(Math.cos(h * Math.PI / 180), Math.sin(h * Math.PI / 180)))];
// cast shadow colours: [0] = neutral castShadow (towers), [i] = castShadow tinted with player hue (same L, C 0.06) (R9)
const castLab = linToOklab([pal.castShadow.r, pal.castShadow.g, pal.castShadow.b]);
const shadowCols = [pal.castShadow.clone(), ...HUES.map(h => col3(oklch(castLab[0], 0.06, h)))];
// tower own-shade = sandShade shifted +10 deg towards violet (moebius-style.md §5)
const ss = linToOklab([pal.sandShade.r, pal.sandShade.g, pal.sandShade.b]);
const ssC = Math.hypot(ss[1], ss[2]), ssH = Math.atan2(ss[2], ss[1]) + 10 * Math.PI / 180;
const towerShade = col3(oklabToLin([ss[0], ssC * Math.cos(ssH), ssC * Math.sin(ssH)]));
const sunsetK = THREE.MathUtils.clamp((16 - SUN_ELEV) / 12.5, 0, 1); // 0 by day -> 1 at K3

const el = THREE.MathUtils.degToRad(Math.max(SUN_ELEV, 2.0)), az = THREE.MathUtils.degToRad(SUN_AZ);
const sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();

// ---------------------------------------------------------------- shared GLSL
const COMMON = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); } // dithering
// anti-aliased coverage of parallel lines: u = coordinate across lines, s = spacing, du = units per pixel, wPx = width (px)
float lineCov(float u, float s, float du, float wPx){
  float d = abs(fract(u/s + 0.5) - 0.5) * s / du;
  return (1.0 - smoothstep(wPx*0.5 - 0.5, wPx*0.5 + 0.5, d)) * clamp(wPx, 0.0, 1.0);
}
// Object/world-anchored hatching whose SCREEN spacing stays ~constant: octave nesting (Tonal Art Maps, fractal dithering):
// lines of spacing 2s are a subset of lines of spacing s; odd lines fade with the fractional LOD -> no popping, no moire.
float hatchU(float u, float du, float spacingPx, float wPx){
  du = max(du, 1e-6);
  float lod = log2(spacingPx * du);
  float l0 = floor(lod), t = lod - l0;
  float s = exp2(l0);
  float odd = mod(floor(u/s + 0.5), 2.0);
  return lineCov(u, s, du, wPx) * mix(1.0, 1.0 - t, odd);
}
vec3 lin2oklab(vec3 c){
  vec3 lms = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * c;
  lms = pow(max(lms, vec3(0.0)), vec3(1.0/3.0));
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660) * lms;
}
vec3 oklab2lin(vec3 c){
  vec3 lms = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.2914855480) * c;
  lms = lms * lms * lms;
  return max(mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147, 0.2309699292, -0.3413193965, 1.7076147010) * lms, vec3(0.0));
}
`;
const SHADOW = /* glsl */`
uniform sampler2D uShadowMap; uniform vec4 uShadowArea; uniform vec3 uSunDir; uniform float uShadowRes;
// Ground-space height shadow map: texel = highest caster along the sun ray through that ground point.
// returns x = bilinear-filtered binary compare (0..1), y = caster id, z = caster strength
vec3 sampleShadow(vec3 wp, float bias){
  vec2 p0 = wp.xz - wp.y * uSunDir.xz / uSunDir.y;
  vec2 uv = (p0 - uShadowArea.xy) / (2.0*uShadowArea.z) + 0.5;
  vec2 tc = uv * uShadowRes - 0.5;
  vec2 f = fract(tc); ivec2 i0 = ivec2(floor(tc)); ivec2 mx = ivec2(int(uShadowRes) - 1);
  vec4 a = texelFetch(uShadowMap, clamp(i0, ivec2(0), mx), 0);
  vec4 b = texelFetch(uShadowMap, clamp(i0 + ivec2(1,0), ivec2(0), mx), 0);
  vec4 c = texelFetch(uShadowMap, clamp(i0 + ivec2(0,1), ivec2(0), mx), 0);
  vec4 d = texelFetch(uShadowMap, clamp(i0 + ivec2(1,1), ivec2(0), mx), 0);
  float r = wp.y + 100.0 + bias;                 // heights stored +100 so that "cleared" (0) never shadows
  vec4 s = step(vec4(r), vec4(a.r, b.r, c.r, d.r));
  float v = mix(mix(s.x, s.y, f.x), mix(s.z, s.w, f.x), f.y);
  vec4 hi = a; if (b.r > hi.r) hi = b; if (c.r > hi.r) hi = c; if (d.r > hi.r) hi = d;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return vec3(v * inside, hi.g, hi.b);
}
`;
const MRT_OUT = `layout(location = 1) out highp vec4 gNormalId;\n`;
const FOG = /* glsl */`uniform float uFogDensity; float fogAt(float d){ return 1.0 - exp(-d * uFogDensity); }\n`;

// ---------------------------------------------------------------- ground-space height shadow map
const SHADOW_AREA = new THREE.Vector4(0, 0, 220, 400); // cx, cz, halfSize (m), height range (m)
const shadowRT = new THREE.WebGLRenderTarget(P.shadowRes, P.shadowRes, {
  type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false,
});
const shadowScene = new THREE.Scene();
const shadowCam = new THREE.OrthographicCamera(); // ignored by the caster shader; proxies are not frustum-culled
function makeCasterMaterial(id, scale = 1, strength = 1) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uSunDir: { value: sunDir }, uArea: { value: SHADOW_AREA }, uId: { value: id }, uScale: { value: scale }, uStrength: { value: strength } },
    vertexShader: /* glsl */`
      uniform vec3 uSunDir; uniform vec4 uArea; uniform float uScale; varying float vH;
      void main(){
        vec4 wp = modelMatrix * vec4(position * uScale, 1.0);   // gameplay: shadow scale grows with altitude
        vec2 p0 = wp.xz - wp.y * uSunDir.xz / uSunDir.y;          // oblique projection along the sun ray onto y = 0
        vH = wp.y;
        float z = 1.0 - 2.0 * clamp((wp.y + 100.0) / uArea.w, 0.0, 1.0); // higher = nearer: depth test keeps the max height
        gl_Position = vec4((p0 - uArea.xy) / uArea.z, z, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uId; uniform float uStrength; varying float vH;
      void main(){ gl_FragColor = vec4(vH + 100.0, uId, uStrength, 1.0); }`,
  });
}
function addCaster(mesh, id, scale = 1, strength = 1) {
  const proxy = new THREE.Mesh(mesh.geometry, makeCasterMaterial(id, scale, strength));
  proxy.matrixAutoUpdate = false; proxy.matrixWorldAutoUpdate = false; proxy.frustumCulled = false;
  proxy.matrixWorld = mesh.matrixWorld;   // shared reference: call scene.updateMatrixWorld() before the shadow pass
  shadowScene.add(proxy);
}

// ---------------------------------------------------------------- g-buffer (MRT)
const gbuffer = new THREE.WebGLRenderTarget(RW, RH, {
  count: 2, type: F.ldr ? THREE.UnsignedByteType : THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  depthBuffer: true, depthTexture: new THREE.DepthTexture(RW, RH, THREE.FloatType), generateMipmaps: false,
});
if (F.ldr) gbuffer.textures[0].colorSpace = THREE.SRGBColorSpace;     // 8-bit sRGB storage: no dark banding
gbuffer.textures[1].type = THREE.UnsignedByteType;                     // view normal (rgb) + object id (a)

// ---------------------------------------------------------------- scene & shared uniforms
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, W / H, 1, 9000);
const U = {
  uSunDir: { value: sunDir }, uShadowMap: { value: shadowRT.texture }, uShadowArea: { value: SHADOW_AREA }, uShadowRes: { value: P.shadowRes },
  uInk: { value: pal.ink }, uHaze: { value: pal.haze }, uFogDensity: { value: 0.0011 }, uPx: { value: RH / 1080 }, uHatch: { value: P.hatch },
  uShadowCols: { value: shadowCols }, uCastShadow: { value: pal.castShadow },
};

// tileable noise texture: R,G = low-freq warp, B = mid-freq, A = fine grain (paper)
function makeNoiseTex(N = 256) {
  const d = new Uint8Array(N * N * 4);
  const h = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  const noise = (x, y, per, s) => { const X = x * per / N, Y = y * per / N; const ix = Math.floor(X), iy = Math.floor(Y), fx = X - ix, fy = Y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const w = i => ((i % per) + per) % per;
    const a = h(w(ix), w(iy), s), b = h(w(ix + 1), w(iy), s), c = h(w(ix), w(iy + 1), s), e = h(w(ix + 1), w(iy + 1), s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    d[i] = 255 * (noise(x, y, 6, 1) * 0.7 + noise(x, y, 16, 2) * 0.3);
    d[i + 1] = 255 * (noise(x, y, 6, 3) * 0.7 + noise(x, y, 16, 4) * 0.3);
    d[i + 2] = 255 * (noise(x, y, 8, 5) * 0.6 + noise(x, y, 32, 6) * 0.4);
    d[i + 3] = 255 * (noise(x, y, 128, 7) * 0.45 + noise(x, y, 256, 8) * 0.35 + noise(x, y, 32, 9) * 0.2);
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
const noiseTex = makeNoiseTex();

// dunes (CPU heights so every pass sees the same geometry) + per-vertex crest phase for inked crest lines (R16)
function n2(x, z) { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); }
function vn(x, z) { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz; const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = n2(ix, iz), b = n2(ix + 1, iz), c = n2(ix, iz + 1), d = n2(ix + 1, iz + 1); return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz; }
function dune(x, z) {
  const r = Math.hypot(x, z); const fall = 1 - THREE.MathUtils.smoothstep(r, 650, 900);
  const u = x * 0.8 + z * 0.35, v = -x * 0.35 + z * 0.8;
  const warp = vn(x / 120, z / 120) * 6.0;
  const phase = u / 34 + warp;                        // crest where sin(phase) = 0
  const amp = 5.5 * (0.5 + vn(x / 200 + 3, z / 200) * 0.8) * fall;
  const ridge = 1 - Math.abs(Math.sin(phase));
  const h = Math.pow(ridge, 2.2) * amp + Math.sin(v / 55 + warp * 0.5) * 1.2 * fall - 1.5 * fall;
  return { h, phase: phase / Math.PI, amp };
}
const duneH = (x, z) => dune(x, z).h;
const groundGeo = new THREE.PlaneGeometry(1800, 1800, F.segs, F.segs).rotateX(-Math.PI / 2);
{
  const pos = groundGeo.attributes.position; const crest = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { const d = dune(pos.getX(i), pos.getZ(i)); pos.setY(i, d.h); crest[i * 2] = d.phase; crest[i * 2 + 1] = d.amp; }
  groundGeo.setAttribute('crest', new THREE.BufferAttribute(crest, 2)); groundGeo.computeVertexNormals();
}
const farGeo = new THREE.RingGeometry(880, 9000, 64, 1).rotateX(-Math.PI / 2);
farGeo.setAttribute('crest', new THREE.BufferAttribute(new Float32Array(farGeo.attributes.position.count * 2), 2));

// territory data texture: R = owner (0 none, 1..12), G = strength, (B = age, A = previous owner in the real game)
const CELLS = 128, TERR_HALF = 160;
const terrData = new Uint8Array(CELLS * CELLS * 4);
{
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const starts = [[-40, -30], [45, -20], [0, 45], [-60, 40], [60, 55], [10, -70]];
  for (let p = 1; p <= 6; p++) {
    let cx = Math.floor((starts[p - 1][0] / TERR_HALF * 0.5 + 0.5) * CELLS), cz = Math.floor((starts[p - 1][1] / TERR_HALF * 0.5 + 0.5) * CELLS);
    let ang = rnd() * 6.28;
    for (let s = 0; s < 150; s++) {
      ang += (rnd() - 0.5) * 1.1; cx += Math.round(Math.cos(ang) * 1.6); cz += Math.round(Math.sin(ang) * 1.6);
      cx = Math.max(3, Math.min(CELLS - 4, cx)); cz = Math.max(3, Math.min(CELLS - 4, cz));
      const r = 2 + Math.floor(rnd() * 2.5);
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r + 1) continue;
        const i = ((cz + dz) * CELLS + (cx + dx)) * 4; terrData[i] = p; terrData[i + 1] = Math.min(255, 110 + Math.floor(rnd() * 145));
      }
    }
  }
}
const terrTex = new THREE.DataTexture(terrData, CELLS, CELLS, THREE.RGBAFormat, THREE.UnsignedByteType);
terrTex.minFilter = terrTex.magFilter = THREE.NearestFilter; terrTex.needsUpdate = true;

const TERRITORY = /* glsl */`
uniform sampler2D uTerr; uniform vec4 uTerrArea; uniform int uTerrMode;
// 4-tap "bilinear classification" of an ID grid: smooth region boundaries + distance-to-border metric m
void territory(vec2 xz, out float owner, out float strength, out float m){
  vec2 uv = (xz - uTerrArea.xy) / (2.0*uTerrArea.z) + 0.5;
  vec2 tc = uv * uTerrArea.w - 0.5;
  ivec2 i0 = ivec2(floor(tc)); vec2 f = fract(tc);
  if (uTerrMode == 2) f = f*f*(3.0-2.0*f);
  if (uTerrMode == 0) f = step(0.5, f);
  ivec2 mx = ivec2(int(uTerrArea.w) - 1);
  vec4 t0 = texelFetch(uTerr, clamp(i0, ivec2(0), mx), 0), t1 = texelFetch(uTerr, clamp(i0+ivec2(1,0), ivec2(0), mx), 0);
  vec4 t2 = texelFetch(uTerr, clamp(i0+ivec2(0,1), ivec2(0), mx), 0), t3 = texelFetch(uTerr, clamp(i0+ivec2(1,1), ivec2(0), mx), 0);
  vec4 id = floor(vec4(t0.r, t1.r, t2.r, t3.r) * 255.0 + 0.5);
  vec4 st = vec4(t0.g, t1.g, t2.g, t3.g);
  vec4 w = vec4((1.0-f.x)*(1.0-f.y), f.x*(1.0-f.y), (1.0-f.x)*f.y, f.x*f.y);
  vec4 acc = vec4(dot(w, vec4(equal(id, id.xxxx))), dot(w, vec4(equal(id, id.yyyy))), dot(w, vec4(equal(id, id.zzzz))), dot(w, vec4(equal(id, id.wwww))));
  float best = max(max(acc.x, acc.y), max(acc.z, acc.w));
  owner = acc.x == best ? id.x : acc.y == best ? id.y : acc.z == best ? id.z : id.w;
  vec4 other = 1.0 - vec4(equal(id, vec4(owner)));
  float second = max(max(acc.x*other.x, acc.y*other.y), max(acc.z*other.z, acc.w*other.w));
  m = best - second;                                       // 0 on the border, grows inwards
  strength = dot(w * (1.0 - other), st) / max(best, 1e-4);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) { owner = 0.0; m = 1.0; }
}
`;

const groundMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uSandLit: { value: pal.sandLit }, uSandShade: { value: pal.sandShade }, uGroundFlat: { value: pal.groundFlat },
    uTerr: { value: terrTex }, uTerrArea: { value: new THREE.Vector4(0, 0, TERR_HALF, CELLS) }, uTerrMode: { value: TERR_MODE },
    uPlayerAB: { value: playerAB }, uPaintC: { value: 0.10 + 0.03 * sunsetK }, uNoise: { value: noiseTex },
    uCB: { value: Q.get('cb') ? 1 : 0 }, uShadowLine: { value: Q.get('shadowline') ? 1 : 0 }, uPlayer: { value: playerCols } },
  vertexShader: /* glsl */`
    attribute vec2 crest; varying vec2 vCrest;
    varying vec3 vWorld; varying vec3 vNormalW; varying vec3 vViewN; varying float vDist;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz; vNormalW = normalize(mat3(modelMatrix) * normal); vViewN = normalize(normalMatrix * normal); vCrest = crest;
      vec4 mv = viewMatrix * wp; vDist = length(mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: MRT_OUT + COMMON + SHADOW + FOG + TERRITORY + /* glsl */`
    uniform vec3 uSandLit, uSandShade, uGroundFlat, uInk, uHaze, uCastShadow; uniform float uPx, uHatch, uPaintC; uniform vec2 uPlayerAB[13];
    uniform vec3 uShadowCols[13]; uniform vec3 uPlayer[13]; uniform sampler2D uNoise; uniform int uCB, uShadowLine;
    varying vec3 vWorld; varying vec3 vNormalW; varying vec3 vViewN; varying float vDist; varying vec2 vCrest;
    void main(){
      vec2 xz = vWorld.xz;
      vec2 dx = dFdx(xz), dy = dFdy(xz);                        // shared derivatives: branches below stay legal
      vec4 nz = texture2D(uNoise, xz * (1.0/240.0));
      vec3 N = normalize(vNormalW);
      float ndl = dot(N, uSunDir);
      // Ground tones relative to the FLAT ground (N.L of a flat plain = sin(elev)): the plain follows the keyframe
      // colour (groundFlat), slopes facing the sun stay sandLit, lee slopes go sandShade -- 3 flat tones, AA'd steps.
      float slope = ndl - uSunDir.y; float fsl = fwidth(slope) + 1e-4;
      vec3 col = mix(uGroundFlat, uSandLit, smoothstep(0.06 - fsl, 0.06 + fsl, slope));
      col = mix(col, uSandShade, smoothstep(0.06 - fsl, 0.06 + fsl, -slope) * step(0.0, 1.0));
      float fog = fogAt(vDist);
      // cast shadow (height map), crisp AA'd edge, NO contour (R9)
      vec3 sh = sampleShadow(vWorld, 0.2);
      float fs = max(fwidth(sh.x), 1e-4);
      float shadow = smoothstep(0.5 - fs, 0.5 + fs, sh.x) * mix(0.55, 1.0, sh.z);
      float shadowEdgePx = abs(sh.x - 0.5) / fs;
      // territory: OKLab pigment wash L = 0.5 L_ground + 0.35, C 0.10 -> 0.13 at sunset, darker rim band 3 px (D6)
      float owner, strength, m; territory(xz + (nz.rg - 0.5) * 6.0, owner, strength, m);
      float borderPx = m / max(fwidth(m), 1e-4);
      if (owner > 0.5) {
        vec3 lab = lin2oklab(col);
        vec2 ab = uPlayerAB[int(owner)] * uPaintC * (0.75 + 0.25 * strength);
        float rim = 1.0 - smoothstep(3.0*uPx - 0.5, 3.0*uPx + 0.5, borderPx);
        col = oklab2lin(vec3(0.5 * lab.x + 0.35 - 0.10 * rim, ab));
        if (uCB == 1) {   // colour-blind option: one hatch direction per player (off by default, R13)
          float a = 0.35 + owner * 0.52; vec2 n = vec2(-sin(a), cos(a));
          float h = hatchU(dot(xz, n), length(vec2(dot(dx, n), dot(dy, n))), 9.0*uPx, 1.0*uPx);
          col = mix(col, col * 0.72, h);
        }
      }
      // wind ripples: 2-5 thin lines near the camera only (R16)
      if (uHatch > 0.5 && vDist < 160.0) {
        vec2 rn = vec2(0.40, -0.92);
        float r = dot(xz, rn) + 16.0 * nz.b;
        float dr = length(vec2(dot(dx, rn), dot(dy, rn)));
        float rip = lineCov(r, 4.5, dr, 0.9*uPx) * (1.0 - smoothstep(80.0, 160.0, vDist)) * step(0.6, nz.a) * 0.35;
        col = mix(col, uInk, rip);
      }
      // dune crest line from the per-vertex crest phase (R16): thin, faded with amplitude and fog
      float cp = vCrest.x; float dcp = max(fwidth(cp), 1e-5);
      float crestLine = lineCov(cp, 1.0, dcp, 1.0*uPx) * smoothstep(1.5, 3.0, vCrest.y);
      col = mix(col, uInk, crestLine * 0.55 * (1.0 - smoothstep(0.35, 0.6, fog)));
      // shadow = OKLab blend towards (player-tinted) castShadow; the territory hue stays readable underneath
      if (sh.x > 0.0) {
        vec3 sc = uShadowCols[int(clamp(sh.y - 19.0, 0.0, 12.0) * step(19.5, sh.y))];
        vec3 lab = lin2oklab(col), sl = lin2oklab(sc), sand = lin2oklab(mix(uGroundFlat, uSandLit, 0.5));
        vec3 shaded = vec3(lab.x * sl.x / sand.x, mix(lab.yz, sl.yz, 0.6));
        col = mix(col, oklab2lin(shaded), shadow);
        if (uShadowLine == 1 && sh.y > 19.5) {   // optional readability rim for bird shadows (player colour, not ink)
          float line = (1.0 - smoothstep(1.3*uPx - 0.5, 1.3*uPx + 0.5, shadowEdgePx)) * step(sh.x, 0.999);
          col = mix(col, uPlayer[int(sh.y - 19.0)], line * 0.8);
        }
      }
      col = mix(col, uHaze, fog);                                // R19 aerial perspective
      col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;               // de-banding before 8-bit storage
      gl_FragColor = vec4(col, 1.0);
      gNormalId = vec4(normalize(vViewN) * 0.5 + 0.5, 1.0/255.0);
    }`,
});
const ground = new THREE.Mesh(groundGeo, groundMat); scene.add(ground);
const farGround = new THREE.Mesh(farGeo, groundMat); farGround.position.y = -1.5; scene.add(farGround);

// ---------------------------------------------------------------- towers: 2 tones, crisp terminator, hatching on the shade side only
function towerMaterial(base, id, radius) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uBase: { value: new THREE.Color(base) }, uShade: { value: towerShade }, uId: { value: id }, uR: { value: radius } },
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying vec3 vObj; varying vec3 vNormalW; varying vec3 vViewN; varying float vDist;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorld = wp.xyz; vObj = position; vNormalW = normalize(mat3(modelMatrix)*normal);
        vViewN = normalize(normalMatrix*normal); vec4 mv = viewMatrix*wp; vDist = length(mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: MRT_OUT + COMMON + SHADOW + FOG + /* glsl */`
      uniform vec3 uBase, uShade, uInk, uHaze; uniform float uPx, uId, uHatch, uR; const float uCavity = 1.0;
      varying vec3 vWorld; varying vec3 vObj; varying vec3 vNormalW; varying vec3 vViewN; varying float vDist;
      void main(){
        // cylindrical hatch coordinate, seam rotated onto the sun-facing (never hatched) side
        vec2 sd = normalize(uSunDir.xz);
        vec2 pr = vec2(-dot(vObj.xz, sd), sd.x * vObj.z - sd.y * vObj.x);
        float u = atan(pr.y, pr.x) * uR;
        float du = length(vec2(dFdx(u), dFdy(u)));
        float dv = length(vec2(dFdx(vObj.y), dFdy(vObj.y)));
        vec3 N = normalize(vNormalW);
        float ndl = dot(N, uSunDir);
        float fl = fwidth(ndl);
        float lit = smoothstep(0.05 - fl, 0.05 + fl, ndl);                  // R6: crisp terminator at N.L = 0.05
        vec3 sh = sampleShadow(vWorld, 0.6 + 1.5 * (1.0 - abs(ndl)));
        float light = lit * (1.0 - smoothstep(0.35, 0.65, sh.x));
        vec3 col = mix(uShade, uBase, light);
        float fog = fogAt(vDist);
        float hFade = (1.0 - smoothstep(0.25, 0.4, fog)) * uHatch;         // R11: no hatching beyond ~40% fog
        float h = hatchU(u, du, 6.0*uPx, 1.0*uPx) * step(abs(N.y), 0.6);    // R12: vertical lines on shafts
        float h2 = hatchU(vObj.y, dv, 6.0*uPx, 1.0*uPx) * step(uCavity, 0.35);  // crossed at 90 deg only in creases (baked AO/cavity; 1 = none here)
        col = mix(col, uInk, max(h, h2) * (1.0 - light) * 0.35 * hFade);
        col = mix(col, uHaze, fog);
        gl_FragColor = vec4(col, 1.0);
        gNormalId = vec4(normalize(vViewN) * 0.5 + 0.5, uId/255.0);
      }`,
  });
}
const TOWER_COLS = ['#EFE2C8', '#D9A45B', '#C8765A', '#EFE2C8', '#4FB3AE'];
const towers = [[-95, -60, 62, 5], [70, -85, 48, 4], [110, 30, 70, 6], [-30, 90, 40, 4], [-130, 50, 55, 5], [20, -10, 34, 3.5], [150, -120, 58, 5], [-150, -140, 45, 4]];
towers.forEach(([x, z, h, r], i) => {
  const shaft = new THREE.CylinderGeometry(r * 0.75, r, h, 24, 1).translate(0, h / 2, 0);
  const disc = new THREE.CylinderGeometry(r * 2.4, r * 1.6, 2.2, 32, 1).translate(0, h * 0.82, 0);
  const cap = new THREE.CylinderGeometry(r * 0.5, r * 1.1, 6, 20, 1).translate(0, h + 3, 0);
  const ant = new THREE.CylinderGeometry(0.35, 0.35, 12, 6, 1).translate(0, h + 12, 0);
  const geo = mergeGeometries([shaft, disc, cap, ant].map(g => g.toNonIndexed())); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, towerMaterial(TOWER_COLS[i % TOWER_COLS.length], 2 + i, r));
  m.position.set(x, duneH(x, z) - 1, z); scene.add(m); m.updateMatrixWorld();
  addCaster(m, 2 + i);
});

// ---------------------------------------------------------------- birds: bone white + player band on the wings (+ inverted hull)
function birdMaterial(pi, id) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uBody: { value: new THREE.Color('#EDEDDF') }, uBodyShade: { value: new THREE.Color(SUN_ELEV > 20 ? '#C4C6BA' : '#B8B0C4') },
      uBand: { value: playerCols[pi] }, uId: { value: id } },
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying vec3 vObj; varying vec3 vNormalW; varying vec3 vViewN; varying float vDist;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorld = wp.xyz; vObj = position; vNormalW = normalize(mat3(modelMatrix)*normal);
        vViewN = normalize(normalMatrix*normal); vec4 mv = viewMatrix*wp; vDist = length(mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: MRT_OUT + COMMON + SHADOW + FOG + /* glsl */`
      uniform vec3 uBody, uBodyShade, uBand, uInk, uHaze; uniform float uPx, uId, uHatch;
      varying vec3 vWorld; varying vec3 vObj; varying vec3 vNormalW; varying vec3 vViewN; varying float vDist;
      void main(){
        float du = length(vec2(dFdx(vObj.x), dFdy(vObj.x)));
        vec3 N = normalize(vNormalW);
        float ndl = dot(N, uSunDir); float fl = fwidth(ndl);
        float lit = smoothstep(0.05 - fl, 0.05 + fl, ndl);
        vec3 sh = sampleShadow(vWorld, 0.8);
        float light = lit * (1.0 - smoothstep(0.35, 0.65, sh.x));
        float band = step(3.0, abs(vObj.x)) * step(abs(vObj.x), 5.2);            // R23: painted band across each wing
        vec3 base = mix(uBody, uBand, band), shade = mix(uBodyShade, uBand * 0.72, band);
        vec3 col = mix(shade, base, light);
        float fog = fogAt(vDist);
        float h = hatchU(vObj.x, du, 5.0*uPx, 1.0*uPx) * step(N.y, -0.2) * (1.0 - light); // belly, along the chord
        col = mix(col, uInk, h * 0.45 * uHatch * (1.0 - smoothstep(0.1, 0.3, fog)));
        col = mix(col, uHaze, fog);
        gl_FragColor = vec4(col, 1.0);
        gNormalId = vec4(normalize(vViewN) * 0.5 + 0.5, (uId + band * 40.0) / 255.0);  // band gets its own id -> ink edge (R3)
      }`,
  });
}
function hullMaterial(id, widthPx) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uInk: U.uInk, uHaze: U.uHaze, uFogDensity: U.uFogDensity, uWidth: { value: widthPx }, uRes: { value: new THREE.Vector2(RW, RH) }, uId: { value: id } },
    vertexShader: /* glsl */`
      uniform float uWidth; uniform vec2 uRes; varying vec3 vViewN; varying float vDist;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec4 clip = projectionMatrix * mv;
        vViewN = normalize(normalMatrix * normal);
        vec2 nc = (projectionMatrix * vec4(vViewN, 0.0)).xy;
        clip.xy += normalize(nc + 1e-6) * uWidth * 2.0 / uRes * clip.w;   // constant pixel width
        vDist = length(mv.xyz);
        gl_Position = clip;
      }`,
    fragmentShader: MRT_OUT + FOG + /* glsl */`
      uniform vec3 uInk, uHaze; uniform float uId; varying vec3 vViewN; varying float vDist;
      void main(){ gl_FragColor = vec4(mix(uInk, uHaze, fogAt(vDist) * 0.8), 1.0);
        gNormalId = vec4(normalize(vViewN) * 0.5 + 0.5, uId / 255.0); }`,
  });
}
function birdGeo() {
  const body = new THREE.SphereGeometry(1, 20, 12).scale(1.1, 0.8, 3.2);
  const head = new THREE.SphereGeometry(0.7, 12, 8).translate(0, 0.4, 3.4);
  const wl = new THREE.SphereGeometry(1, 24, 8).scale(6.5, 0.25, 1.6).rotateZ(0.12).translate(-5.5, 0.4, 0.2);
  const wr = new THREE.SphereGeometry(1, 24, 8).scale(6.5, 0.25, 1.6).rotateZ(-0.12).translate(5.5, 0.4, 0.2);
  const tail = new THREE.SphereGeometry(1, 12, 6).scale(1.6, 0.18, 1.8).translate(0, 0, -3.8);
  return mergeGeometries([body, head, wl, wr, tail]);
}
const BG = birdGeo();
const birds = [[-40, 28, -20, 0.6], [30, 16, 5, 2.2], [0, 42, 40, -0.8], [-60, 12, 30, 1.2], [55, 34, 50, 3.0], [10, 22, -55, 0.1]];
birds.forEach(([x, y, z, yaw], i) => {
  const m = new THREE.Mesh(BG, birdMaterial(i + 1, 20 + i));
  m.position.set(x, duneH(x, z) + y, z); m.rotation.set(0.0, yaw, (i % 2 ? 0.25 : -0.2)); scene.add(m); m.updateMatrixWorld();
  m.add(new THREE.Mesh(BG, hullMaterial(20 + i, 1.2 * RH / 1080)));
  addCaster(m, 20 + i, 1.0 + y / 60, THREE.MathUtils.clamp(1.2 - y / 50, 0.35, 1.0)); // higher: bigger but paler shadow
});

// ---------------------------------------------------------------- pebbles / ink dashes with analytic micro-shadows (R15)
if (F.pebbles && P.pebbles) {
  const N = P.pebbles; const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const inst = new Float32Array(N * 4); let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) { const r = 40 + Math.pow(rnd(), 0.7) * 420, a = rnd() * 6.283; const x = Math.cos(a) * r, z = Math.sin(a) * r;
    inst[i * 4] = x; inst[i * 4 + 1] = duneH(x, z); inst[i * 4 + 2] = z; inst[i * 4 + 3] = 0.25 + rnd() * 0.45; }
  const makePebbles = (isShadow) => {
    const g = new THREE.InstancedBufferGeometry().copy(quad); g.instanceCount = N;
    g.setAttribute('inst', new THREE.InstancedBufferAttribute(inst, 4));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { ...U, uIsShadow: { value: isShadow ? 1 : 0 } },
      vertexShader: SHADOW + FOG + /* glsl */`
        attribute vec4 inst; uniform float uIsShadow; varying vec2 vQ; varying float vFade; varying float vLit;
        void main(){
          float s = inst.w; vec3 p = vec3(position.x * s * 2.2, 0.0, position.z * s);   // dash: 2.2:1 ellipse
          float h = s * 0.8;                                                              // pebble height
          if (uIsShadow > 0.5) {                                                          // stretch along -sun (length = h / tan(elev))
            vec2 sd = normalize(uSunDir.xz); float len = min(h * length(uSunDir.xz) / uSunDir.y, 8.0 * s);   // cap relative to pebble size
            vec2 q = vec2(position.x, position.z + 0.5);                                  // 0..1 along the shadow
            p = vec3(0.0); p.xz = -sd * (q.y * len) + vec2(-sd.y, sd.x) * position.x * s * 1.6;
          }
          vec3 wp = inst.xyz + p + vec3(0.0, 0.03, 0.0);
          vQ = position.xz * 2.0;
          vLit = 1.0 - sampleShadow(inst.xyz, 0.3).x;        // no micro-shadow inside a tower/bird shadow
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vFade = 1.0 - smoothstep(0.3, 0.6, fogAt(length(mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: MRT_OUT + /* glsl */`
        uniform vec3 uInk, uCastShadow; uniform float uIsShadow; varying vec2 vQ; varying float vFade; varying float vLit;
        void main(){
          float d = uIsShadow > 0.5 ? length(vec2(vQ.x, max(abs(vQ.y) - 0.6, 0.0) * 2.5)) : length(vQ);
          float aa = fwidth(d);
          float a = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
          vec3 c = uIsShadow > 0.5 ? uCastShadow : uInk;
          float alpha = a * vFade * (uIsShadow > 0.5 ? 0.7 * vLit : 0.55);
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(c, alpha);
          gNormalId = vec4(0.0);   // alpha 0 -> blending leaves the ground normal/id untouched (no ink edges)
        }`,
    });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = isShadow ? 1 : 2; return mesh;
  };
  scene.add(makePebbles(true)); scene.add(makePebbles(false));
}

// Any built-in / third-party material must declare the MRT output, else WebGL drops the draw call
// ("Active draw buffers with missing fragment shader outputs").
function withGBuffer(mat, objId = 0) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uObjId = { value: objId / 255 };
    sh.fragmentShader = 'layout(location = 1) out highp vec4 gNormalId;\nuniform float uObjId;\n' +
      sh.fragmentShader.replace(/}\s*$/, '  gNormalId = vec4(0.5, 0.5, 1.0, uObjId);\n}');
  };
  mat.customProgramCacheKey = () => 'gbuf';
  return mat;
}
if (Q.get('basic')) { const mat = new THREE.MeshBasicMaterial({ color: '#ff00ff' }); if (Q.get('basic') === 'patched') withGBuffer(mat, 60); const b = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 16), mat); b.position.set(-20, 30, 60); scene.add(b); }

// ---------------------------------------------------------------- sky: 3 stops + strata bands + scalloped cumulus + flat sun (drawn LAST)
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { uSunDir: { value: sunDir }, uTop: { value: pal.skyTop }, uMid: { value: pal.skyMid }, uHor: { value: pal.skyHorizon }, uSun: { value: pal.sun },
    uInk: { value: pal.ink }, uHaze: { value: pal.haze }, uCast: { value: pal.castShadow }, uPx: U.uPx },
  vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: MRT_OUT + COMMON + /* glsl */`
    uniform vec3 uSunDir, uTop, uMid, uHor, uSun, uInk, uHaze, uCast; uniform float uPx; varying vec3 vDir;
    // scalloped flat cumulus: union of circles, flat bottom (coords: x = azimuth, y = elevation, radians)
    float cloudSdf(vec2 p, vec2 c, float w, float seed){
      float d = 1e5;
      for (int i = 0; i < 6; i++){ float fi = float(i); float t = fi / 5.0 - 0.5;
        float r = w * (0.16 + 0.1 * hash12(vec2(fi, seed)));
        d = min(d, length(p - c - vec2(t * w, r * 0.55)) - r); }
      return max(d, c.y - p.y);                                  // cut: flat base
    }
    void main(){
      vec3 d = normalize(vDir);
      float e = d.y;
      float t = clamp(e / 0.5, 0.0, 1.0);                          // dome height 0..1 (0.5 rad ~ upper frame)
      vec3 col = t < 0.6 ? mix(uHor, uMid, smoothstep(0.0, 0.6, t)) : mix(uMid, uTop, smoothstep(0.6, 1.0, t));
      if (e < 0.0) col = uHaze;
      float azm = atan(d.z, d.x);
      // strata bands near the horizon, wavy but not noisy, fine ink line on top at 50%
      for (int k = 0; k < 2; k++){ float fk = float(k);
        float y0 = 0.018 + fk * 0.03 + 0.004 * sin(azm * (5.0 + fk * 3.0) + fk);
        float inB = step(e, y0) * step(y0 - 0.02, e);
        col = mix(col, mix(col, uTop, 0.5), inB * 0.7);
        float fe = fwidth(e);
        col = mix(col, uInk, (1.0 - smoothstep(0.0, 1.0*uPx, abs(e - y0) / fe)) * 0.5 * step(0.0, e));
      }
      // 3 cumulus, 2 tones (top lit, base lavender), scalloped ink outline
      vec2 sp = vec2(azm, e);
      for (int k = 0; k < 3; k++){ float fk = float(k);
        vec2 c = vec2(-2.4 + fk * 1.9 + 0.2 * sin(fk * 4.0), 0.10 + 0.05 * fk);
        float dd = cloudSdf(sp, c, 0.45 - 0.08 * fk, fk);
        float aa = fwidth(dd);
        float inside = 1.0 - smoothstep(-aa, aa, dd);
        vec3 cc = mix(mix(uCast, uHor, 0.55), mix(uHor, vec3(1.0), 0.35), smoothstep(c.y + 0.004, c.y + 0.03, e));
        col = mix(col, cc, inside);
        col = mix(col, uInk, (1.0 - smoothstep(0.0, 1.0 * uPx, abs(dd) / aa)) * 0.6);
      }
      // sun: flat disc, 1px ink at 50%, ONE flat halo (radius x2, 35%) -- no bloom (R18)
      float ang = acos(clamp(dot(d, uSunDir), -1.0, 1.0)); float R = 0.05; float fa = fwidth(ang);
      col = mix(col, uSun, (1.0 - smoothstep(2.0*R - fa, 2.0*R + fa, ang)) * 0.35);
      col = mix(col, uSun, 1.0 - smoothstep(R - fa, R + fa, ang));
      col = mix(col, uInk, (1.0 - smoothstep(0.0, 1.0 * uPx, abs(ang - R) / fa)) * 0.5);
      col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(col, 1.0);
      gNormalId = vec4(0.5, 0.5, 1.0, 0.0);
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 48, 24), skyMat); sky.renderOrder = 1000; sky.frustumCulled = false;
if (!F.nosky) scene.add(sky);

// ---------------------------------------------------------------- camera views
if (VIEW === 'game') { camera.position.set(-20, 150, 175); camera.lookAt(0, 0, 5); }
else if (VIEW === 'low') { camera.position.set(-10, 30, 170); camera.lookAt(10, 25, 0); }
else if (VIEW === 'top') { camera.position.set(0, 330, 60); camera.lookAt(0, 0, 0); }
else if (VIEW === 'far') { camera.position.set(-40, 70, 330); camera.lookAt(0, 10, 0); }
else if (VIEW === 'close') { camera.position.set(-5, 60, 95); camera.lookAt(10, 10, 10); }
sky.position.copy(camera.position); camera.updateMatrixWorld();

// ---------------------------------------------------------------- post: g-buffer pass + single ink/paper effect
class GBufferPass extends Pass {
  constructor(sc, cam, rt) { super('GBufferPass'); this.sc = sc; this.cam = cam; this.rt = rt; this.needsSwap = false; }
  render(r) { r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear(); r.render(this.sc, this.cam); }
  setSize(w, h) { this.rt.setSize(w, h); }
}
const INK_FRAG = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tNormal; uniform highp sampler2D tDepth; uniform sampler2D tPaper;
uniform mat4 uInvProj; uniform mat4 uCamWorld;
uniform vec3 uInk; uniform vec3 uHaze; uniform float uFogDensity; uniform vec2 uThickRange;
uniform float uThick; uniform float uWobble; uniform float uPaper; uniform float uDepthK; uniform float uNormalK; uniform int uDebug;
float linZ(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).r, cameraNear, cameraFar); }
vec3 nrm(vec4 t){ return t.xyz * 2.0 - 1.0; }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  float s = resolution.y / 1080.0;
  vec3 base = texture2D(tColor, uv).rgb;
  // view/world position of this pixel (for world-anchored wobble, fog and distance-based weight)
  float d0 = texture2D(tDepth, uv).r;
  vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, d0 * 2.0 - 1.0, 1.0); vp /= vp.w;
  vec3 wpos = (uCamWorld * vp).xyz;
  float dist = length(vp.xyz);
  float fog = 1.0 - exp(-dist * uFogDensity);
  // R5: low-frequency wobble anchored in the world (lines do not swim when the camera moves)
  vec2 wob = texture2D(tPaper, wpos.xz * (1.0/37.0) + wpos.y * (1.0/53.0)).rg - 0.5;
  vec2 c = uv + wob * 2.0 * uWobble * s * texelSize;
  // R2: thicker in front, thinner far away (below 1px -> opacity)
  float wgt = uThick * s * mix(1.0, 0.5, smoothstep(uThickRange.x, uThickRange.y, dist));
  vec2 o = texelSize * max(wgt, 1.0);
  float z0 = linZ(c); float w0 = 1.0 / z0;
  // 1/z is affine in screen space on any plane -> its 2nd difference is 0 on planes (no grazing-angle false edges)
  float wl = 1.0/linZ(c - vec2(o.x, 0.0)), wr = 1.0/linZ(c + vec2(o.x, 0.0));
  float wd = 1.0/linZ(c - vec2(0.0, o.y)), wu = 1.0/linZ(c + vec2(0.0, o.y));
  float lap = min(wl + wr, wd + wu) - 2.0 * w0;          // most negative = centre in front of its neighbours
  float eDepth = smoothstep(uDepthK, 2.0 * uDepthK, -lap / w0) * min(wgt, 1.0);
  // creases (normals, 1px) and object/material ids
  vec2 o1 = texelSize * max(s, 1.0);
  vec4 t0 = texture2D(tNormal, c);
  vec4 tl = texture2D(tNormal, c - vec2(o1.x, 0.0)), tr = texture2D(tNormal, c + vec2(o1.x, 0.0));
  vec4 td = texture2D(tNormal, c - vec2(0.0, o1.y)), tu = texture2D(tNormal, c + vec2(0.0, o1.y));
  vec3 n0 = nrm(t0);
  float dn = max(max(1.0 - dot(n0, nrm(tl)), 1.0 - dot(n0, nrm(tr))), max(1.0 - dot(n0, nrm(td)), 1.0 - dot(n0, nrm(tu))));
  float eNormal = smoothstep(uNormalK, 1.8 * uNormalK, dn);
  float eId = step(0.5/255.0, max(max(abs(tl.a - t0.a), abs(tr.a - t0.a)), max(abs(td.a - t0.a), abs(tu.a - t0.a)))) * step(1.5/255.0, t0.a);
  float interior = max(eNormal, eId) * 0.85 * (1.0 - smoothstep(0.4, 0.5, fog)); // R4: interior lines gone beyond fog 0.5
  float isSky = step(t0.a, 0.5/255.0) * step(cameraFar * 0.5, z0);
  float edge = max(eDepth, interior) * (1.0 - isSky) * (1.0 - smoothstep(0.35, 0.85, fog)); // R4 (Sable fade)
  vec3 ink = mix(uInk, uHaze, fog * 0.8);                                                   // R1
  vec3 col = mix(base, ink, edge);
  col *= 1.0 - uPaper * (texture2D(tPaper, uv * resolution / (256.0 * s)).a - 0.4);       // R21 static paper grain
  vec2 vv = uv - 0.5; col *= 1.0 - 0.1 * dot(vv, vv);                                      // R22: vignette <= 5%
  if (uDebug == 1) col = vec3(1.0 - edge);
  if (uDebug == 2) col = t0.xyz;
  if (uDebug == 3) col = vec3(fract(z0 / 50.0));
  outputColor = vec4(col, 1.0);
}`;
class InkEffect extends Effect {
  constructor() {
    super('InkEffect', INK_FRAG, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([
        ['tColor', new THREE.Uniform(gbuffer.textures[0])], ['tNormal', new THREE.Uniform(gbuffer.textures[1])], ['tDepth', new THREE.Uniform(gbuffer.depthTexture)],
        ['tPaper', new THREE.Uniform(noiseTex)], ['uInvProj', new THREE.Uniform(camera.projectionMatrixInverse)], ['uCamWorld', new THREE.Uniform(camera.matrixWorld)],
        ['uInk', new THREE.Uniform(pal.ink)], ['uHaze', new THREE.Uniform(pal.haze)], ['uFogDensity', U.uFogDensity],
        ['uThickRange', new THREE.Uniform(new THREE.Vector2(120, 900))], ['uThick', new THREE.Uniform(P.thick)], ['uWobble', new THREE.Uniform(P.wobble)],
        ['uPaper', new THREE.Uniform(P.paper)], ['uDepthK', new THREE.Uniform(0.025)], ['uNormalK', new THREE.Uniform(0.23)], ['uDebug', new THREE.Uniform(DEBUG)],
      ]),
    });
  }
}
const composer = new EffectComposer(renderer, { frameBufferType: F.ldr ? THREE.UnsignedByteType : THREE.HalfFloatType, multisampling: 0, depthBuffer: false, stencilBuffer: false });
const gpass = new GBufferPass(scene, camera, gbuffer);
composer.addPass(gpass);
const inkPass = new EffectPass(camera, new InkEffect());
composer.addPass(inkPass);
let aaPass = null;
if (P.aa === 'fxaa') aaPass = new EffectPass(camera, new FXAAEffect());
if (P.aa === 'smaa') aaPass = new EffectPass(camera, new SMAAEffect());
let noopPass = null;
if (Q.get('calib')) { noopPass = new EffectPass(camera, new Effect('Noop', 'void mainImage(const in vec4 i, const in vec2 uv, out vec4 o){ o = i; }')); composer.addPass(noopPass); }
if (aaPass && !F.noaa) composer.addPass(aaPass);

// ---------------------------------------------------------------- GPU timing
const tq = renderer.extensions.get('EXT_disjoint_timer_query_webgl2');
const timings = {}; const pending = [];
function timed(name, fn) {
  if (!tq) return fn();
  const q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); fn(); gl.endQuery(tq.TIME_ELAPSED_EXT); pending.push([name, q]);
}
function pollTimings() {
  for (let i = pending.length - 1; i >= 0; i--) {
    const [name, q] = pending[i];
    if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
      if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) (timings[name] ??= []).push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q); pending.splice(i, 1);
    }
  }
}
for (const [name, pass] of [['gbuffer', gpass], ['ink+paper', inkPass], ['aa', F.noaa ? null : aaPass], ['noop', noopPass]]) {
  if (!pass) continue; const orig = pass.render.bind(pass); pass.render = (...a) => timed(name, () => orig(...a));
}

let frame = 0;
function loop() {
  frame++;
  scene.updateMatrixWorld();   // casters' matrixWorld must be current BEFORE the shadow pass
  timed('shadowmap', () => { renderer.setRenderTarget(shadowRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(shadowScene, shadowCam); });
  composer.render();
  pollTimings();
  if (frame === 240) {
    const out = {};
    for (const [k, v] of Object.entries(timings)) { const s = v.slice(20).sort((a, b) => a - b); out[k] = +(s[Math.floor(s.length / 2)] ?? 0).toFixed(3); }
    window.__timings = out;
  }
  if (frame > 3) window.__ready = true;
  requestAnimationFrame(loop);
}
loop();
