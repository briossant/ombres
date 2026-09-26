# Polish vague 2 : correcteur birds (lisibilité à 9-12 et au couchant, allocations)

Périmètre : `src/host/render/bird/**`, `src/host/render/fx/**`. Edit ciblé hors périmètre : `src/sim/rules.ts`, une seule ligne,
`birdRenderScaleMaxCrowded` de 1,6 à 1,75 (constante cosmétique ajoutée en vague 1 pour ce même ordre B1). Port 8853.
Captures : `shots/polish2/birds/`. Outils : `tools/polish/fix2-birds/` (voir la fin). API et comportements : `docs/agent-notes/birds.md` §7.

Conditions de mesure : GPU partagé à 99-100 % et charge CPU de 17 à 20 sur 12 cœurs pendant toute la session (six correcteurs).
Les chiffres de couleur et de taille sont fiables (images PNG sans perte, sim figée) ; les temps GPU et les allocations sont bruités (voir plus bas).

## Bilan

| Objectif | Statut | Preuve |
|---|---|---|
| Envergure médiane ≥ 60 px à 12 | fait | `read-stats` sur `v3-12/reads.json` : médiane 64 (midi), 65 (après-midi), 67 (heure dorée), 67 (couchant), 66 px (Grande Ombre) ; p10 58-62. Avant (`base` de cette vague) : 59 / 60 / 61 / 62 / 60 |
| Bande ≥ 6 px sur recadrage × 3, 12 couleurs identifiables | fait | `sheets/twelve-x3-day.jpg`, `sheets/twelve-x3-sunset.jpg` (avant / après). Bande de 5 à 8 px de corde à 1:1 (15 à 24 px sur le × 3), 12 couleurs lisibles, y compris au couchant et côté nuit |
| Couleur mesurée au milieu exact des bandes | fait | Sonde `birdAnchors.screen` + OKLCH 3×3 sur PNG. Bandes à C ≥ 0,08 et teinte du joueur à ± 35° : **125 / 144** (6 instants, 12 oiseaux, 2 ailes) contre **60 / 120** avant. Chroma médiane au soleil bas (paletteElev < 10) : **0,116** (p10 0,077) contre 0,077 (p10 0,042) |
| Couchant et oiseau caché : chroma ≥ 0,08, liseré, lecture « à l'ombre » | fait (Sarcelle en réserve) | Grande Ombre, paletteElev 4,3 : 21 / 24 bandes OK, C de 0,09 à 0,165 (`v3-12/bands.txt`). Oiseau caché au couchant vu de loin (`hidden-e5/`) : bande Lilas C 0,124, os assombri vers l'ombre portée, liseré crème côté soleil |
| Allocations par frame (fx/system.ts, bird/animator.ts) | fait en partie | bird/** + fx/** : 62,8 ko/frame avant, 12,9 ko/frame après (−79 %, même phase). Sites de la critique supprimés (détail plus bas) |
| Coût GPU | mesuré, borné | Oiseaux affichés / masqués en alternance : 12 oiseaux coûtent ≈ 0,9 ms (G-buffer + ombres) sur un GPU occupé à 99 %. L'écart avant / après n'est pas mesurable dans ce bruit (voir plus bas) |

## Ce qui a changé

**Taille à 9-12 oiseaux** (`controller.ts`, `rules.ts`). Au-delà de 8 oiseaux, l'échelle automatique vise 66 px d'envergure (60 sinon)
et plafonne à ×1,75 (×1,6 avant). À ×1,6, le plafond bloquait presque tous les oiseaux bas en plan d'arène (50 px mesurés) : la médiane
restait collée à 59-60 px.

**LOD lointain** (envergure affichée < 68 px, fondu jusqu'à 98 px ; `material.ts`, `controller.ts`) :
- bande d'aile de 0,30 à 0,82 de la demi-envergure (0,38-0,76 avant) : du coude jusqu'à 0,2 m des bouts d'ailes, qui gardent le signal
  « coup d'aile prêt ». Le corps, l'aile intérieure et les bouts restent blanc os : l'oiseau reste blanc, la couleur passe de la « croix
  noir et blanc » à deux vraies ailes de couleur (`sheets/twelve-x3-day.jpg`) ;
- cape et selle × 2 (× 1,6 avant) ;
- cerne plus fin : coque de 0,2 px (0,5 avant), et plus aucun trait interne au loin. Le cavalier avait encore son propre ID : son contour
  d'encre faisait un nœud noir au milieu de chaque oiseau ;
- couleur d'identité à 100 % du chroma du joueur au loin, × 1,12 pour compenser l'effet de petit champ (une tache de 6 px paraît plus
  terne qu'un aplat), brume réduite de 60 % sur les pièces colorées.

**Couchant, nuit, caché** (`material.ts`) :
- pièces colorées à 100 % du chroma au soleil bas (paletteElev 16 → 10), 85 % dans la nuit (60 % avant : à la Grande Ombre, les
  bandes côté nuit tombaient à C 0,03-0,06), teinte ramenée vers celle du joueur (le corail du couchant rosissait Prune et Lilas) ;
- liseré de lumière rasante pour tous les oiseaux au soleil bas hors de la nuit, et plus seulement pour les cachés. En vol, il n'allume
  que le bord franchement tourné vers le soleil (≈ 1 px). Pour un oiseau caché, il couvre un contour plus large (≈ 1,5 px), et au podium
  il reste à 2,5 px. Couleur : `sandLit` KF1 éclairci à 40 % vers la crème. Premier essai en orange pur sur tout le contour : chaque oiseau
  semblait cerné de Corail (`v1-12/crops-005`), corrigé ;
- oiseau caché : l'os garde le mélange vers l'ombre portée (35 % au soleil bas), ce qui conserve la lecture « à l'ombre ». Seules les
  pièces colorées gardent leur chroma.

**Allocations** (critique tech §17). Mesure CDP (`HeapProfiler.startSampling`, 12 oiseaux, heure dorée), `shots/polish2/birds/alloc.md` :

| | avant (59 i/s) | après (37 i/s) | après (16 i/s, charge 20) |
|---|---|---|---|
| bird/** + fx/** | 3,63 Mo/s, 62,8 ko/frame | 0,47 Mo/s, 12,9 ko/frame | 0,31 Mo/s, 20,5 ko/frame |
| `drawTrail` + `trailPoint` | 2,81 Mo/s | 0 | 0 |
| `setWing` (noms d'os construits à chaque frame) | 58 ko/s | 0 | 0 |
| `springTo`, `upload`, `noise1`, `drawBristles`, `updateParticles` | 280 ko/s | < 3 ko/s | < 3 ko/s |

- **Cause principale** : chaque flottant passé en argument à une fonction non intégrée par le JIT est mis en boîte, donc alloué. Les
  rubans et les traits passent désormais par un tableau de saisie (`RibbonBatch.v`, `StrokeBatch.v`, `FxSystem.tp`) suivi de `commit()`.
- **Autres corrections** :
  - `Math.hypot` remplacé par `Math.sqrt` dans fx (le builtin alloue un tableau par appel) ;
  - plages d'envoi GPU persistantes (`addUpdateRange` allouait un objet par attribut et par frame) ;
  - `springTo` ne renvoie plus rien ;
  - `BirdFrame` et `Spring` sont des classes aux champs initialisés (un littéral `{ x, … }` partage ses transitions de forme avec tous les
    littéraux commençant par `x`) ;
  - contexte d'animation réutilisé ;
  - uniforms scalaires écrits seulement quand ils changent : un flottant écrit dans `{ value }` alloue une boîte.
- **Reste** : 13 à 20 ko/frame, dans `frameFromStates`, `FxSystem.updateBird` et `BirdAnimator.update`. D'après `--trace-opt`, sous cette
  charge CPU, V8 laisse ces fonctions au niveau de base (Sparkplug) ou à Maglev, et chaque opération sur un flottant y alloue. Même
  code dans une boucle isolée, optimisée : `frameFromStates` passe à 2 o/appel. Ce reste dépend donc du JIT et de la charge, pas d'une
  allocation explicite dans le code. Les valeurs à 37 et 16 i/s encadrent le bruit.

**GPU** (`gpu.txt`) :
- **Mesure** : alternance oiseaux affichés / masqués (`gpubirds.mjs`, page de lookdev, 12 oiseaux, couchant). Passes G-buffer + ombres :
  9,50 contre 8,64 ms, soit ≈ 0,9 ms pour les 12 oiseaux au total, sur un GPU occupé à 99 % (tous les temps y sont gonflés
  d'environ × 1,5 par rapport à la vague 1).
- **Ajouts par fragment** : deux multiplications dans `keepChroma` et le facteur de brume.
- **Ajouts de surface** : environ 40 % de fragments « pièce colorée » en plus au loin (bande plus large) et 1,5 px de coque du côté du soleil
  au couchant.
- **Conclusion** : l'écart est très inférieur au bruit de mesure. Aucun draw call ni aucune passe en plus.

## Vérifications

- `tools/polish/fix2-birds/game.mjs --n=12` : `base-12` (avant) et `v3-12` (après), 6 instants de midi à la Grande Ombre ; `v4-4`
  (4 oiseaux : compte à rebours, heure dorée, couchant). Le rendu proche est inchangé, les bandes étroites restent cernées.
- `tools/polish/art/twelve.mjs` (2 claviers + 10 bots, vitesse réelle, HMR coupé) : `art-twelve/`, 31 images regardées, console propre.
- `tools/polish/feel/match.mjs --name=…/feel-twelve --groups=1,2` + 10 bots, 1 manche : 2 672 images, console propre. Sa sonde de lecture
  renvoie des envergures à 0 : elle importe une autre instance du module `anchors` que la page, à cause des mises à jour HMR des autres
  correcteurs. Le relevé `read-stats` provient donc de `game.mjs --reads`, qui reprend la même sonde avec la bonne instance.
- Podium (`tools/e2e/solo.mjs`) : bandes, couronne et liseré de contre-jour inchangés (`shots/runner/solo/23-match-results-late.jpg`).
- `npx vitest run src/host/render/bird src/host/render/fx src/sim` : 86 tests verts. `tsc --noEmit` : 0 erreur dans le dépôt.
  `pnpm check:boundaries` : OK. `PORT=8853 node tools/e2e/solo.mjs` : partie de 3 manches et revanche, aucune erreur console.

## Écarts à la bible et limites

- **Bible §6.7** (bande à 14 % de la demi-envergure) : ORDERS B1 autorisait 35-40 % au loin ; cette vague porte la bande à 52 %, et
  seulement sous 68 px d'envergure. L'oiseau reste blanc os (corps, aile intérieure, bouts d'ailes). Dès 98 px, on revient à la bande
  de la bible.
- **Sarcelle**, la couleur la moins saturée de la palette (C 0,085), plafonne à C 0,066-0,069 côté nuit (85 % de son chroma). Au couchant
  hors nuit, elle atteint 0,078-0,089.
- Les petits oiseaux au fond de l'arène (perspective, 45-50 px en haut du cadre) restent petits : c'est le cadrage d'arène entière de
  staging (S1). La couleur s'y lit, les détails non.

## Outils (`tools/polish/fix2-birds/`)

| Script | Rôle |
|---|---|
| `game.mjs` | Partie réelle figée (sim et caméra), PNG, recadrages × 3, `bands.txt` (OKLCH au milieu exact de chaque bande via la sonde), `--reads` |
| `hidden.mjs` | Planche des états vue de loin au couchant : bandes et dos de chaque état, dont l'oiseau caché |
| `alloc.mjs` | Allocations CDP par site, total et bird/fx, Mo/s et ko/frame (`alloc.md`) |
| `gpu.mjs`, `gpubirds.mjs` | Temps GPU par passe, et coût des oiseaux (affichés / masqués en alternance) |
