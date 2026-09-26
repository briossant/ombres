// <Sky> : dôme analytique dessiné EN DERNIER (renderOrder 1000, profondeur 1) :
// seuls les pixels réellement visibles sont ombrés (NPR §4.8, ART_BIBLE §6.1-6.2).
// Dégradé 3 stops, 2 bandes de strates ondulées (sinus, pas de bruit) cernées d'un
// trait fin, 1 à 4 cumulus plats festonnés à base coupée, soleil disque + UN halo
// plat + anneau d'encre, étoiles et lune la nuit. Aucun bloom, aucun flare.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { NPR_FRAGMENT_PRELUDE } from '../npr/glsl/index.ts'
import { useNprFrame } from '../npr/NprPipeline.tsx'
import { NPR } from '../npr/uniforms.ts'
import { worldView } from '../worldView.ts'
import type { WorldFrameResult } from './frame.ts'

const VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;           // profondeur 1 : derrière tout
}
`

const FRAG = /* glsl */ `
${NPR_FRAGMENT_PRELUDE}
uniform float uSkyNight;     // 0 jour -> 1 nuit (avancée de la Grande Ombre, résultats)
uniform float uClouds;       // nombre de cumulus (preset)
uniform float uMoon;         // 0..1
uniform float uStars;        // 0..1
varying vec3 vDir;
// cumulus plat festonné : union de 7 cercles, base coupée à plat (coords : azimut, élévation en rad)
float cloudSdf(vec2 p, vec2 c, float w, float seed){
  float d = 1e5;
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    float t = fi / 6.0 - 0.5;
    float h = hash12(vec2(fi, seed));
    float r = w * (0.13 + 0.11 * h) * (1.0 - 0.9 * abs(t));
    d = min(d, length((p - c - vec2(t * w * 0.92, r * 0.5 + w * 0.02 * sin(fi * 2.1 + seed))) * vec2(1.0, 1.6)) - r);
  }
  return max(d, c.y - p.y);
}
float starField(vec3 d, float pxAng){
  // cellules en (azimut, élévation) ; une étoile au plus par cellule
  float az = atan(d.z, d.x);
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec2 g = vec2(az * 22.0, el * 22.0);
  vec2 cell = floor(g);
  float h = hash12(cell + 17.0);
  if (h > 0.085 || el < 0.05) return 0.0;
  vec2 j = vec2(hash12(cell + 3.1), hash12(cell + 9.7));
  vec2 sp = (cell + 0.2 + 0.6 * j) / 22.0;
  vec2 dd = vec2((az - sp.x) * cos(el), el - sp.y);
  float r = length(dd) / pxAng;                 // distance en px
  float size = h < 0.012 ? 1.6 : 0.9;
  float s = 1.0 - smoothstep(size - 0.5, size + 0.5, r);
  // quelques croix à 4 branches de 5 px
  if (h < 0.01) {
    vec2 q = abs(dd) / pxAng;
    s = max(s, (1.0 - smoothstep(0.35, 0.9, min(q.x, q.y))) * (1.0 - smoothstep(4.0, 5.0, max(q.x, q.y))));
  }
  return s;
}
void main(){
  vec3 d = normalize(vDir);
  float pxAng = max(length(fwidth(d)), 1e-5);   // angle d'un pixel (rad), hors branche
  float e = d.y;
  float n = uSkyNight;
  vec3 top = mix(uSkyTop, uNSkyTop, n);
  vec3 mid = mix(uSkyMid, uNSkyMid, n);
  vec3 hor = mix(uSkyHorizon, uNSkyHorizon, n);
  vec3 ink = palInk(n);
  float t = clamp(e / 0.5, 0.0, 1.0);
  vec3 col = t < 0.6 ? mix(hor, mid, smoothstep(0.0, 0.6, t)) : mix(mid, top, smoothstep(0.6, 1.0, t));
  float azm = atan(d.z, d.x);
  float fe = max(fwidth(e), 1e-6);

  // étoiles (derrière tout le reste)
  float st = uStars > 0.01 ? starField(d, pxAng) : 0.0;
  col = mix(col, vec3(0.77, 0.87, 0.99), st * 0.8 * uStars * smoothstep(0.02, 0.12, e));

  // bandes de strates près de l'horizon, bord ondulé, trait d'encre à 50 % sur le bord haut
  for (int k = 0; k < 2; k++){
    float fk = float(k);
    float y0 = 0.024 + fk * 0.034 + 0.005 * sin(azm * (5.0 + fk * 3.0) + fk * 1.7) + 0.003 * sin(azm * 11.0 + fk);
    float inB = step(e, y0) * step(y0 - 0.017 - 0.006 * fk, e);
    col = mix(col, mix(col, mix(top, hor, 0.35), 0.5), inB * 0.8);
    // trait du bord haut, interrompu par endroits (strates dessinées, pas des câbles)
    float brk = step(0.28, fract(azm * (3.0 + fk) * 1.7 + fk * 0.37));
    col = mix(col, ink, (1.0 - smoothstep(0.0, 1.0 * uPx, abs(e - y0) / fe)) * 0.3 * brk * step(0.0, e) * (1.0 - n * 0.6));
  }

  // cumulus plats festonnés, deux tons, contour d'encre à 60 %
  vec2 sp = vec2(azm + uTime * 0.3 * 0.01745, e);
  for (int k = 0; k < 4; k++){
    float fk = float(k);
    if (fk >= uClouds) break;
    vec2 c = vec2(-2.75 + fk * 1.63 + 0.25 * sin(fk * 4.0), 0.085 + 0.04 * mod(fk * 1.7, 2.0));
    float w = 0.42 - 0.07 * fk;
    float dd = cloudSdf(sp, c, w, fk + 1.0);
    // borné : fwidth explose sur la couture d'atan (plein ouest, là où le soleil se couche)
    float aa = clamp(fwidth(dd), 1e-5, 3.0 * pxAng);
    float inside = 1.0 - smoothstep(-aa, aa, dd);
    vec3 lit = mix(hor, vec3(1.0), 0.35);
    vec3 under = mix(palCast(n), hor, 0.55);
    vec3 cc = mix(under, lit, smoothstep(c.y + 0.006, c.y + 0.03, e));
    col = mix(col, cc, inside);
    col = mix(col, ink, (1.0 - smoothstep(0.0, 1.0 * uPx, abs(dd) / aa)) * 0.6 * (1.0 - n * 0.5));
  }

  // soleil : disque plat, anneau d'encre 1 px à 50 %, UN halo plat (rayon × 2, 35 %)
  float ang = acos(clamp(dot(d, uSunDiscDir), -1.0, 1.0));
  float R = 0.05;
  float fa = max(fwidth(ang), 1e-6);
  float sunVis = 1.0 - smoothstep(0.6, 0.95, n);
  col = mix(col, uSun, (1.0 - smoothstep(2.0 * R - fa, 2.0 * R + fa, ang)) * 0.35 * sunVis);
  col = mix(col, uSun, (1.0 - smoothstep(R - fa, R + fa, ang)) * sunVis);
  col = mix(col, ink, (1.0 - smoothstep(0.0, 1.0 * uPx, abs(ang - R) / fa)) * 0.5 * sunVis);

  // lune (résultats) : disque couleur « sun » de KF-15 avec un croissant d'ombre skyMid
  vec3 moonDir = normalize(vec3(0.62, 0.42, 0.66));
  float ma = acos(clamp(dot(d, moonDir), -1.0, 1.0));
  float mfa = max(fwidth(ma), 1e-6);
  float moon = (1.0 - smoothstep(0.035 - mfa, 0.035 + mfa, ma)) * uMoon;
  float crescent = 1.0 - smoothstep(0.03 - mfa, 0.03 + mfa, acos(clamp(dot(d, normalize(moonDir + vec3(0.02, 0.012, -0.018))), -1.0, 1.0)));
  col = mix(col, mix(uNSun, mid, crescent * 0.85), moon);
  col = mix(col, ink, (1.0 - smoothstep(0.0, 1.0 * uPx, abs(ma - 0.035) / mfa)) * 0.5 * uMoon);

  // sous l'horizon : couleur de la brume lointaine (raccord sol / ciel)
  col = mix(col, hor, step(e, 0.0));
  col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
  gNormalId = vec4(0.5, 0.5, 1.0, 0.0);
}
`

export interface SkyProps {
  clouds: number
  frame: { current: WorldFrameResult | null }
}

export function Sky({ clouds, frame }: SkyProps) {
  const uniforms = useMemo(
    () => ({ uSkyNight: { value: 0 }, uClouds: { value: clouds }, uMoon: { value: 0 }, uStars: { value: 0 } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  uniforms.uClouds.value = clouds
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'world.sky',
        uniforms: { ...NPR, ...uniforms },
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [uniforms],
  )
  const geometry = useMemo(() => new THREE.SphereGeometry(8000, 64, 32), [])
  useEffect(
    () => () => {
      material.dispose()
      geometry.dispose()
    },
    [material, geometry],
  )

  const mesh = useMemo(() => {
    const m = new THREE.Mesh(geometry, material)
    m.renderOrder = 1000
    m.frustumCulled = false
    m.name = 'sky'
    return m
  }, [geometry, material])

  useNprFrame((state) => {
    const f = frame.current
    const night = f ? f.nightProgress : 0
    uniforms.uSkyNight.value = night
    uniforms.uStars.value = Math.max(0, night * 1.2 - 0.2)
    uniforms.uMoon.value = Math.min(1, Math.max(0, (worldView.resultsFade - 0.3) / 0.5))
    mesh.position.copy(state.camera.position) // le dôme suit la caméra (il est « à l'infini »)
  }, 10)

  return <primitive object={mesh} />
}
