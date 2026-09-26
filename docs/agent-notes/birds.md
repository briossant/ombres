# Agent birds — oiseaux, cavaliers, FX « encre »

État : **module fonctionnel, intégré au cadre NPR de l'agent world** (rendu, ombres, palette jour/nuit,
IDs d'encre), testé avec la **vraie simulation** (entrées scriptées). Page de lookdev :
`http://localhost:8802/dev/birds.html` (paramètres en tête de `src/dev/birds/main.tsx`).

## 1. API d'intégration (phase 3)

```tsx
import { Birds } from './render/bird/Birds.tsx'
import { Fx } from './render/fx/Fx.tsx'

<WorldCanvas>
  <GameCamera makeDefault />
  <Birds quality={level} />                  {/* useFrame priorité −1 */}
  <Fx quality={level} glorySlot={winner} />  {/* useFrame priorité 0, APRÈS <Birds/> */}
</WorldCanvas>
```

- Les deux composants lisent **`gameView`** (`sim`, `prevBirds`, `alpha`, `players`, `colorblind`,
  `timeScale`) à chaque frame, sans re-render React. Le runner doit écrire `gameView` dans un `useFrame`
  de priorité < −1 (avant les oiseaux), et publier les `SimEvent` sur `simEvents` (`src/host/bus.ts`).
- La **caméra** doit être placée avant `<Birds/>` (priorité < −1) : la taille à l'écran pilote le
  niveau de détail, l'échelle cosmétique et la taille minimale de la couronne.
- `quality` : `'low' | 'medium' | 'high'` (= `useRenderQuality().level`). Maillage des gros plans
  (`low`/`medium`/`high`), plafond de particules 300 / 800 / 1 500. Les hachures suivent `NPR.uQuality.x`.

### `<Birds />` (`src/host/render/bird/Birds.tsx`)

| Prop | Défaut | Rôle |
|---|---|---|
| `quality` | `'high'` | maillage des gros plans ; au loin, toujours le maillage `far` (1 755 triangles) |
| `renderScale` | `'auto'` | échelle cosmétique : envergure ≥ 60 px (1080p), plafonnée à `RULES.birdRenderScaleMax` (×1,3), `RULES.birdRenderScaleMaxCrowded` (×1,6) au-delà de 8 oiseaux ; ou un facteur fixe (gros plans : `1`) |
| `modes` | — | par slot : `'fly'` ou `'perch'` (podium : cormoran qui sèche ses ailes, tête de profil, liseré de contre-jour ; voir « Polish vague 1 ») |
| `castShadows` | `true` | inscrit l'**âme** de chaque oiseau dans la height shadow map (`shadowCasters.add`, owner = slot + 1, force 1,0 BAS → 0,6 HAUT) |
| `view` | `gameView` | autre vue (écran titre, podium avec un état factice) |
| `onController` | — | reçoit le `BirdsController` (accès aux rigs, `modes`) |

Hors React : `new BirdsController(options)` + `controller.update(view, camera, dt, viewportH)` +
`scene.add(controller.root)`. `dispose()` (contrôleur comme `FxSystem`) libère les ressources GPU et
les casters mais **ne détache pas** `root` : robuste au double montage de StrictMode (les slots sont
recréés paresseusement au `update` suivant) ; retirer `root` de la scène reste à la charge de l'appelant.

### `<Fx />` (`src/host/render/fx/Fx.tsx`)

| Prop | Défaut | Rôle |
|---|---|---|
| `quality` | `'high'` | plafond de particules |
| `glorySlot` | `−1` | **gloire de victoire** (24 rayons d'encre, 6°/s) derrière cet oiseau (résultats, podium) |
| `events` | `simEvents` | bus d'événements |
| `onSystem` | — | reçoit le `FxSystem` (`push(event)`, `setGlory(slot)`, `stats()`) |

4 draw calls au total (rubans, traits, sprites, icônes), tout instancié et poolé, aucune allocation par frame.

### Pour l'audio : `birdAnimEvents` (`src/host/render/bird/anchors.ts`)

```ts
import { birdAnimEvents } from './render/bird/anchors.ts'
birdAnimEvents.on(e => { /* e : { type: 'wingbeat', slot, amp, power, x, y, z } */ })
```

Émis par `<Birds />` à chaque battement **visible** (l'aile passe l'horizontale en descendant,
comme le demande docs/research/assets.md §5.2 : « déclenché à chaque passage de sin(φ) à 0 vers le
bas ») : `amp` 0,12 → 1 (croisière → montée forte), 1,2 et `power: true` pour le COUP D'AILE.
L'objet événement est réutilisé : ne pas le conserver. Les battements sont rares en HAUT (plané),
lents en BAS, rapides en montée : le son suit l'image sans autre logique.

### Contrat avec le runner

- `gameView.prevBirds[slot]` doit être une **copie** de l'état du tick précédent (avec `shadow`
  copié), pas une référence à l'état courant ; `alpha` dans [0, 1].
