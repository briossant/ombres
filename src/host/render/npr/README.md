# Framework NPR d'Ombres (`src/host/render/npr/`)

Rendu « ligne claire / Moebius » : tout le dessin se fait dans les **matériaux**
(deux tons, ombres portées, hachures, brume), puis **une seule** passe d'encre en
post (contours) et SMAA. Références : `docs/ART_BIBLE.md` §2, §5, §7 ;
`docs/research/npr-techniques.md`. Propriétaire : agent **world**.

```ts
import { createNprMaterial, shadowCasters, useShadowCaster, NPR, GLSL, NPR_FRAGMENT_PRELUDE,
         withGBuffer, birdId, birdAccentId, requestPlancheFlash, useNprFrame } from '../npr'
```

## 1. Ordre d'une frame

```
useFrame(priorité < 0)  runner : écrit gameView (sim + interpolation)
useFrame(priorité 0)    caméra, oiseaux (transforms, uniforms d'animation), FX
NprPipeline (priorité 1, prend la main sur le rendu de R3F) :
  1. hooks useNprFrame (ordre croissant) : palette, soleil, brume, front de nuit,
     empreintes d'oiseaux, territoire  (le monde s'y inscrit)
  2. scene.updateMatrixWorld()
  3. height shadow map : scène des casters, 3 cascades (proche ±(max(a,b)+90) m en 2048²,
     lointaine ±1 100 m en 1024² quand le soleil est bas, « focus » ±90 m devant une caméra
     basse pour les plans de mise en scène) — zones réglées par le monde (`shadowAreas`)
  4. GBufferPass (MRT : couleur sRGB8 | normale de vue + ID RGBA8 | profondeur F32)
  5. InkEffect (contours 1/z + normales + IDs, brume, tremblé monde, papier, vignette, flash)
  6. SMAA (medium / high)
```

Tout est monté par `<WorldCanvas>` (`src/host/render/WorldCanvas.tsx`) : vous
ajoutez vos objets comme enfants du canvas.

## 2. Règle n° 1 : la sortie MRT

**Tout** matériau dessiné dans la scène principale doit écrire la 2e sortie
`gNormalId`, sinon ANGLE ignore le draw call et **l'objet disparaît** :

- matériaux maison : inclure `GLSL.mrt` (ou `NPR_FRAGMENT_PRELUDE`) et appeler
  `writeGBuffer(viewNormal, objId)` à la fin de `main()` ;
