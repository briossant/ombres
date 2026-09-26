# Polish vague 3 — correcteur climax-3 (Grande Ombre : tours, parasols, couronne)

Port 8871 (arrêté par son PID). Captures : `shots/polish2/climax/c3-*`. Outils (nouveaux) : `tools/polish/climax3/`.
Reste traité : verify2-eyes §3.1 et §5.1 (parasol au premier plan, parasol tranché net au centre, Cadran à 16,4 % et
plan moyen de 300 m), verify2-regression §3.1 et §5 (couronne hors champ 17-35 %).

Fichiers modifiés : `src/host/camera/framingRig.ts`, `src/host/camera/towerCover.ts`,
`src/host/render/world/towerMaterial.ts`, tests `framingRig.test.ts` (+2) et `render/world/towerCut.test.ts` (nouveau, 3).
Non modifiés : `director.ts`, `Towers.tsx`, `birdScreen.ts`, `towerGeometry.ts`.

## 1. Plus aucun disque tranché : le chapeau disparaît en entier (`towerMaterial.ts`)

**Cause.** Le cercle de dégagement d'un oiseau (≈ 11 m autour de lui) effaçait, fragment par fragment, ce qui le
cachait. Quand un oiseau passait sous le bord d'un parasol, le disque était coupé net par un arc : la « vue en coupe »
de `solo-en/028`. Au banc, 8 à 13 % des images de la Grande Ombre avaient un disque tranché près du centre.

**Correction.** Sur le CPU, avant chaque rendu des tours (`onBeforeRender`, une fois par image, ~11 tours × 12
oiseaux), `towerCut` teste chaque chapeau (disque des parasols, piles, colonnes, gnomon ; `towerHats`) contre les
cercles des oiseaux qu'il cache (ellipse à l'écran contre cercle, même bande 0,9-1,12 × rayon). Quand un chapeau est
atteint, **toute la tour disparaît au-dessus d'une coupe**. La coupe se place sous le chapeau, et 6 m plus bas pour
les grands disques qui portent des lanternes pendues. Elle descend le long de l'axe tant que celui-ci reste dans le
cercle. Il ne reste ni disque coupé, ni bout de fût, ni lanterne qui flotte : on voit un fût net qui s'arrête sous
l'oiseau.

La décision est binaire, avec hystérésis. La transition passe par la trame fixe à l'écran pendant 0,22 s : aucun
chapeau ne reste à moitié tramé. Le shader lit une paire (altitude, part) par tour (`uTowerCut[16]`, dans le vertex
shader). Le reste de la dissolution ne change pas : fûts et bulbes restent coupés par le cercle, et la proximité de
la caméra agit toujours à 30-38 m.

Preuves : au banc, disques tranchés au centre **7,8 / 13,2 / 10,8 % → 0** à 2 / 4 / 6 oiseaux. Images :
`c3-final/sheet-parasols-n2-s2.jpg` contre `c3-base/sheet-parasols-n2-s2.jpg` (même graine). Le croissant autour de
l'oiseau couronné à 97 s et le parasol coupé au centre à 102 s deviennent des fûts nets. Le correctif de la lanterne
pendue se voit sur `c3-v16/sheet-cadran-n4-s3.jpg` (101-104 s, avant correctif : les lanternes flottaient sous le
disque effacé du gnomon) comparé à `c3-final/sheet-cadran-n4-s3.jpg`.

## 2. Parasol au premier plan (`towerCover.ts`, `framingRig.ts`, `towerMaterial.ts`)

- **Chapeaux de premier plan effacés, à la Grande Ombre seulement** (`foregroundHats` : de 96,5 s à la fin de la
  manche). Un chapeau à moins de 62 à 72 m de la caméra s'efface de la même façon. À 65 m, un disque de parasol couvre
  ~6 % de l'image, coupé par le bas du cadre : c'est le parasol du premier plan de `solo-en/041`. L'estimation de la
  caméra suit la même règle (`hatCutZ`, `towerCover(…, hatNear)`, `towerClearance(…, hatNear)`), donc elle ne recule
  plus pour une tour qui ne sera pas peinte. Le titre et le reste de la manche ne changent pas.
- **Terme de premier plan** dans l'encombrement : une tour plantée entre la caméra et la cible (à moins de 0,8 × la
  distance au sol) compte **double**. Un parasol de 6 % au premier plan pèse comme 12 %.

## 3. Critère des tours et parades (`framingRig.ts`, `towerCover.ts`)

- **Critère par tour** (« aucune tour > 12 % du cadre ») : `towerCover` renvoie aussi la part de la plus couvrante des
  tours prise seule (`towerCoverStats.maxSingle`). Encombrement = max(tour seule, 2/3 × toutes les tours, 0,35 × plus
  large tour, 2 × premier plan, proximité). Seuils : parade au-delà de 12 %, retenue sous 11 %, retour sous 8,5 %
  (vague 2 : 15 / 12 / 11 % sur toutes les tours ensemble).