- `gameView.timeScale` ralentit les animations et les FX (ralentis de touche) ; `players[slot].colorIndex`
  donne la couleur ; `colorblind` active glyphes et jetons.

### Ce que chaque état/événement produit

| Source | Oiseau (animation, matériau) | FX |
|---|---|---|
| `z`, `vz` | battements 0,6 Hz en BAS, plané + rafales rares en HAUT, amples (2 Hz) en montée ; ailes en flèche en descente ; tangage selon `vz` ; ×1,10 en HAUT | bouffées de sable (BAS), filets d'air blancs aux bouts d'ailes (HAUT) |
| `turnRate` | inclinaison ∝ taux de virage (≤ 50°, aile intérieure basse), tête qui regarde dans le virage, queue qui vrille | — |
| `dive` windup | cabré (0,2 s), ailes levées | « ! » au-dessus de la cible (`diveTarget`) |
| `dive` guided/committed | ailes repliées en pointe de flèche, nez bas, cape plaquée ; au clac : claquement d'ailes | lignes de vitesse, traînée coupée, traînée blanche rectiligne au clac, traits de claquement |
| `flap` (front montant) / `flapCooldown` | coup d'aile puissant ; **bouts d'ailes ombrés pendant la recharge, blancs + éclair quand prêt** | traits de souffle sous les ailes |
| `stun` (+ `stunKind`) | roulé-boulé complet (se termine à 2π exactement), cou ballant | étoile d'impact + plumes (`diveHit`), étoiles d'encre autour de la tête, gerbe de sable (`diveMiss`) |
| `immune` | — | plumes hérissées : 8 traits radiaux clignotant à 4 Hz |
| `hidden` | 55 % vers l'ombre portée (35 % si `paletteElev` < 10), pièces colorées ≥ 80 % de leur chroma, liseré `sandLit` KF1 côté soleil au soleil bas | œil barré |
| `lockedBy` | — | chevron à la couleur du chasseur (un seul par cible) |
| `crownSlot` | couronne plate à 3 pointes, aplat `#FFF2C3` non éclairé cerné (≥ 16 px), ≈ 3 m au-dessus du cavalier ; sur la capuche en gros plan ; sur la tête au podium | anneau d'encre (60 → 14 px) centré sur la couronne affichée + 6 rayons (`crown`) |
| `assist` (sim ou `players[slot].assist`) | — | icône plume à droite de l'oiseau |
| `gameView.colorblind` | glyphe du joueur sur le fanion (gros plans) | jeton-glyphe permanent au-dessus de l'oiseau |
| `paleOnStrong` / `bigSteal` / `bump` / `towerBump` | — | étincelles « tsk » / coup de pinceau le long de la trajectoire de l'ombre / plumes + bouffée |
| `night.active` | palette KF-4 derrière le front (par pixel) | poussière violette le long du front |
| `inStorm` | ailes qui tremblent | — |

Non géré ici : empreintes au sol, fil d'ombre, taches de piqué (monde) ; flash « planche »
(`requestPlancheFlash()` du cadre NPR, à appeler par le runner sur `diveHit`).

## 2. Architecture

