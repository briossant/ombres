# Agent world — notes d'intégration

État : **framework NPR et monde fonctionnels**, validés en captures (KF80 → KF1, Grande Ombre,
résultats, plans bas, daltonien, 4 cartes, 3 presets). Test high-key passé (voir « Vérifications »).
- Framework : `src/host/render/npr/` — doc complète : `src/host/render/npr/README.md`.
- Monde : `src/host/render/World.tsx`, `WorldCanvas.tsx`, `worldView.ts`, `quality.ts`, `world/*`.
- Page de lookdev : `http://localhost:8801/dev/world.html` (paramètres en tête de `src/dev/world/main.tsx` :
  `?kf= ?sun= ?t= ?night= ?results= ?map= ?np= ?cam=game|low|lowe|top|orbit|close ?cb=1 ?q= ?live=1 ?debug ?splash=1 ?illum=<s> ?pal= ?ink=0..4`).
- Outils : `tools/world-shots.mjs` (série de captures dans un seul navigateur, `--timings`),
  `tools/world-perf.mjs` (banc GPU par passe), `tools/world-logs.mjs` (console complète : erreurs de shaders).

## Pour l'agent birds

- `src/host/render/npr/README.md` : ordre de frame, sortie MRT obligatoire, IDs (oiseau 20+s, cavalier 44+s,
  accents 60+s, couronne 221), `createNprMaterial`, `shadowCasters.add(mesh, { owner: slot + 1, strength, deform })`.
- Exemple minimal qui tourne : `src/dev/world/BirdMarkers.tsx`.
- Les **empreintes** (ellipse de gameplay + liseré continu/pointillé), le **fil d'ombre** et les **glyphes
  daltoniens au centre des empreintes** sont dessinés par le monde depuis la sim : rien à faire côté oiseaux.
- `requestPlancheFlash()` pour le flash « planche » ; `useNprFrame(cb, order)` pour un hook avant rendu.

## API d'intégration (phase 3)

```tsx
import { WorldCanvas } from './render/WorldCanvas.tsx'
<WorldCanvas>                  {/* Canvas flat + NprPipeline + <World> (sol, tours, horizon, ciel…) */}
  <GameCamera makeDefault />   {/* caméra de jeu (phase 3) — FOV 40°, near 1, far 9000 */}
  <Birds /> <Fx />             {/* agent birds */}
</WorldCanvas>
```

- Le monde lit **`gameView`** (sim, prevBirds, alpha, players, colorblind) dans ses hooks `useNprFrame`
  (après tous les `useFrame` de priorité ≤ 0) : le runner écrit gameView dans un `useFrame` de priorité négative.
- **`worldView`** (`src/host/render/worldView.ts`), état de présentation mutable (valeurs par défaut = jeu) :
  - `paletteElevOverride` : titre KF16 = `16` (ou cycle lent 50 → 1), lobby KF50 = `50` ; `sunOverride` ;
  - `resultsFade` : 0 → 1 pendant la montée verticale de la caméra (2,5 s) = fondu KF-4 → KF-15 + lune ;
  - `nightAll` : `null` = auto (1 en phases night/over) ;
  - `illuminateTerritory(winnerSlot, gameView.realTime)` : vague d'illumination (0,8 s) + ré-impression du gagnant ;
  - `exactBorders = true` pendant le décompte (warp des bords ramené à 0,5 cellule) ; `hideStorm`.
