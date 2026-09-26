# Polish vague 3 — correcteur world-3 (bords de territoire de près, budget GPU High)

Date : 2026-09-26, 20 h 51 à 22 h 25. Port 8872 (serveur arrêté par son PID à la fin).
Périmètre : `src/host/render/**` sauf `bird/` et `fx/`. `towerMaterial.ts` n'a pas été touché : le correcteur
climax-3 l'éditait pendant la session.
Captures : `shots/polish3/world/sheets/`. Les PNG intermédiaires ont été supprimés.
Outils (nouveaux, `tools/polish/world3/`) :
- `abshader.mjs` : A/B entrelacé de VARIANTES DE SOURCE d'un matériau dans la même page, sur une scène figée ;
- `edges.mjs` : captures avant / après à caméra ET sim figées, comparables au pixel près (manche ou `--title`) ;
- `titleab.mjs` : A/B entrelacé sur l'écran titre (la scène du banc de qualité) ;
- `gsprobe.mjs` : coût GPU d'une manche en direct, fenêtre par fenêtre (0,5 s), avec la pose de la caméra ;
- `carpet.mjs` : mesures du « tapis » (L, chroma, morcellement) sur des captures.

Machine partagée : GPU calme (0 à 11 % hors de mes pages) sur toute la session. En revanche, la charge CPU
venait des bancs `climax3/bench.ts` (3 à 5 processus). Chaque mesure a attendu un créneau calme :
GPU < 12 % sur 6 s, charge < 4, aucun Chrome piloté étranger. Le script `pmfree.sh` du scratchpad journalise
chaque seconde les Chrome étrangers : il n'y en a eu aucun pendant les passes retenues.

## Bilan

| Objectif | Statut | Preuve |
|---|---|---|
| 1 · Marches sur les bords de territoire en plan serré rasant | fait (niveau cellule) ; reste l'aliasing d'un pixel | §1, recadrages × 3 `sheets/x3-*.jpg` ; coût nul à 12 oiseaux |
| 2 · High à 12 oiseaux, p90 ≤ 9,5 ms | **tenu à charge CPU normale** (≤ 9,46 ms, Grande Ombre 9,37) ; 9,8 à 10,4 ms sous les bancs CPU d'un autre agent | §2.3 ; −1,4 ms apparié à la Grande Ombre, image identique au pixel |
| 2 · Coût réel de la bande de pigment | mesuré : **0,15 ms** (aquarelle de la vague 2 en tout : 0,25 ms) | §2.1 : ce n'était pas le poste |
| 2 · Qualité auto | vérifiée : le banc choisit Medium ; 60 i/s, p90 ≤ 8 ms, 0 à 0,7 % d'images > 20 ms | §2.4 |
| 3 · « Tapis » du couchant à 12 | mesuré, **aucun levier retenu** (décision de DA chiffrée) | §3 |

## 1. Marches de pixels sur les bords de territoire de près

### 1.1 Diagnostic : l'hypothèse de verify2-eyes n'était qu'une partie du problème

- verify2-eyes (§5.3) supposait que `territory()` restait en 4 taps en plan rasant, parce que `du` y prend le
  grand axe de l'empreinte du pixel. C'est vrai dans le lointain des plans rasants.
- Mais dans les plans serrés de la Grande Ombre à 4 oiseaux, j'ai figé une image et je l'ai rendue en
  « tout 4 taps », « tout B-spline » et en réglage courant. Résultat : tout le territoire visible y était
  **déjà** en B-spline quadratique (diff courant / tout B-spline = 0 sur le territoire).
- Les marches viennent donc du noyau lui-même. Une frontière presque droite de la grille de la sim fait une
  marche d'une cellule toutes les 4 à 8 cellules. À 5 à 8 px par cellule, la quadratique arrondit chaque coin
  sur ~1,5 cellule, et la marche reste lisible (`gs-edges-139-x2.jpg` de verify2).

### 1.2 Correction (`world/groundMaterial.ts`, `npr/uniforms.ts`)

- **Choix du lissage sur le petit axe.** La taille de pixel retenue vaut `min(uSmoothAniso × petit axe,
  grand axe)` (`uSmoothAniso` = 1,5). Elle sert à la classification du territoire ET aux bords d'ombre du sol
  (`dp0`, même défaut en plan rasant). La valeur 1e9 rend la règle d'avant (levier de mesure).