```
src/host/render/bird/
  geometry.ts   maillage procédural (lofts lissés) + os + poids ; 4 niveaux (far/low/medium/high)
  skeleton.ts   27 os (corps, cou ×3, tête, queue ×2, ailes ×4 par côté, pattes, cavalier, cape ×2, mât, fanion ×2)
  curves.ts     profils monotones, Catmull-Rom, répartition des stations
  animator.ts   BirdFrame (état interpolé) → BirdPose, ressorts amortis (Euler implicite, stable)
  pose.ts       BirdPose (nombres purs)
  rig.ts        squelette + SkinnedMesh (mode « detached », monde) + coque d'encre ; applyPose ; ancres
  material.ts   matériau corps (deux tons os, couleur joueur, cuir hachuré, œil, visage, bouts d'ailes) + coque
  crown.ts      couronne du meneur
  controller.ts pilote impératif : un rig + animateur par slot, LOD, uniforms, caster, couronne, ancres
  anchors.ts    registre des ancres (queue, bouts d'ailes, tête, bec, haut du cavalier, poitrine) pour les FX
  npr.ts        adaptateur vers src/host/render/npr (uniforms, chunks, casters, IDs)
  glyphs.ts     12 glyphes des joueurs en SDF (fanion, jetons)
  Birds.tsx     composant R3F
src/host/render/fx/
  system.ts     FxSystem : pools, émetteurs par état, événements, dessin immédiat
  batches.ts    SpriteBatch (SDF instanciés), StrokeBatch (segments en px), RibbonBatch (rubans)
  glsl.ts       formes SDF (bouffée festonnée, plume, chevron, « ! », œil barré, plume-icône, jeton, anneau, croix, motte)
  path.ts       tampons circulaires (traînées, historiques)
  Fx.tsx        composant R3F
```

## 3. Décisions

- **Oiseau entièrement procédural** (pas de primitives) : un seul loft continu queue → corps → cou en S →
  tête → bec droit (sections elliptiques dessinées par profils monotones), ailes en loft de profils NACA
  (bord d'attaque qui avance jusqu'au poignet puis file en flèche, bord de fuite échancré près du corps :
  silhouette en « M » tendu, allongement ≈ 9,6), crête courte, queue en éventail étroit arrondi. Normales
  lissées (maillage indexé, pointes à normale imposée), faces orientées automatiquement (volume signé).
- **Vue de dessus d'abord** : planform retravaillé jusqu'à ce que corps, cou, bec et queue restent
  lisibles entre les ailes à 46-90 px ; bande de couleur de 55 à 70 % de la demi-envergure, cernée (ID).
- **Cavalier minuscule** (×0,74 autour de la selle) : buste et capuche en cuir ocre hachuré, visage =
  creux d'encre, bras vers les rênes, jambes à califourchon, **cape-manteau** nouée sous la capuche
  (2 os à ressorts), tapis de selle à rabats qui débordent du corps (lisible de dessus), mât + fanion
  fourchu (2 os, glyphe en mode daltonien) masqué au loin.
- **Squelette + SkinnedMesh en mode `detached`** (matrixWorld identité, positions skinnées = monde) :
  le proxy caster de la height map (même squelette, même matrixWorld) reproduit exactement la
  déformation. L'âme suit l'échelle cosmétique (un oiseau dessiné ×1,3 avec une âme ×1 serait
  incohérent) ; l'**empreinte de gameplay** (monde) reste exacte.
- **LOD** : maillage `far` (1 755 tris, sans pattes/crête/fanion/bras) sous 190 px d'envergure,
  maillage du preset au-delà de 240 px (hystérésis). Le caster garde toujours le `far`.