- **Qualité** (`src/host/render/quality.ts`) : `useRenderQuality.getState().setLevel('low'|'medium'|'high')`
  change le preset **à chaud** (dpr 720/900/1080p, SMAA, résolution d'ombre, hachures, cailloux, nuages…) ;
  `applyQualitySetting(getSettings().quality)` à chaque changement du réglage ; **`startQualityBench()`** sur l'écran
  titre si `!hasQualityBench()` (banc de ~2,3 s en High, mémorisé dans localStorage, appliqué si réglage « auto ») ;
  **`qualityMonitor.shouldDowngrade(level)`** à interroger **entre deux manches** seulement.
- Taches de piqué : le sol s'abonne seul à `simEvents` (`diveHit`), direction = cap du chasseur.
- Territoire : la texture consomme `grid.dirty` de la sim et le remet à zéro (`clearDirty`) après envoi.
- Debug : `<WorldCanvas measure>` (derrière `?debug`) → `window.__timings` (ms GPU par passe), `window.__nprInfo`.

## Décisions (et pourquoi)

- **Composer piloté à la main** (postprocessing 6.39.5, pas `@react-three/postprocessing`) : un seul `useFrame(…, 1)`
  enchaîne hooks → ombres → G-buffer → encre → SMAA dans un ordre garanti, avec timer queries par passe.
- **Height shadow map à 3 cascades** : proche ±(max(a,b)+90) m (2048², 0,25 m/texel), lointaine ±1 100 m (1024²),
  et **focus** ±90 m devant une caméra basse (2048²) activée seulement pour les plans bas : sans elle, le bord des
  longues ombres montrait l'escalier des texels près de l'objectif. Au près (< 170 m), lecture B-spline 3×3.
- **Empreintes** : disque au sol exact (`bird.shadow`, interpolé entre deux ticks) écrit dans la height map à
  hauteur factice (0,6 m fort / 0,5 m pâle : le fort gagne les chevauchements), type 2 (peint) ou 3 (ne peint pas :
  grisé, sans liseré). L'âme des oiseaux (plus haute) l'emporte, les tours (encore plus hautes) l'effacent.
- **Territoire** : texture RGBA8 (propriétaire, niveau, horodatage 20 Hz mod 250, ancien propriétaire) ; tuiles
  16×16 sales (dans le rectangle sale de la sim) envoyées par `copyTextureToTexture` depuis une texture de transit
  (sinon three copie GPU→GPU) ; ré-encodage à +1,5 s pour vieillir les horodatages. Classification **B-spline
  quadratique 3×3** (bilinéaire 4 taps en Low) + warp à deux octaves : plus d'escalier de cellules en gros plan.
- **Lavis** (bible §4.1) + aquarelle : liseré 3 px, pigment qui s'accumule vers le bord (dégradé doux), lavis
  légèrement inégal (bruit monde basse fréquence), granulation ; transitions encre fraîche / pâle→fort / front
  mouillé (grandes taches de bruit) / tache de piqué (disque ease-out-back + gouttelettes dans l'axe du piqué).
- **Nuit** : derrière le front, palette KF-4 (sol, tours, encre) et **plus d'ombres portées** (tout est dans
  l'ombre de la Falaise) ; lèvre de dernière lumière 3 px côté jour ; fenêtres allumées sur les tours.
- **Dunes** repoussées à ρ ≥ 1,6 (tablier plat autour de l'arène) et tons de pente atténués près de l'arène :
  les pentes corail au couchant se lisaient comme du territoire en haut du cadre de jeu.
- **Tours** : corps exact (lathe des segments, normales lissées < 38° entre troncs, jamais sur une marche plate :
  sinon le dessus d'un disque était coupé par le terminateur au soleil rasant) = caster ; décor sans ombre de gameplay :
  jupe de sable (ton du sol), colliers, nacelles, rampes hélicoïdales (aiguilles, géantes), ailettes (piles, gnomon),
  lanternes pendues sous les grands disques (> 24 m), mâts + fanions neutres qui flottent, haubans et conduites des
  géantes ; dessus des disques en **panneaux d'ombrelle** alternés, dessous rayés, fenêtres = trous d'encre,
  côtes d'oignon, cannelures, fissures.
- **Horizon** : Falaise à 1,7 km dont la crête reprend le profil de la sim (`getCliffProfile`), mesas, Géantes
  lointaines ; brume du sol lointain plafonnée à 0,86 pour que la ligne d'horizon se lise dans les plans bas.
- **Cuvette de sol craquelé** (bible §6.5, optionnelle) : une par carte, côté est, hors de l'anneau d'apparition,
  loin des tours ; réseau de Voronoï à l'encre 30 % (15 % sous la peinture), calculé seulement dans son disque.
- **Glyphes daltoniens** au centre des empreintes : atlas partagé de l'agent ui (`public/ui/glyphs-atlas.png`,
  mêmes formes que le HUD et le téléphone), repli tracé au Canvas2D tant qu'il n'est pas chargé.
- **Coût GPU** : classification B-spline seulement quand une cellule couvre plusieurs pixels (< 0,3 m/px) ;
  ombres lissées seulement à < 170 m ; Simoun, fissures, taches de piqué dans des branches dynamiques ; cascade
  lointaine rendue seulement soleil < 40° ; 3 lectures de bruit par pixel de sol.
- **Pièges rencontrés** : `cast` est un mot réservé GLSL ; un `#define NPR_FOG` de matériau masquait le chunk de
  brume (gardes renommées `NPR_CHUNK_*`) ; couture d'atan plein ouest (là où le soleil se couche) dans le ciel.

## Vérifications

- Captures : `node tools/world-shots.mjs --set=all` → `shots/world/set/*.jpg` (KF80…KF1, grande-ombre, résultats,
  plans bas, daltonien, presets).
- High-key (`docs/art/tools/highkey.mjs`) : KF80 99,0 % / médiane 0,892 · KF50 98,5 / 0,842 · KF25 92,1 / 0,789 ·
  KF16 89,4 / 0,767 · KF10 87,7 / 0,714 · KF3 45,9 / 0,591 · Grande Ombre 0,527 · résultats 0,571 ; < 0,3 : ≤ 0,12 %.
  **KF1 = 0,479** (seuil couchant 0,50) : à 110 s le front a couvert ~95 % de l'arène (palette KF-4) ; la bible
  mesurait KF1 sans nuit spatiale (0,614). Accepté : c'est l'image du gel, suivie du fondu vers KF-15 (0,571).

## Mesures

- CPU (pipeline : hooks du monde + soumission des passes, sim non comprise) : **1,4-2,3 ms**/frame en direct,
  6 oiseaux, machine chargée (load 10-20). Pas de fuite (tas JS et nombre de textures/géométries stables sur 40 s).
- Draw calls : 42 (low) / 46 (medium, high) sans les oiseaux ; 15 programmes ; ~147 k triangles.
- GPU : pendant toute la phase parallèle le GPU était saturé par les autres agents (7 à 13 Chrome headless,
  gpu_busy à 100 % même hors de nos mesures) : les timer queries sont gonflées ×2 à ×4 et incohérentes d'une
  passe à l'autre (même les passes plein écran fixes : encre 1,9-5,6 ms, SMAA 1,9-6,7 ms, contre ~1,3 et
  ~2,7 ms mesurés dans la recherche). Minimums observés : Medium 900p (KF16) ombres 0,28 · G-buffer 9,2 · encre 1,95 ·
  SMAA 1,91 ms ; High 1080p ombres 0,44-0,55 · G-buffer 6,5-25 · encre 3,7-4,4 · SMAA 4,8-5,5 ms.
  **Estimation au calme** (facteur de contention calé sur la passe d'encre, même algorithme que le prototype) :
  ombres 0,2-0,3 · G-buffer 3,5-4,5 · encre 1,4 · SMAA 2,7 ≈ **8-9 ms en High 1080p** (budget 10 ms), marge faible
  une fois les oiseaux ajoutés. Coût par pixel du sol comparable au prototype (≈ 11 lectures de texture : 3 bruits,
  4 territoire en vue de jeu, 4 ombre) ; le sol est dessiné APRÈS les autres opaques (renderOrder 900, early-Z).
  **À re-mesurer au calme avant l'intégration** : `node tools/world-perf.mjs "kf=16&q=high" "kf=3.5&q=high" "kf=16&q=high&cam=low"`.
  Leviers prêts si besoin : SMAA MEDIUM en High (−0,3 ms), hachures du sol (rides) désactivées, cailloux 1 500.

## Limites connues / reste à faire

- Mesure GPU au calme (voir ci-dessus).
- KF1 (fin de manche) sous le seuil high-key du couchant (0,479 < 0,50) : conséquence de la nuit spatiale KF-4
  prévue par la bible ; à trancher par le lead si besoin (éclaircir le sol derrière le front).
- La caméra de jeu (phase 3) doit être la caméra par défaut du Canvas (`makeDefault`) : le pipeline suit
  automatiquement le changement de caméra (passes reconstruites).