- **Nouvelles parades** : glissement du cadre (est / ouest / nord / sud, 14 à 42 % de la largeur), essayé avant le
  recul. Le glissement est **ramené dans la marge que laissent les boîtes des oiseaux cadrés** (`clampRigToSets`) : il
  ne sort jamais un oiseau cadré du rectangle utile. S'y ajoutent un relèvement de −5° (tour voisine) et des reculs
  glissés.
- **Choix** : on retient d'abord la première parade dont le cadre visé ET le chemin de la caméra (cadre courant et
  milieu du trajet) restent propres. À défaut, le cadre visé propre dont le chemin est le moins encombré, sinon le cadre
  visé le moins encombré.
- **Parade gardée** tant que son cadre visé reste sous 12 % et son chemin sous 16 %, ce qui supprime le va-et-vient
  entre glissements. Toutes les 0,5 s, on cherche une parade moins coûteuse.
- Recul décidé : dézoom × 1,6 plus vif. Recul de × 1,45 ou plus à la Grande Ombre : le choix des bots cadrés se
  resserre jusqu'à × 0,7 (moins de bots, plus de marge pour glisser).
- À la Grande Ombre, aucune parade de recul ne dépasse **250 m** (`GS_PARRY_MAX_W`). Sans cette borne, on retombait
  dans le plan moyen du Cadran : 0,9 % au lieu de 2,4 % d'images au-delà de 250 m, au prix de 0,3 point de premier plan.
- Punch-in : garde son seuil de 12 % (`PUNCH_COVER`).
- Coût de `CameraDirector.update` sur toute la manche : médiane 0,007 ms, p99 0,30 ms, p99,9 1,5 ms.

## 4. Couronne, entrée plus serrée (`framingRig.ts`)

- Plafond de la couronne : 1,7 a au début de la Grande Ombre → 1,5 a à la nuit (vague 2 : 1,4 a fixe), **jamais
  au-delà de 235 m**, pour ne pas revenir au plan moyen. Variantes mesurées sur 4 graines : 1,6 a fixe → couronne hors
  ou coupée 16,7 % mais 3,5 % de plans > 250 m ; 2,0 a → 4,6 % mais 13,4 % de plans > 250 m.
- Plan serré lancé **2 s** avant l'annonce (vague 2 : 1,2 s). À 97-98 s, envergure médiane 113 → 123 px et largeur
  194 → 177 m.

## 5. Mesures

**Banc** `tools/polish/climax3/bench.ts`. C'est la vraie simulation, avec les vrais bots et le vrai `CameraDirector`
à 60 images/s. Il couvre 4 cartes × **8 graines** × 2, 4 et 6 oiseaux, avec un humain au slot 0, soit 24 960 images
de 97 à 110 s par nombre d'oiseaux. La couverture est la couverture **peinte** : chapeaux de premier plan retirés comme
le fait le matériau. Une image est dite « composée » si aucune tour seule ne dépasse 12 %, si toutes les tours
ensemble restent sous 18 %, si aucun premier plan ne dépasse 6 %, s'il n'y a pas de disque tranché au centre, et si le
plan ne dépasse pas 250 m dès 98 s.

| 97-110 s, toutes cartes (avant → après) | 2 oiseaux | 4 oiseaux | 6 oiseaux |
|---|---|---|---|
| Envergure médiane (p10 des médianes par manche) | 162 (128) → **178 (162)** px | 133 (104) → **133 (113)** px | 112 (90) → **117 (96)** px |
| Largeur médiane / max | 150 / 279 → 139 / 260 m | 173 / 356 → 171 / 342 m | 192 / 393 → 184 / 308 m |
| Tour seule : max / images > 12 % | 12,4 / 0,0 → **11,0 / 0,0 %** | 15,6 / 0,1 → **13,0 / 0,1 %** | 14,1 / 0,1 → **13,3 / 0,0 %** |
| Toutes tours > 12 % (peint) | 6,5 → 1,9 % | 2,9 → 1,1 % | 0,7 → 1,1 % |
| Disques tranchés au centre | 7,8 → **0 %** | 13,2 → **0 %** | 10,8 → **0 %** |
| Couronne (bot) : à l'écran / coupée / hors champ | 80 / 12 / 8 → **90 / 7 / 4** | 74 / 5 / 22 → **84 / 4 / 13** | 72 / 6 / 23 → 72 / 5 / 23 |
| Front de nuit dans le cadre | 94 → 93 % | 93 → 95 % | 85 → 84 % |
| Images composées | (86 %, ancien critère) → **98,5 %** | (81 %) → **95,1 %** | (81 %) → **95,4 %** |

La colonne « avant » est l'état de la vague 2, mesuré au même banc en début de séance. Son taux d'images composées
suit le critère de départ (toutes tours > 12 %, premier plan à 0,6), car les sources d'avant ne sont plus là pour le
recalculer.