- **Animation 100 % ressorts** (Euler implicite) : aucune discontinuité ; le roulé-boulé a sa propre
  horloge et se termine à 2π ; les impulsions (coup d'aile, clac) sont des canaux additifs à enveloppe
  nulle aux bords ; front montant détecté sur l'état (pas besoin des événements).
- **Coup d'aile prêt = bouts d'ailes blancs** (table des signes) : pendant la recharge, le bout d'aile
  est ombré et se « remplit » vers la pointe ; éclair crème au moment où il est prêt.
- **FX en mode immédiat** : 4 lots, chaque frame reconstruit les instances depuis des pools
  préalloués (≈ 20 floats par instance). Formes SDF plates cernées d'encre, disparition par
  rétrécissement ou trame (screen-door attaché à la forme), **aucun additif**. `gNormalId = 0`.
- **Icônes empilées à l'écran** (jeton daltonien, chevron, « ! », œil) au-dessus du cavalier, sans test de
  profondeur (toujours visibles), tailles minimales en px ; la couronne décale la pile.
- **Plumes hérissées** : ellipse horizontale calée sur l'envergure (lisible vue de dessus) plutôt qu'un
  cercle dans le plan de l'écran (trop discret, testé).

- **Icônes et couronne « au-dessus » = vers le haut de l'ÉCRAN** (axe haut de la caméra), à une
  hauteur qui croît avec la plongée (3,5 m caméra horizontale → 5,7 m en vue de dessus,
  `anchors.ts : crownLift/iconLift`) : en jeu, un décalage vertical monde passait sur le cou et le
  bec de l'oiseau quand il vole vers le haut de l'écran (capturé et corrigé).
- **Couronne 3D présentée de face** (base calée sur la caméra, légère bascule + balancement) : vue
  de dessus, une couronne horizontale se lisait comme un gobelet.
- **Podium** (`modes[slot] = 'perch'`) : ailes levées en V héraldique qui « respirent », pattes
  sorties, corps redressé. Le repli complet de la membrane a été essayé et rejeté (ailes en paquets).
- **Coup d'aile** : onde à faible déphasage (l'aile reste tendue, plus d'aile « cassée » à la remontée),
  abattée plus longue que la remontée (phase déformée), amplitude ±48° à la pointe en montée.
- **FX au sol** posés à 0,9 m (au-dessus des ondulations ≤ 0,6 m du sable du monde) ; rubans sans
  culling (le sens des triangles dépend du sens de la tangente).
- **IDs d'encre** : corps 20 + s, cavalier et mât 44 + s, pièces colorées 60 + s, couronne 221
  (réservés dans `npr/ids.ts` par l'agent world).

## 4. Vérifications

- Page `dev/birds.html` (vues `closeup`, `states` ×2 planches `?set=2`, `flock`, `game`) avec le
  cadre NPR complet et la vraie simulation ; captures regardées à chaque itération (`shots/birds/`).
- `node src/dev/birds/shots.mjs <dossier> [--sheet=planche.jpg --tile=3] nom="requête"…` : série de
  captures + planche. `node src/dev/birds/catch.mjs <sortie.jpg> <type> [--delay= --slow=0.1 --query=]` :
  capture au moment d'un SimEvent réel (caméra recadrée sur l'oiseau, ralenti cosmétique pour figer
  un effet bref) — utilisé pour `diveHit`, `diveWindup`, `diveCommit`, `diveMiss`, `crown`,
  `bigSteal`, `paleOnStrong`, `flap`.
- Tests (`npx vitest run src/host/render/bird src/host/render/fx`) : continuité de l'animation
  (aucun saut sur piqué/clac/décrochage/coup d'aile/inversion de virage, roulé-boulé qui boucle à
  2π), inclinaison ≤ 50° vers l'intérieur, repli en piqué ; maillage (envergure = RULES.wingspan,
  poids normalisés, normales sortantes, `far` < 2 500 triangles) ; FxSystem sans GPU (tous
  événements/états, plafond de particules) ; PathBuffer.
- CPU mesuré (machine chargée, load ≈ 8-15) : `BirdsController.update` 0,9 ms moyenne / 1,5 ms p95
  pour 12 oiseaux ; `FxSystem.update` 0,34 ms / 0,8 ms p95. Draw calls de la frame complète (monde +
  12 oiseaux + FX) : 94.

## 5. Limites connues / reste à faire

- Le coup de pinceau de gros vol suit l'historique des centres d'ombre (3 s à 10 Hz) : invisible si
  l'oiseau n'a pas bougé (cas des marionnettes de la page de dev, jamais en jeu).
- Perf : mesures GPU non fiables pendant la phase parallèle (GPU partagé à ~99 %). Budget visé :
  12 oiseaux × 2 draw calls (corps + coque) + 4 draw calls FX + 12 casters ; 12 × 1 755 × 2 tris au loin.
- Phase 3 : appeler `requestPlancheFlash()` sur `diveHit` ; brancher `glorySlot` aux résultats ;
  `modes[slot] = 'perch'` au podium (+ poser les oiseaux sur les tours) ; `renderScale={1}` en gros plan.


## 6. Polish vague 1 (correcteur birds, ordres B1-B7)

Détail, preuves et limites : `docs/polish/fix-birds.md`. Changements d'API et de comportement :