- **B-spline cubique 4×4** (`territoryBC`) sous `uTerrCubicDu` = 0,16 m/px (cellule ≥ ~4 px ; en rasant, ≥ ~6 px
  sur le petit axe). Elle étale la marche sur ~2 cellules. La quadratique reste utilisée de 0,16 à 0,3 m/px, les
  4 taps au-delà, et le preset Low reste en 4 taps (`TERR_BILINEAR`).
  Limite : une cellule isolée disparaît en cubique (poids 0,44 < 0,56), sans enjeu si près. À 12 oiseaux, en
  jeu, 71 % de la grille est peinte (84 % en fort), en grands aplats.
- **Coût** (A/B entrelacé, Grande Ombre à 12 oiseaux, High, calme) :

  | Variante | Δ p50 |
  |---|---|
  | règle du petit axe k = 1,5 (retenue) | +0,02 ms |
  | k = 1 | +0,28 ms (écartée) |
  | cubique sous 0,16 m/px (retenue) | −0,02 ms |
  | cubique à la place de la quadratique | +0,14 ms (écartée) |

  Au titre (High, 75 s alternés), la cubique coûte +0,2 ms, et le gain de la lecture en flux (§2.2) le compense
  (−0,05 ms au total).

### 1.3 Preuves (caméra et sim figées, même image ; haut = avant, bas = après, × 3)

- `sheets/x3-gs-n4-104.jpg` (Grande Ombre, 4 oiseaux, 104 s) : la diagonale ocre / jaune perd ses marches
  régulières de cellules.
- `sheets/x3-gs-n4-101-ilot.jpg` : le bord haut de l'îlot Safran s'adoucit.
- `sheets/x3-titre-62.jpg` : sur la plongée du titre, les bosses de cellules de la frontière basse diminuent.
- `sheets/x3-titre-22.jpg` et `x3-titre-14.jpg` : peu de changement, car ces zones sont au-delà de 0,16 m/px
  ou déjà rondes.
- En jeu : `shots/runner/solo/19-r3-greatshadow.jpg` (e2e solo), bords propres.

### 1.4 Ce qui reste : l'aliasing d'un pixel

- À × 4, les bords gardent des marches d'**un pixel**. C'est la bascule franche d'un propriétaire à l'autre
  (couture entre deux liserés sombres, non antialiasée dans le shader) et la trame des liserés.
- Le SMAA n'y peut rien. J'ai comparé LOW (seuil 0,15), LOW à 0,10 et MEDIUM sur la même image figée
  (`sheets/x4-smaa-seuils-gs-n4.jpg`) : les trois sont identiques à l'œil, car le contraste de ces coutures est
  faible. Je n'ai donc rien changé au SMAA.
- Seule piste : fondre les deux lavis sur la couture (second propriétaire de la classification). Elle recalcule
  un lavis sur les pixels de couture et ajoute deux registres vivants à tout le shader : non tentée, vu le §2.

## 2. Budget GPU High à 12 oiseaux

### 2.1 Où partaient les millisecondes

A/B entrelacé (`abshader.mjs`), Grande Ombre figée à 12 oiseaux, High 1080p, GPU calme, 5 ou 6 tours. Écart
apparié médian du p50 de l'image entière, sur le code d'avant (base : p50 10,2 à 10,9 ms) :

| Retiré (variante de shader) | Δ p50 |
|---|---|
| tout le shader du sol (aplat seul) | **−5,8 ms** |
| classification + peinture du territoire | −3,3 |
| **présence du code B-spline** (compilé en 4 taps seuls) | **−2,06** |
| la même chose au RUNTIME (uniform : 4 taps partout, code présent) | −0,08 |
| trois lectures de bruit | −2,2 (−0,3 chacune seule) |
| lectures de la carte d'ombre | −1,4 (9 taps → 4 taps au runtime : −0,02) |
| branche peinture entière | −0,80 |
| **bande de pigment (vague 2)** | **−0,15** |
| toute l'aquarelle de la vague 2 (bande, densité, plomb) | −0,27 |
| tours | −0,50 ; oiseaux −0,19 ; brume −0,19 ; le reste ≤ 0,1 |

Lecture :
- Le shader du sol est **limité par l'occupation** (pression de registres), pas par le calcul exécuté.
- La branche B-spline gardait vivants ses 9 texels entiers. Elle coûtait 2 ms à TOUS les pixels du sol, même
  quand elle ne tournait pas.