- transparents / FX sans contour : `gNormalId = vec4(0.0);` (alpha 0 : la normale
  et l'ID du dessous restent intacts, pas de trait) ;
- matériaux three/drei (Text, Line2, MeshBasicMaterial…) : `withGBuffer(mat, objId)`
  (ou `withGBuffer(mat, 0, true)` pour un transparent).

Couleurs de sortie en **RGB linéaire** (la cible est sRGB8, l'encodage est matériel).

## 3. IDs d'objet (`ids.ts`) : où l'encre trace les traits

Frontière d'ID = trait d'encre (côté objet au premier plan), sauf sur 0 (ciel) et
1 (sol). Oiseau du slot `s` : `birdId(s) = 20 + s` ; cavalier et mât : `riderId(s) = 44 + s` ;
ses pièces colorées à cerner (bande d'aile, cape, selle, fanion) : `birdAccentId(s) = 60 + s`.
Couronne du meneur : `OBJ_ID.crown` (221). Les pièces d'un même objet qui ne doivent PAS être
cernées partagent le même ID. Horizon : 2-5. Tours : 80-215. FX encrés : 220+.

## 4. Matériau NPR prêt à l'emploi : `createNprMaterial(options)`

Deux tons + terminateur net (N·L = 0,05, AA 1 px) + teinte de la lumière de la
keyframe (en OKLab) + ombres portées de la height map + hachures optionnelles sur
la face à l'ombre + brume + front de nuit (palette KF-4 derrière) + sortie MRT.

| Option | Rôle |
|---|---|
| `objectId` | ID d'encre (obligatoire) |
| `albedo` | couleur, `'vertex'` (attribut `albedo` vec3 **OKLab**, voir `albedoAttribute`/`fillAlbedo`) ou `'instance'` (InstancedMesh.setColorAt) |
| `family` | `'object'` (tours, décor) ou `'bird'` (formules oiseau de la bible §2.6) |
| `hatch` | `'cylinder'` (méridiens, révolution), `'attribute'` (attribut `hatchUv`), `'belly'` (x objet, si N.y < −0,2), `'none'` |
| `hatchScale` | multiplicateur d'opacité (oiseau ≈ 1,2 : 0,45 visé) |
| `cavity` | attribut `cavity` (AO bakée) : hachure croisée à 90° si < 0,35 |
| `accentColor` | + attribut `accent` (0..1) : zones à la couleur du joueur (`setNprAccent(mat, hex)`) |
| `vertexIdOffset` | + attribut `idOffset` : cerner une pièce d'un maillage fusionné (ex. +40 pour la bande) |
| `shadowBias` | `'wall'` (défaut), `'bird'` (0,8) ou nombre |
| `deform` | `{ pars, main, uniforms }` : déformation de sommets (modifie `transformed` et `objectNormal`) — **la même** doit aller au caster |
| `side`, `fog`, `receiveShadow`, `defines` | classiques |

Uniforms propres modifiables à chaud : `uHidden` (0..1, oiseau caché : 55 % vers
`castShadow`), `uFade` (apparition), `uObjId`, `uHatchScale`.

InstancedMesh et SkinnedMesh sont gérés automatiquement (`USE_INSTANCING`,
`USE_SKINNING`).

## 5. Ombres portées : la height shadow map

Un caster est un proxy qui partage la géométrie **et la `matrixWorld` (par
référence)** de votre maillage. Il écrit sa hauteur le long du rayon solaire.

```ts
const handle = shadowCasters.add(mesh, {
  owner: slot + 1,      // 0 = neutre (tours) ; slot+1 = ombre teintée du joueur
  strength: 1.0,        // âme d'oiseau : 1,0 BAS / 0,6 HAUT (ART_BIBLE §5.3)
  deform: flightDeform, // MÊME déformation que le matériau visible, sinon l'ombre ne bat pas des ailes
})
handle.setStrength(bird.strong ? 1 : 0.6)   // à chaque frame si besoin
handle.dispose()                             // au démontage
// ou, en R3F : const caster = useShadowCaster(meshRef, { owner, strength, deform })
```

- **SkinnedMesh** : le proxy est lié au même squelette (skinning dans le caster) et partage
  `bindMatrix` / `bindMatrixInverse` **par référence** avec la source : les modes `attached`
  (recalcul par la source) et `detached` fonctionnent tous deux.
- **InstancedMesh** : le proxy partage `instanceMatrix` et suit `count`.
- Le caster suit la visibilité de la source (et de ses parents) ; `setEnabled(false)` pour le couper.
- Les **empreintes** (ellipse de gameplay, liseré couleur joueur continu/pointillé)
  sont dessinées par le monde depuis `bird.shadow` de la sim : l'agent oiseaux n'a
  **rien** à faire pour elles. Il enregistre seulement l'**âme** (le maillage de
  l'oiseau + cavalier) comme caster.

Lire l'ombre dans un shader maison (chunk `shadow`) :

```glsl
vec4 sh = sampleShadow(worldPos, 0.8);   // x couverture 0..1, y code propriétaire, z force, w type
float inShadow = smoothstep(0.35, 0.65, sh.x) * step(sh.w, 1.5);   // les empreintes n'ombrent que le sable
inShadow *= 1.0 - n;                     // derrière le front de nuit : plus d'ombre portée (tout est à l'ombre)
// sampleShadowSmooth(wp, bias) : variante B-spline 3×3 (bords arrondis), pour les récepteurs proches
```

## 6. Exemple complet : un maillage d'oiseau

```ts
import * as THREE from 'three'
import { createNprMaterial, shadowCasters, birdId, NPR, type VertexDeform } from '../npr'

// 1) La déformation de vol, partagée par le matériau visible et le caster.
const uFlap = { value: 0 }          // phase du battement (rad), mise à jour dans useFrame
const uFold = { value: 0 }          // repli des ailes en piqué (0..1)
const flightDeform: VertexDeform = {
  uniforms: { uFlap, uFold },
  pars: /* glsl */ `uniform float uFlap, uFold;`,
  main: /* glsl */ `
    float span = abs(transformed.x);                         // distance à l'emplanture
    float lift = sin(uFlap) * span * span * 0.04 * (1.0 - uFold);
    transformed.y += lift;
    transformed.x *= 1.0 - 0.55 * uFold * smoothstep(1.0, 6.0, span);
    objectNormal = normalize(objectNormal + vec3(-sign(transformed.x) * cos(uFlap) * span * 0.02, 0.0, 0.0));
  `,
}

// 2) Géométrie : attribut `accent` = 1 sur la bande d'aile (14 % de la demi-envergure),
//    attribut `idOffset` = 40 sur la même bande (elle est cernée : ID 60 + slot).
const mat = createNprMaterial({
  objectId: birdId(slot), vertexIdOffset: true,
  family: 'bird', albedo: '#EDEDDF', accentColor: PLAYER_COLORS[colorIndex].hex,
  hatch: 'belly', hatchScale: 1.2, shadowBias: 'bird', deform: flightDeform,
})
const mesh = new THREE.Mesh(geometry, mat)

// 3) L'âme de l'ombre (même géométrie, même déformation, même matrixWorld).
const caster = shadowCasters.add(mesh, { owner: slot + 1, strength: 1, deform: flightDeform })

// 4) Chaque frame (useFrame priorité 0) : position interpolée (repère three :
//    (sim.x, sim.z, -sim.y)), uFlap, uFold, et la force de l'âme.
caster.setStrength(bird.strong ? 1.0 : 0.6)
mat.uniforms.uHidden.value = bird.hidden ? 1 : 0
```

La coque inversée (contour de 1,2 px des oiseaux, NPR §4.2) est un 2e maillage
`BackSide` écrivant la même normale/ID : utiliser `GLSL.mrt` + `GLSL.palette` +
`GLSL.fog` et la couleur `palInk(n)` brumée (`mix(ink, fogColor(f, n), f * 0.8)`).

## 7. Matériau entièrement maison

```ts
new THREE.ShaderMaterial({
  uniforms: { ...NPR, uMine: { value: 1 } },      // objets partagés, jamais copiés
  vertexShader: `...`,
  fragmentShader: NPR_FRAGMENT_PRELUDE + `
    void main(){
      float nd = nightDist(vWorld.xz); float nw = max(fwidth(nd), 1e-3);   // dérivées HORS branche
      float n = nightMask(nd, nw);
      vec3 col = ...;                                  // palInk(n), palCast(n), uSandLit, uSkyHorizon…
      col = applyFog(col, fogAt(vDist), n);
      gl_FragColor = vec4(col, 1.0);
      writeGBuffer(vViewN, 0.0);                       // ou gNormalId = vec4(0.0) si transparent
    }`,
})
```

Chunks (`GLSL.*`, tous protégés par `#ifndef`) : `common` (hash12, ign, lineCov,
hatchU, hatchTone, stipple, aaStep), `oklab`, `palette` (uniforms jour/nuit, uPx,
uNoise, uQuality, uSunDir…), `night`, `shadow`, `fog`, `mrt`, `tint`
(nprLitLab, nprShadeLab, nprTerminator), `hatch` (hatchCylU, hatchShade).

Uniforms partagés utiles (`NPR.*`) : couleurs de palette (`uInk`, `uCastShadow`,
`uSandLit`, `uGroundFlat`, `uBirdLit`, `uBirdShade`, `uHaze`, `uSkyHorizon`…),
`uWarm`, `uPaletteElev`, `uSunDir` (vers le soleil, repère three), `uShadowDir`,
`uPx` (hauteur/1080 : multiplier tous les px de la bible), `uTime`,
`uOwnerCol[13]` (couleur d'identité linéaire par code propriétaire = slot + 1),
`uOwnerText[13]`, `uQuality` (hachures, granulation, rides, tremblé), `uNoise`.

## 8. Règles et pièges

- FX : formes plates (SDF + `fwidth`), traits d'encre, **aucun additif ni glow** ;
  disparition par rétrécissement ou trame, pas par fondu d'alpha (ART_BIBLE §6.8).
- Dérivées (`fwidth`, `dFdx`) toujours **hors branche**, en tête de `main()`.
- Hachures et trames en espace objet/UV/monde, **jamais écran**.
- Pas de `logarithmicDepthBuffer`, pas de profondeur inversée (l'encre suppose une
  profondeur perspective standard).
- Couleurs de joueur : `PLAYER_COLORS[gameView.players[slot].colorIndex]`
  (`src/shared/players.ts`) ou `NPR.uOwnerCol.value[slot + 1]` (linéaire).
- Flash « planche » (touche de piqué, changement de meneur) : `requestPlancheFlash()`
  (limité à 1 / 2 s, respecte « Réduire les flashs »).
- Hooks avant rendu : `useNprFrame((state, dt) => …, order)`.
- `< 150` draw calls au total : instancier ce qui se répète.
- Mesures : `<WorldCanvas measure>` (par défaut quand l'URL contient `?debug`) publie
  `window.__timings` (ms GPU par passe via timer queries, `cpu` = pipeline) et affiche un overlay.
