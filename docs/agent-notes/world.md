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
- **Qualité** (`src/host/render/quality.ts`) : `useRenderQuality.getState().setLevel('low'|'medium'|'high'|'ultra')`
  change le preset **à chaud** (dpr 720p / 1080p / 1080p / natif ≤ 2160p, SMAA, résolution d'ombre, hachures,
  cailloux, nuages… ; correcteur AA, voir la section en fin de fichier) ;
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

## Polish vague 1 (correcteur world, ordres W1-W13 de docs/polish/ORDERS.md)

Détail, preuves et mesures : `docs/polish/fix-world.md`. Changements d'API et écarts à la bible :

- **dpr** (W1) : `WorldCanvas` calcule le dpr plafonné (`presetDpr(QUALITY_PRESETS[level], hauteur CSS du
  canvas, devicePixelRatio)`, suivi par ResizeObserver + `resize`) et le passe en **prop** au `<Canvas>` ;
  plus aucun `setDpr` dans `NprPipeline` (R3F remettait la prop à chaque rendu du Canvas).
- **Qualité auto** (W2, `quality.ts`) : banc High seulement si médiane ≤ `BENCH_HIGH_MAX_MS` (8,5 ms), Medium
  ≤ 12 ms. `QualityMonitor.pushGpu(ms)` (temps GPU de chaque image de manche, phases golden → greatShadow,
  requête TIME_ELAPSED du pipeline lue en asynchrone), `gpuP90()`, `verdict(level)` ;
  **`shouldDowngrade(level)` inchangée côté appelant** (runner.ts, aux résultats) : un cran plus bas si
  p90 > budget × 1,1 (repli sans timer query : intervalles d'image bornés à 100 ms), puis remise à zéro
  (chaque appel clôt la manche ; changement de preset = remise à zéro). Sans banc mémorisé, le niveau de
  départ est **Medium** (chauffe du chargement). `GpuTimer.time()` s'efface si une requête TIME_ELAPSED est
  déjà active (sondes de QA) ; `GpuTimer.poll(onSample?)`.
- **Uniforms partagés ajoutés** (`npr/uniforms.ts`) : `uFpEllipse[13]`, `uFpDir` (ellipses d'empreinte,
  écrites par `BirdFootprints`), `uNightSpeed` (vitesse du front, `frontSpeed` de la sim), `uLipLab`,
  `uPaintCMax` (plafond de chroma de l'heure dorée, `PAINT_C_GOLDEN_MAX` = 0,125 dans `palette.ts`),
  `uBirdScr[12]` / `uBirdScrN` (oiseaux projetés à l'écran, `world/birdScreen.ts`, pour la dissolution en
  trame), `uSketch` / `uSketchFront` / `uSketchSpan` (crayonné du compte à rebours, `world/countdownSketch.ts`).
- **ID « trame »** `OBJ_ID.screenDoor = 254` (`npr/ids.ts`) : pixels gardés d'une dissolution en trame
  (screen-door IGN). L'encre ne les cerne pas et ignore leurs frontières (normales, IDs) : sans cela chaque
  point de la trame devenait un point noir. Utilisable par les FX (birds) pour leurs dissolutions.
- **Ombres** (W5) : chunk `shadow` → `sampleShadowAuto(wp, bias, dp0)` : B-spline 3×3 dès qu'un texel de la
  cascade couvre plus d'un pixel (dp0 = |fwidth(p0)|), 4 taps sinon (au lieu du seuil `vDist < 170 m`).
  En manche, cascade focus sur `cameraState.frame` + 20 m (lecture seule de `camera/cue.ts`) si ce cadre est
  plus serré que 0,7 × la cascade proche.
- **Tours** : anneaux de sommets 2 et 6 m sous chaque surplomb (`Seg.inner`, cavité exacte) ; hachures en
  bande (silhouette + terminateur), couche croisée seulement si cavité < 0,25, pas 8,5 px et opacité × 0,6
  au-delà de ~150 px de large, contre-jour sans hachures + filet `sandLit` côté soleil (W7) ; dissolution en
  trame au-dessus de 20 m (< 60 m de la caméra ou devant un oiseau), coupée au podium (W9).
- **Simoun** (W10) : rideau opaque (ID `storm`, cerné par l'encre), festons découpés net, dissolution en
  trame < 80 m de la caméra ou devant un oiseau. Il écrit la profondeur : le sol derrière est éliminé par
  l'early-Z.
- **Amendements de la bible** (arbitrages du lead §1.2) :
  - §4.5 / §5.1 — ombre sur la **peinture** : luminosité au ratio de l'ombre (inchangée), chroma × 0,85 et
    teinte tournée vers 290° (violet des ombres) par le chemin court, de 0,22 × l'écart côté rouge / 0,15 côté
    vert (≤ 40°) ; le sable nu garde 100 % vers `castShadow`. Même règle pour l'ombre teintée des empreintes
    sur la peinture. ΔE entre joueurs gelés ≥ 0,059 (0,0591), aucune ombre olive (h 60-110°, L < 0,55).
  - §4.6 — côté **nuit** pendant la Grande Ombre : lavis KF-4 puis L − 0,10, C × 0,52 et même rotation
    (sans rotation, Safran virait au kaki), granulation « sec » doublée ; vague de 0,3 s au passage de la
    lèvre (liseré papier qui s'éteint) ; bande de lumière rasante de 6 à 12 m devant le front (L + 0,06,
    35 % vers `sandLit` KF1) ; lèvre de 4 px. L'illumination des résultats (§4.7) rallume tout.
  - §4.1 — garde **pâle / sol** : ΔE(pâle, sol local) ≥ 0,06 (L d'abord, du côté du fort, ≤ 0,05 d'écart ; puis
    chroma ≤ 0,85 × celle du fort). Chroma des forts plafonnée à **0,125** (et non 0,12) à l'heure dorée :
    à 0,12, Corail / Carmin gelés tombaient à 0,058. Lavis inégal ± 3,5 % de L sur ~30 m, liseré ≥ 0,8 m.
  - §5.3 — tirets du liseré pâle paramétrés par la **longueur d'arc de l'ellipse** de gameplay (1,8 m, 50 %,
    nombre entier de tirets) au lieu d'une formule monde (damier).
  - §6.5 — rideau du Simoun **opaque** (plus d'alpha 70 %).
- Portes ajoutées : `docs/art/tools/final.mjs` (portes `game*`, formules en jeu dans `docs/art/tools/game.mjs`)
  et `tools/polish/art/pale-vs-ground.mjs` (≥ 0,05, code de sortie 1 sinon). `docs/art/tools` n'a pas de
  `node_modules` : lancer `final.mjs` depuis une copie qui voit culori 4.0.2.
- Outils : `tools/polish/world/` (`cap.mjs` captures figées et reproductibles, `title.mjs`, `countdown.mjs`,
  `profile.mjs` coût par famille d'objets, `swatches.mjs`, `nohmr.mjs` : préchargement qui coupe le HMR de Vite
  dans les pages de test, sinon les éditions des autres correcteurs rechargent la page).
- **Budget GPU (W3)** : High = SMAA MEDIUM, 1 500 cailloux ; rides dans une branche (< 160 m) ; territoire non lu
  hors de l'arène (ρ > 1,06) ; ombres non lues derrière le front de nuit ; sol plat sans conversion OKLab ; rotation
  OKLCH de W4 seulement sous une ombre. Avant / après (A/B entrelacé, build d'avant le polish contre le code courant,
  scène figée, 12 oiseaux, High 1080p ; GPU jamais calme pendant la session) :

  | Phase | avant p10 / p50 / p90 (ms) | après p10 / p50 / p90 (ms) |
  |---|---|---|
  | Midi | 10,12 / 11,05 / 13,58 | 9,39 / 9,52 / 9,67 |
  | Heure dorée | 10,58 / 10,72 / 10,89 | 9,98 / 10,18 / 10,40 |
  | Grande Ombre | 11,74 / 12,09 / 12,72 | 10,79 / 11,66 / 12,40 |

  Sous saturation (99 %), p50 −12 à −14 %. Le p90 ≤ 9,5 ms au calme à la Grande Ombre reste à vérifier
  (`perfmatrix.mjs --q=high --n=12 --speed=1`, GPU calme) et n'est probablement pas atteint : le G-buffer passe de
  ~5,9 ms à midi à ~9 ms à la Grande Ombre. Leviers suivants : SMAA LOW en High, seuil B-spline du territoire.
- High-key : tout passe sauf la Grande Ombre (médiane 0,497 pour 0,50), effet du côté nuit assombri (W6).

## Polish vague 2 — Edits ciblés du correcteur tech (détail : docs/polish/fix2-tech.md)

- `world/prebuild.ts` (nouveau) : `prepareTowers(towers)` construit en tâche de fond (requestIdleCallback, tranches
  de 4 ms) les géométries des tours de la carte suivante de la démo du titre ; `Towers.tsx` les prend avec
  `takeTowers(towers)` (même tableau), sinon construction normale. `towerGeometry.ts` : `buildTowerGeometriesSteps`
  (générateur, une étape par tour) ; `buildTowerGeometries` passe par lui (géométrie identique, test `prebuild.test.ts`).
- `World.tsx` : même objet `arena` d'une carte à l'autre quand (a, b) ne changent pas → le sol (≈ 40 ms), le rideau
  et les cailloux ne reconstruisent plus une géométrie identique à chaque carte de la démo.
- `Pebbles.tsx` : matériaux gardés d'une carte à l'autre (recréés, leur programme était détruit puis recompilé).
- `npr/perf.ts` `GpuTimer` : après une perte puis un retour du contexte, reprend l'extension de minuterie du nouveau
  contexte (avant : `INVALID_ENUM` à chaque image, 169 avertissements en 10 s).

## Polish vague 2 (correcteur world : matière de fin de journée, budget GPU)

Détail, preuves, mesures : `docs/polish/fix2-world.md`. Changements d'API et écarts à la bible :

- **Ombre portée sur la peinture en fin de journée** (amende encore §4.5 / §5.1, après W4) : `NPR.uShadowCool`
  (0 à 40° de l'horloge de palette → 1 à 22°) fait passer l'ombre sur le lavis d'une rotation W4 (vers 290°,
  0,22 × l'écart, ≤ 40°, C × 0,85) à un **glacis violet** : rotation vers 300°, 0,45 × l'écart côté rouge
  (≤ 90°), chroma × 1, puis 30 % vers `castShadow` ; sous l'ombre, un lavis plus sombre que le sol l'est × 1,5
  (c'est ce qui tient deux joueurs gelés à ΔE ≥ 0,059 : au-delà d'un glacis de 0,3, Rose / Lilas et
  Sarcelle / Jade se confondent). **Safran** a sa cible : mauve 340°, C × 0,75, L × 1,16 (sinon framboise,
  voisin du Rose). Les teintes sont calculées par couleur sur le CPU (`palette.ts`, `updateOwnerShade`,
  `NPR.uOwnerShade[13]` = direction ab, facteur de C, facteur de L) : plus d'atan / cos / sin par pixel.
- **Côté nuit** (§4.6, W6) : même table (`NPR.uOwnerNight[13]`, rotation W4, C × 0,52) ; Safran éteint en
  mauve 325°, L + 0,06, C × 0,5 (au lieu de l'ocre brun), Corail en lie-de-vin 0°, L + 0,04 (au lieu du brun
  marron). `gameNightPair` inchangé (0,052, Sarcelle / Jade).
- **Chroma des forts au couchant** : `PAINT_C_SUNSET_MAX` = 0,12 de KF5 à KF1 (avant : aucun plafond, 0,155
  pour les couleurs à cs 1,15), pour les lavis CLAIRS seulement (`NPR.uPaintCapDark`, plafond pondéré par
  smoothstep(0,60 ; 0,68 ; L du fort) : Safran, Anis, Lagon, Rose, Lilas) ; plafonné, un Corail à L 0,59 virait
  au brun. `PAINT_C_GOLDEN_MAX` reste 0,125 pour tous (0,12 casserait `gameFrozenPair`). `game.mjs` :
  `wash(t, G, kf, q, cmax, dark)`, `paintCapDark(pe)`.
- **Aquarelle lisible à distance de jeu** (sol, branche peinture) : densité de pigment (écart au papier,
  L et C, teinte intacte) modulée par le lavis inégal (± 13 %), le grain (± 8 %) et une ligne de marée d'un
  pixel sur le fort (« fleurs ») ; **bande de pigment** de ~5 m au bord de chaque lavis (+8 % pâle, +16 %
  fort) et intérieur des grands aplats forts −7 %, grâce à un **champ de distance aux bords** :
  `TerritoryTexture.edgeTexture` (R8 filtrée, 1 texel = 4 × 4 cellules, chanfrein, recalculée ≤ 10 Hz,
  envoyée par `copyTextureToTexture`) → uniform `uTerrEdge` du sol. Le pâle n'est jamais rapproché du sol
  (densité ≥ 1 : garde W8 intacte). Au couchant, le liseré devient un « plomb de vitrail » (L − 0,035, C × 1,12).
- **Levier de mesure** : `worldView.lookPolish2` (vrai en jeu) ; faux = rendu d'avant (glacis, plafond du
  couchant, densité, bande, cibles Safran). `tools/polish/world/cap.mjs --before` capture la même scène
  avec et sans. `window.__npr = { NPR, presets, scene, gl }` sous `?debug` (scripts d'A/B).
- **Portes** : `docs/art/tools/game.mjs` suit ces formules (`shadeOnPaint(w, cast, G, pe, hDeg)`,
  `nightDim(w, hDeg)`, `paintCMax`) ; `final.mjs` : nouvelle porte `gameNoRustShadow` (aucune ombre sur
  peinture 25° < h < 110°, L < 0,62, C > 0,045 à l'heure dorée et au couchant), `gameShadowChroma` abaissée
  à C ≥ 0,06 (le glacis retire de la chroma aux verts : Jade 0,064). `tools/polish/art/pale-vs-ground.mjs`
  suit le nouveau plafond.
- **Allocations par frame** : `GpuTimer` sans tuple ni `splice` par mesure ; le champ de distance part par
  `copyTextureToTexture` (pas de `initTexture` ni de clé de cache). Mesuré (compteurs WebGL dans la page, manche
  à 12) : 22 `uniform3f` par frame en tout (direction du soleil, caméra, oiseaux), inchangé si la palette est
  repoussée à chaque frame : le `setValueV3f` de la critique tech vient de three et des vecteurs qui bougent
  vraiment, pas de la palette (aucun uniform `number[]` dans le monde). Les 9 `texSubImage2D` 12 × 12 float par
  frame (`initTexture` → `join`) sont les textures d'os des oiseaux (skinning), pas le monde.
- **Coût GPU** (W3, détail et mesures dans `fix2-world.md`) : branche du Simoun au sol limitée à la bande utile
  (ρ ≈ 0,96-1,18), sortie immédiate des taches de piqué hors de 20 m, transitions du lavis seulement sur les
  cellules récentes, teintes d'ombre / de nuit par couleur sur le CPU, grain et lavis inégal lus seulement
  dans l'arène (`textureGrad`), voile du rideau du Simoun sur le CPU (`NPR.uStormVeil`, `uNStormVeil`),
  SMAA LOW en Medium et High (seuil 0,15, 4 pas ; recadrages × 3 identiques à MEDIUM ; réglages fins possibles
  par `QualityPreset.smaaThreshold`, `smaaLuma`). Cible p90 ≤ 9,5 ms NON vérifiée au calme (voir fix2-world §2). Leviers de mesure :
  `NPR.uShadowSmoothPx` (texel d'ombre en px au-delà duquel la B-spline remplace les 4 taps, 1 = W5),
  `NPR.uTerrSmoothDu` (m/px sous lesquels le territoire est classé en B-spline, 0,3 : à 12 oiseaux l'arène
  est à 0,15-0,3 m/px, la B-spline tourne donc presque partout ; la baisser à 0,2 montre des marches de
  cellules de 3 px, gardé), `window.__npr.smaa()`, `tools/polish/world/abperf.mjs` (A/B entrelacé).

## Polish vague 2 — correcteur climax (`towerMaterial.ts`, W9 ; détail : docs/polish/fix2-climax.md)

- **Dissolution franche, plus de moiré à 50 %** : les fragments de tour à moins de `DISSOLVE_NEAR0` = 30 m de
  la caméra (au-dessus de 20 m) ou devant un oiseau (au-dessus de 3 m, fût compris) sont **effacés en entier**
  (`discard` si IGN < sdoor, sdoor = 1 au cœur ; avant : au plus 72 % des pixels, voile tramé sur 40 % du cadre
  quand la caméra rasait les disques du Cadran). Seule une bande étroite fait la transition en trame IGN fixe à
  l'écran : 30 → 38 m, et 90 → 112 % du rayon de dégagement de l'oiseau (`BIRD_CLEAR_R` de `birdScreen.ts`,
  inchangé : le cœur net couvre l'envergure à l'échelle cosmétique maximale). Les pixels gardés de la bande
  gardent l'ID `screenDoor`. Coupée au podium comme avant (`Towers.tsx`, non modifié). Au-delà de 38 m, plus
  aucune trame « de proximité » (avant : 40 → 60 m) : la caméra de manche ne s'installe plus à moins de 45 m
  d'une tour (`framingRig.ts`), la trame ne sert qu'aux passages.
- Coût : même boucle (12 oiseaux) qu'avant ; le cœur effacé réduit le remplissage. Pas de mesure GPU dédiée
  (GPU partagé à 99 % pendant la session).

## Polish vague 3 — correcteur world-3 (bords de territoire de près, budget GPU ; détail : docs/polish/fix3-world.md)

- **Classification B-spline « en flux »** (`groundMaterial.ts`, `territoryBS`) : les 9 texels sont lus en R et G
  seulement et accumulés aussitôt par candidat (`acc`, `accG`) ; B et A (horodatage, ancien propriétaire) sont
  relus sur le seul texel retenu. Image identique au pixel (diff 0 hors du Simoun animé), −1,4 ms par image en
  High à 12 oiseaux (Grande Ombre, A/B entrelacé). Leçon générale pour ce shader : **le coût d'une branche
  rarement prise se paie partout** (le pic de registres fixe l'occupation du shader du sol entier). A/B sur le
  code : `tools/polish/world3/abshader.mjs` (variantes de source compilées une fois, alternées dans la même page).
- **Choix du lissage** : taille du pixel retenue = `min(uSmoothAniso × petit axe, grand axe)` (1,5), pour la
  classification du territoire ET le lissage des bords d'ombre du sol (`dp0`). 1e9 = règle d'avant (levier).
- **B-spline cubique 4×4** (`territoryBC`) sous `uTerrCubicDu` (0,16 m/px : titre, plans serrés de la Grande
  Ombre) ; quadratique jusqu'à `uTerrSmoothDu` (0,3) ; 4 taps au-delà ; Low : 4 taps (`TERR_BILINEAR`). Une
  cellule isolée disparaît en cubique (poids 0,44) : sans enjeu à cette distance.
- Test : `world.test.ts` vérifie que chaque uniform déclaré par le shader du sol a une valeur (les deux variantes).

## Polish vague 3 — correcteur climax-3 (`towerMaterial.ts` ; détail : docs/polish/fix3-climax.md)

- **Chapeaux effacés en entier** (`DISC_WHOLE`) : plus de disque tranché par le cercle de dégagement d'un oiseau.
  `onBeforeRender` du matériau (une fois par image, `renderer.info.render.frame`) appelle `towerCut` pour chaque tour à
  chapeau (`towerHats`, `camera/towerCover.ts`) : si le cercle d'un oiseau caché (NPR.uBirdScr) touche l'ellipse d'un
  chapeau à l'écran (bande 0,9-1,12 × rayon), ou si un chapeau passe à moins de 30-38 m de la caméra (62-72 m à la
  Grande Ombre de la manche : chapeaux de premier plan, `foregroundHats`), la tour est effacée **au-dessus d'une
  coupe** : bas du chapeau (− 6 m sous les disques à lanternes pendues, `hatCutBase`), descendue le long de l'axe tant
  qu'il reste dans le cercle. Décision binaire avec hystérésis (0,35 / 0,02), transition de 0,22 s par la trame IGN.
- Shader : `uniform vec2 uTowerCut[16]` (altitude, part) lu dans le **vertex shader** (tour = (ID − towerBase) / 4),
  varying `vCut` ; fragment : `sdoor = max(sdoor, vCut.y × smoothstep(z − 2, z, y))`. Le reste de la dissolution
  (cercle par fragment sur les fûts et bulbes, proximité 30-38 m) est inchangé. Coupée au podium (`uDissolve`).
- Test : `towerCut.test.ts` (oiseau caché par le chapeau, oiseau devant ou loin, caméra proche).

## Correcteur antialiasing (2026-09-27 ; détail, preuves, mesures : docs/polish/fix-antialiasing.md)

- **Traits d'encre antialiasés** (`npr/InkEffect.ts`) : plus aucune décision binaire. Détection pour tous les
  pixels comme avant (1/z à k = 1 ou 2 pas sur les axes, normale + ID des 4 voisins) ; près d'un bord seulement
  (branches), 3×3 complet : masque des voisins « de l'autre côté » (silhouette côté objet proche, côté fond,
  plis / ID), frontière lissée par filtre boîte + gradient (`edgeFit` : un escalier du tampon devient une
  frontière qui glisse d'une marche à l'autre), puis COUVERTURE du pixel par un trait de largeur continue
  (`band`, rampe de 1 px aux deux bords ; sous 1 px : trait d'un pixel en opacité W, sinon pointillés de phase) ;
  le pixel de fond voisin reçoit la part qui déborde (`spill`, brume et épaisseur de l'objet le plus proche).
  Plis / ID : chaque objet pose sa bande de max(s, 1) px (2 px entre deux objets, 1 px contre le sol, comme
  avant). Coût : +0,4 ms en High 1080p à 12 oiseaux (A/B entrelacé). `inkDebug = 5` : pixels du 3×3 complet.
- **Tremblé R5 réinterprété** : variation de PRESSION du trait (± 28 % à 0,7, bruit monde inchangé) au lieu
  d'un décalage latéral de la lecture (qui, arrondi au texel, faisait des marches d'un pixel entier et des
  traits cassés en pointillés qui scintillaient).
- **Presets** (`quality.ts`) : Low 720p + SMAA LOW ; Medium : canevas à la définition de l'écran (≤ 1080p),
  **G-buffer 900p** (`gbufferScale` 0,833), encre et couleur reconstruites en natif, sans SMAA (budget 8 →
  8,5 ms : p90 7,0-8,7 ms au calme sur une manche) ; High 1080p + SMAA MEDIUM ; **Ultra** (nouveau) : dpr natif jusqu'en 2160p, `supersample: 2`
  (écran 1080p : rendu 2160p réduit par le compositeur = SSAA 4×), SMAA HIGH, 2 200 cailloux. `presetDpr`
  accepte `supersample`. Banc : 2e passe en Ultra si le titre en High coûte ≤ 3 ms (`BENCH_ULTRA_TRY_MS`),
  retenu ≤ 8,5 ms ; High ≤ 8 ms de titre (8,5 avant : High coûte ~0,6 ms de plus), Medium ≤ 11 ms. Clé du
  banc passée en `v2` (le banc repasse une fois).
  Réglage « Qualité » : option Ultra (FR / EN). Oiseaux et FX : `ultra` = détail `high`.
- **G-buffer plus petit que le canevas** (`gbufferScale`, Medium) : `GBufferPass(scene, camera, rt, scale)` ;
  `NPR.uPx` / `uResolution` = taille du G-buffer (les matériaux y dessinent ; `updateBirdScreen` aussi) ;
  l'InkEffect compile la variante `INK_SCALED` (texel lu, distance au bord ramenée au centre du pixel d'écran,
  couleur en Catmull-Rom 5 lectures) et reçoit `setGBufferSize` à chaque image ; couleur du G-buffer en
  filtrage linéaire (normale + ID et profondeur : `texelFetch`). Le 1080p natif coûtait 1,3 à 1,5 × (p90
  11,4 ms au climax à 4 oiseaux) : la surveillance l'aurait fait descendre en Low.
- `NprPipeline` : `NPR.uPx` / `uResolution` pris sur la taille du G-buffer et posés AVANT les hooks
  (`updateBirdScreen` les lit) ; `window.__npr.ink()` (debug) = effet d'encre courant.
- Écarté après mesure : Medium en 1080p natif (coût, ci-dessus) ; SMAA en Medium (+1,1 ms pour un gain à peine
  visible) ; MSAA × 4 sur la passe MRT (WebGL 2 ne lit pas les échantillons, ID moyennés à la résolution).
- Outils : `tools/polish/aa/` — `shots.mjs` (image figée, variantes avant / après, référence SSAA 4×
  `__aa.ssaa(q)`, glissement sous-pixel de la caméra `--pan`, cibles de recadrage automatiques),
  `crops.mjs` (`--auto --sheet`), `metric.mjs` (écart à la référence SSAA sur les bords), `abink.mjs`
  (A/B de coût entrelacé : `__before(q)` / `__after(q)`, variantes du shader d'encre), `legacy-ink.glsl`.

## Vérificateur antialiasing (2026-09-27 ; détail et preuves : docs/polish/verify-antialiasing.md)

- **Ultra : traits trop fins, corrigé** (`INK_WIDE`, compilée seulement si `targetHeight` > 1080). À 2160p
  (s = 2), un trait de silhouette fait 2,2 à 3,8 px et une bande de pli / ID 1,4 à 2,6 px ; la détection
  s'arrêtait à 2 pas (silhouettes) et 1 pas (plis / ID) : Ultra dessinait 25 à 36 % moins d'encre que High sur la
  même image. Maintenant : détection à `ceil(W max)` pas (≤ 4), anneaux intermédiaires 2-3 pour les pixels
  j ≥ 1 (le pixel du bord garde sa couverture lissée), anneau à 2 pas pour les plis / ID des objets. Coût :
  +0,11 ms à 3840×2160 sur Vega (35 ms). Low / Medium / High : shader identique (test
  `npr/InkEffect.test.ts`).
- **Medium : repli à 2 pas** (`INK_SCALED`) : distance ramenée au centre du pixel d'écran (normale de l'anneau)
  au lieu de 1,8 px pour tous les pixels d'écran du 2e texel. Effet faible (épaisseur plus régulière,
  +1,5 % d'encre), coût +0,01 ms.
- Essayés et retirés : borne anti-ringing du Catmull-Rom (aucun effet visible : les points clairs sur les cordes
  sont des battements 900p → 1080p, pas du ringing) ; couleur du fond au-delà de la frontière lissée
  (−2,7 % d'écart à la référence SSAA sur les bords de l'oiseau, invisible à l'œil, +0,08 ms).
- Reste en Medium : dents de 1,2 px sur les silhouettes en biais en gros plan (la couleur suit l'escalier du
  G-buffer 900p) et points clairs qui scintillent sur les traits très fins (cordes, montants). High est net.
- Outils : `tools/polish/aa/verify-shots.mjs` (vraie partie, titre → podium, rafale en vol, n'importe quel
  preset, 1080p / 4K), `verify-sheets.mjs` (planches de recadrages). `tools/polish/tech/common.mjs` :
  `presetSettings(…, bench)` écrit la clé `ombres.qualityBench.v2` (v1 depuis le correcteur : le banc repassait).