- La bande de pigment n'était pas le poste : 0,15 ms. Je l'ai gardée telle quelle, dans tous les presets.

### 2.2 Correction : classification B-spline lue en flux (`territoryBS`)

- La fonction lit les 4 candidats, puis les 9 texels en R et G seulement. Elle accumule aussitôt le poids et le
  niveau de chaque candidat (`acc`, `accG`). B et A (horodatage, ancien propriétaire) sont relus sur le seul
  texel retenu. La cubique suit la même structure.
- **Image identique au pixel.** Sur la même image figée, ancien code et nouveau code (règle d'avant) ne
  diffèrent que sur les traits animés du Simoun.
- **−1,37 ms p50 et −1,28 ms p90 à la Grande Ombre** : 6 tours sur 6 entre −1,24 et −1,83 ms. Le compiler en
  4 taps seuls ne donnerait que −0,24 ms de plus.
- Autres essais sans gain mesurable, non retenus :
  - carte d'ombre en flux (9 et 4 taps) ;
  - bruits sans la branche d'arène ;
  - version légère de la classification 4 taps ;
  - daltonien, tirets, transitions, garde pâle, nuit et illumination retirés un par un : chacun ≤ ±0,05 ms.

### 2.3 Avant / après (`perfmatrix.mjs --n=12 --speed=1`, serveur de dev, p90 GPU de l'image en ms)

| High (1920 × 1080) | Midi | Après-midi | Heure dorée | Couchant | Grande Ombre |
|---|---|---|---|---|---|
| Avant, passe 1 (charge 1,4-2,8) | 9,91 | 9,79 | 10,26 | 10,94 | 11,23 |
| Avant, passe 2 (charge 2,5-3,4) | 10,43 | 9,60 | 11,25* | 11,81* | 11,48* |
| **Après, passe 1** (charge 2-2,6) | **8,91** | **8,04** | **9,46** | **9,20** | — (contaminée) |
| **Après, passe 2** (charge 2,4-2,9) | — | — | — | **9,00** | **9,37** |
| Après, sous bancs CPU (charge 3-5, 3 passes) | 8,95-9,98 | 9,19-9,53 | 8,66-10,03 | 9,15-10,2 | 9,78-10,43 |

Notes :
- \* : 53 à 56 i/s. Les cases « contaminée » ou « — » ont perdu des images (36 à 55 i/s) pendant une rafale de
  charge. Ce n'est pas un Chrome étranger : le journal n'en compte aucun.
- Le temps TIME_ELAPSED gonfle sous charge CPU, comme l'a déjà noté fix2-world.
- La sonde en direct (`gsprobe.mjs`, charge 2,7) mesure un p50 de 9,0 à 9,5 ms par demi-seconde de la
  Grande Ombre. Le tangage passe de 44° à 37° et rien n'explose.

| Medium (1600 × 900) | Midi | Après-midi | Heure dorée | Couchant | Grande Ombre |
|---|---|---|---|---|---|
| Avant | 7,74 | 7,57 | 7,81 | 8,69 | 8,88 |
| Après (deux passes) | 7,05-7,08 | 6,87-7,08 | 7,51-7,72 | 6,83-7,66 | 6,91-8,02 |

| Low (1280 × 720) | Midi | Après-midi | Heure dorée | Couchant | Grande Ombre |
|---|---|---|---|---|---|
| Avant | 3,76 | 4,09 | 4,21 | 4,50 | 5,47 |
| Après | 3,99 | 3,43 | 4,11 | 4,49 | 4,78 |

- Low est inchangé : 4 taps compilés, donc sans le code B-spline.
- Medium tient maintenant son budget de 8 ms.
- **High tient 9,5 ms à charge normale.** La marge reste faible (~0,1 à 0,5 ms à la Grande Ombre) et saute
  sous une charge CPU de 4 à 5.

### 2.4 Qualité auto (`tools/polish/verify/auto12.mjs`, 12 oiseaux, premier lancement)

- Le banc du titre choisit **Medium**. En manche 1, Medium tient 59,7 à 60,1 i/s, avec 0 à 0,7 % d'images au-delà
  de 20 ms. Il reste Medium après l'entracte. La console est propre.
- La manche 2 est contaminée : un autre agent occupait le GPU à 99-100 %.
- Pourquoi Medium ? Le titre en High coûte 9,1 ms en médiane (`titleab.mjs`), au-dessus du seuil du banc
  (8,5 ms).
- Le titre coûte maintenant autant que la médiane d'une manche à 12 au climax (8,8 à 9,2 ms), et non plus
  ~10 % de moins. Le seuil de 8,5 ms correspond donc à « p90 de manche sous ~9,5 ms ».
- J'ai gardé le seuil et corrigé son commentaire (`quality.ts`). Sur cette machine, High est à la limite, et
  le banc choisit le preset qui tient 60 i/s avec de la marge. Le moniteur entre les manches reste le filet de
  sécurité (p90 > 11 ms).

## 3. « Tapis » saturé au couchant à 12 joueurs : décision mesurée

### 3.1 Mesures

Captures figées, 12 oiseaux, horloge de palette 3,5°, même scène ; mesures `carpet.mjs` :

| Variante | L méd | C p90 | C > 0,12 | C moy | morcel. |
|---|---|---|---|---|---|
| courant | 0,578 | 0,141 | 13,7 % | 0,061 | 20,7 % |
| rendu de la vague 1 (`lookPolish2 = false`) | 0,578 | 0,143 | 17,4 % | 0,062 | 19,4 % |
| densité : chroma à 40 % au couchant | 0,578 | 0,131 | 12,0 % | 0,060 | 20,4 % |
| densité à 40 % + plomb sans chroma | 0,578 | 0,130 | 11,7 % | 0,059 | 20,2 % |
| pâles à 0,42 × C (au lieu de 0,55) | 0,577 | 0,140 | 13,5 % | 0,060 | 20,4 % |

- La peinture du soir à 12 couvre 71 % de la grille, dont **84 % en fort**. Les pâles sont donc un levier nul.
- Côte à côte (`sheets/tapis12-pe3_5-densC-plomb.jpg`), les variantes de densité et de plomb sont
  indiscernables. Le tapis vient de douze teintes fortes sur ~90 % de l'arène, pas de l'aquarelle.

### 3.2 Seul vrai levier : la chroma des forts, bornée par les portes

Calcul avec les formules en jeu (`game.mjs`), copie de `docs/art/tools` au scratchpad (`perkf3*.mjs`) :
- **−5 % de chroma** au couchant pour tous : fort / fort passe à 0,086, mais les gelés tombent à 0,058,
  sous la porte de 0,059.
- **Plafond commun à 0,13 :** les portes restent intactes (0,090 et 0,061), mais la chroma moyenne ne baisse
  que de 3 % (0,125 → 0,121). Cet écart est invisible, et fix2-world a vu le Corail plafonné virer au brun.

### 3.3 Décision

Rien n'a été changé :
- dans les portes, aucun levier ne calme le tapis à l'œil ;
- hors des portes, il faudrait accepter que deux joueurs gelés descendent sous ΔE 0,059.

C'est une décision du lead (lisibilité contre calme). Les portes `final.mjs` restent vertes et le high-key est
inchangé (L méd 0,578 ; seuil 0,50).

## Vérifications

- `npx tsc --noEmit -p tsconfig.json` : 0 erreur.
- `npx vitest run` : 29 fichiers, **356 tests verts**. Nouveau test dans `world.test.ts` : chaque uniform
  déclaré par le shader du sol a une valeur, dans les deux variantes.
- `pnpm check:boundaries` : OK.
- `tools/e2e/solo.mjs` (3 manches, fin de partie, revanche, console surveillée) : aucune erreur.
- `docs/art/tools/final.mjs` (copie avec culori) : toutes les portes vertes (rien n'a changé côté couleurs).
- Notes : `docs/agent-notes/world.md`, section « Polish vague 3 » ; réponse dans `docs/agent-notes/REQUESTS.md`.

## Reste à faire

1. High à 12 garde peu de marge (9,0 à 9,5 ms au calme). Le prochain poste est le shader du sol :
   - trois lectures de bruit en chaîne, soit 2,2 ms ;
   - carte d'ombre, 1,4 ms ;
   - toujours limité par l'occupation.
   Piste : une texture de bruit « arène » cuite qui remplacerait deux lectures ; les tours (0,5 ms) sont à voir
   avec climax.
2. L'aliasing d'un pixel des coutures de territoire en plan rasant (§1.4).
3. Le tapis du couchant à 12 : c'est une décision de DA, qui demande de desserrer une porte (§3).