- **Échelle à 9-12 oiseaux** (B1) : plafond `RULES.birdRenderScaleMaxCrowded` (1,6, Edit ciblé de `src/sim/rules.ts`) dès que la sim compte plus de 8 oiseaux.
- **LOD lointain** (B1) : sous 68 px d'envergure affichée (fondu jusqu'à 98 px), bande d'aile élargie à 38 % de la demi-aile (`BAND_FAR`, 0,38 → 0,76 de la demi-envergure), cape et selle ×1,6 autour de la selle (déformation en espace de liaison, `uAccentScale`), coque 1,2 → 0,5 px, et pièces colorées **sans ID propre** sous 78 px (hystérésis 78/86 px) : le cerne interne mangeait la bande. Nouveaux uniforms par oiseau : `uBand` (Vector2, n'est plus partagé), `uAccentOn`, `uAccentScale`, `uHullWidth`, `uPerch`.
- **Couleur d'identité** (B1/B5) : les pièces colorées gardent ≥ 80 % du chroma de la couleur du joueur (60 % dans la nuit), luminance ramenée à mi-chemin de celle de l'albédo (au couchant, la lumière chaude délavait les bandes en pastel) — `keepChroma()` dans `material.ts`.
- **Caché** (B5) : mélange 55 % → 35 % quand `paletteElev` < 10 ; liseré de lumière `uLipColor` (sandLit KF1) côté soleil, porté par la coque (élargie à 3 px côté soleil : il reste ≈ 1,5 px sous le trait du post-traitement), jamais dans la nuit.
- **Podium** (B3) : pose `perch` = cormoran (corps à 42°, ailes ouvertes à l'horizontale, surface vers la caméra, mains tombantes qui respirent, cou avancé, tête de profil — côté stable par oiseau) ; `uPerch` : 25 % de remplissage de la face à l'ombre + liseré de contre-jour de ≈ 2,5 px (coque de 4 px côté soleil, crème-corail). Couronne posée au-dessus de la tête : **`PERCH_CROWN_TOP_M` (1,1 m au-dessus de l'ancre `head`) doit rester libre sous le bandeau** (à l'usage de la caméra du podium).
- **Couronne** (B4) : `crownLift(down) = 2,5 + 1,0 × down` (m), jamais multipliée par l'échelle cosmétique au-delà de 1 ; géométrie plate extrudée (`crown.ts`, `CROWN_WIDTH` 2,4 m, `CROWN_HEIGHT` 1,3 m), aplat non éclairé, coque 1,5 px ; gros plan (> 200 px d'envergure, fondu 170-230) : 0,55 m × échelle, posée sur la capuche ; la position affichée est publiée dans **`birdAnchors.crown`** (`slot`, `frame`, centre `cx/cy/cz`, haut `tx/ty/tz`) : l'anneau « couronne gagnée » et la pile d'icônes s'y calent. `framingRig.ts` (staging) utilise encore `crownLift × scale` : surestimation sans danger.
- **FX** : `FxSystem` oublie traînées, particules et effets quand `view.sim` change et quand un oiseau saute de plus de 20 m (B2) ; bouffées ≤ 60 px à l'écran et rétrécies sous 25 m, ruban ≤ 6 px, effilé sur ses 30 % finaux et aminci sous 30 m, lignes de vitesse et traînée du clac ≤ 25 % de la largeur, icônes d'état masquées en démo et au-delà de 200 px d'envergure (B6) ; gloire limitée à un disque de 250 px, rayons à 35 % (B3) ; esquive (`diveMiss` + `dodged`, B7) : double arc de souffle (`SHAPE.arc`, 0,4 s, 26-90 px de rayon), 4-6 plumes arrachées au chasseur, 3 étoiles épaisses à halo papier au-dessus du chasseur planté pendant son décrochage.
- **Correctif de shader** (`batches.ts`) : `inkBoost` amincissait les traits au lieu de les épaissir (signe inversé) : les étoiles du décroché n'étaient que des points et l'anneau « couronne gagnée » était invisible. Corrigé ; les « ! », mottes et arcs sont un peu plus épais.
- Outils : `tools/polish/fix-birds/game.mjs` (partie réelle figée à des instants choisis, recadrages ×3, `--reads` au format de `read-stats.mjs`, `--png`), `dodge.mjs` (captures autour des esquives), `zoomgrid.mjs` (zoom ×8 avec grille pour `sample-oklch`). Le HMR de Vite est coupé dans ces pages (autres correcteurs en parallèle).