Par carte, le pire cas est le Cadran à 4 oiseaux (92,0 %), puis les Géantes à 6 et le Cadran à 6 (92 %). Les
Aiguilles sont à 100 %, et 98-99 % à 2 oiseaux. Par seconde, les images composées passent de 71-77 % à 90-96 % sur
97-104 s, et de 84-97 % à 96-100 % ensuite.

Échecs restants dès 98 s (3,5 % des images) : premier plan > 6 % (2,7 %) et plans > 250 m (0,9 %). Ce sont surtout des
transitoires de 0,3 à 0,8 s. Ils surviennent quand le choix des bots cadrés change et que le cadre traverse le gnomon
ou le Grand Parasol, pendant que le recul rattrape (voir `--trace`).

**Images** (page de dev, vraie interface, un humain émulé) : `c3-v15/sheet-*-n{2,4,6}-s5.jpg` (4 cartes),
`c3-v16/sheet-{parasols,geantes}-n{2,4}-s5.jpg`, `sheet-cadran-n{4,6}-s3.jpg`, et l'état final
`c3-final/sheet-parasols-n{2,6}-s2.jpg` (à comparer avec `c3-base/`) et `c3-final/sheet-cadran-n4-s3.jpg` (gnomon sans
lanternes flottantes). Toutes ont été regardées. Couverture peinte au
plus 15 % à 2 oiseaux (Grand Parasol en haut à gauche, dans la bande du HUD, plus un parasol coupé par le bas), 9 % à
4, 13 % à 6. Aucun disque tranché. Les fûts coupés sous un oiseau se lisent comme des colonnes brisées. Les oiseaux
font de 120 à 210 px.

Titre (`verify-eyes/c3-title/`, 29 images sur 60 s) : aucun effet de la coupe des chapeaux, console propre.

## 6. Vraies parties

Runner, clavier piloté plus bots de niveau 1, 3 manches (Parasols, puis Aiguilles ou Géantes, puis Cadran), avec
`tools/polish/climax/realgame.mjs`. Planches `shots/polish2/climax/c3-real{,2}/n*/sheet-r*.jpg`, toutes regardées.
Console propre dans les trois parties.

| Partie | Envergure médiane Grande Ombre (min) | Tours au plus (estimation caméra) |
|---|---|---|
| 4 oiseaux (`c3-real/n4`) | 141 px (110) | 12,7 % |
| 6 oiseaux (`c3-real/n6`), avant la borne de 250 m | 113 px (67) | 10,1 % |
| 6 oiseaux (`c3-real2/n6`), état final | 105 px (78) | 9,9 % |

- Aucun disque tranché. Les parasols sous un oiseau deviennent des fûts nets.
- Le meneur couronné est dans le cadre à 101, 104 et 108 s sur le Cadran (c3-real/n4 r3, c3-real2/n6 r3), et à 101-104 s
  sur les Parasols (c3-real2/n6 r1).
- Cadran à 98,5 s (c3-real/n4 r3) : le gnomon est au centre, avec ses disques (12 %, à la limite), à côté de l'humain.
  Il n'est pas au premier plan et il ne cache rien.
- c3-real/n6 r1, 108 s : plan moyen de 67 px. Il m'a conduit à borner les reculs à 250 m. Dans la partie refaite,
  les plans les plus larges de la Grande Ombre sont à 78-81 px (Parasols, 101-104 s, couronne cadrée loin de l'humain).
- Les largeurs affichées par `realgame.mjs` (`2 × cameraState.frame.halfWidth`, empreinte au sol) ne sont pas celles du
  banc (largeur cadrée à la cible) : environ × 1,7.

## 7. Non fait / limites

- **Tours coupées par le bord du cadre, loin derrière le sujet** (grand disque en haut du cadre, dans la bande du HUD) :
  acceptées sous 12 % par tour. C'est un choix de cadrage, pas un défaut franc.
- **Premier plan transitoire** (2,7 % des images), surtout sur le Cadran, quand le cadre traverse le gnomon au
  changement de bots cadrés.
- **6 oiseaux en vraie partie** : envergure médiane de 105-113 px, mais des plans à 78-81 px quand la couronne est
  cadrée loin de l'humain (plafond de 235 m).
- **Couronne à 6 oiseaux** : 72 % à l'écran, contre 84-90 % à 2 et 4. Le plafond de 235 m l'emporte, car sinon les
  plans deviennent moyens. Le choix de DA reste ouvert (`GS_CROWN_MAX_W`).
- **Bots en bord de cadre** (0,1 / 0,5 / 1,0 par image) : non traité, pour les mêmes raisons qu'en vague 2 (les inclure
  élargit le cadre sans les réduire).
- Coût GPU du nouveau shader non mesuré au calme : une lecture d'uniform par sommet et un max par fragment.
