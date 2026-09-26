# Polish vague 2 — correcteur climax (caméra de manche, tours)

Port 8851. Captures : `shots/polish2/climax/`. Outils (nouveaux, à moi) : `tools/polish/climax/`.
Ordres traités : verify-eyes §4.1, ORDERS S2 (Grande Ombre), S3 (tours) et W9 (dissolution).

Fichiers modifiés : `src/host/camera/framingRig.ts` (+ son test), `src/host/camera/towerCover.ts`
(ajout de `towerClearance`), `src/host/render/world/towerMaterial.ts`. Non modifiés : `director.ts`
(rien de nécessaire côté « round »), `GameCamera.tsx`, `framing.ts`, `birdScreen.ts`, `Towers.tsx`.
Notes d'agent : `docs/agent-notes/staging.md` §9, `docs/agent-notes/world.md` (section climax).

## 1. Grande Ombre : un plan serré qui se resserre (S2) — fait

**Cause du plan large.** À 98 s, les bots sont dispersés sur toute l'arène (200 m d'est en ouest à
4 oiseaux) et la contrainte dure de S1 gardait **tous** les oiseaux dans le rectangle utile : au-delà
du dézoom maximal, le cadre prenait l'arène entière. Au soleil rasant, les ombres filent en plus au
bord est de l'arène.

**Correction** (`framingRig.ts`, à 8 oiseaux ou moins, de 96,8 s à la fin de la pause de nuit) :
- `gsMask`, choisi à 5 Hz : les humains toujours ; puis les bots, des voisins des humains aux plus
  lointains (sans humain : des plus menacés par le front aux plus lointains ; ceux déjà dans la nuit
  en dernier), chacun gardé tant que la largeur reste sous `1,2 a → 0,8 a` (hystérésis × 1,15). Les
  autres bots peuvent sortir (flèche hors champ du HUD, GDD §13.1). Figé pendant la pause de nuit.
- Sujet : oiseaux cadrés (et leur position à 0,7 s), leur ombre si elle est à moins de 45 m, et le
  front à leur hauteur, au plus 90 → 40 m à l'ouest du plus à l'ouest d'entre eux.
- Poussée à l'annonce : le plan serré part 1,2 s avant la phase, zoom avant × 1,8 plus vif pendant
  3 s. Décalage vers l'est et poussée lente de 10 % gardés.
- Tangage −5° (au lieu de −3°), **bloqué dès que les tours couvriraient plus de 15 % du cadre
  abaissé** (`gsLow`, retour sous 11 %) ; gardé pendant la pause de nuit (plus de saut de 3° à la nuit).
- Au-delà de 8 oiseaux : inchangé (arène entière), sauf le tangage.

**Mesures.** Banc headless `tools/polish/climax/bench.ts` (vraie sim, vrais bots, vrai réalisateur,
4 cartes, un humain au slot 0 ; `--seeds=1,2,3,4` après, 1,2,3 avant) — largeur cadrée médiane et
envergure affichée médiane, par tranche de 2 s :

| Grande Ombre | 98-100 s | 100-102 | 102-104 | 104-106 | 106-108 | 108-110 |
|---|---|---|---|---|---|---|
| 4 oiseaux, avant | 251 m · 88 px | 270 · 86 | 258 · 93 | 244 · 99 | 236 · 105 | 218 · 108 |
| 4 oiseaux, après | 181 m · 126 px | 177 · 123 | 162 · 135 | 149 · 159 | 131 · 168 | 129 · 189 |
| 6 oiseaux, avant | 356 m · 61 px | 367 · 60 | 372 · 60 | 370 · 61 | 352 · 67 | 296 · 71 |
| 6 oiseaux, après | 196 m · 102 px | 178 · 105 | 175 · 102 | 173 · 115 | 158 · 141 | 138 · 161 |

Front de nuit dans le cadre (quand il est à la hauteur des oiseaux) : 55 % des échantillons à 98-100 s
(il part du bord ouest), 88-100 % ensuite. Humains hors du rectangle utile : 0. Bots hors champ :
0,8 en moyenne à 4 oiseaux, 1,6-2,3 à 6. À 12 oiseaux : inchangé (458 m, 60 px).

**Images** (page de dev, vraie UI, graine 7, un humain émulé ; `tools/polish/climax/shots.mjs`) :
`avant-apres-parasols-n4.jpg`, `avant-apres-parasols-n6.jpg`, `avant-apres-aiguilles-n4.jpg`,
`sheet-final-gs-n4.jpg`, `sheet-final-gs-n6.jpg`, planches par carte `final/sheet-<carte>-n<N>-s7.jpg`
(55, 85, 98,5, 101, 104, 108 s), toutes regardées. Envergure médiane des images de la Grande Ombre :
**148 px à 4 oiseaux (min 79), 100 px à 6 (min 75)**, 68 px à 12. Avant, sur Parasols : 85/73/71/89 px
et 295/358/368/280 m à 4 oiseaux ; après : 135/150/182/184 px et 182/165/122/114 m.
Vraie partie (runner, clavier piloté + 3 ou 5 bots, 3 manches ; `realgame.mjs`) :
`real-final/n4`, `real-final/n6`, planches `sheet-real-final-gs-n4.jpg`, `-n6.jpg` : envergure médiane
117 px (min 77) à 4, 118 px (min 96) à 6, couverture des tours max 12,3 % et 13,8 %, console propre.

## 2. Tours hors du cadre de jeu (S3) — fait, sauf transitoires sur le Cadran

- Encombrement `obstruction()` = max(part d'écran couverte au-dessus de **4 m** (20 m avant),
  0,45 × largeur de la plus large tour, pénalité si la caméra passe à moins de **45 m** d'une tour).
- Parade retenue seulement si elle ramène sous **12 %** (avant : 15 %, le cadre se posait sur le seuil).
- **Bug corrigé** : le cadre visé contenait déjà le recul courant ; chaque parade était évaluée sur un
  cadre reculé deux fois, la prévision était trop optimiste et le cadre restait à 16-20 %.
- Un recul décidé s'applique aussitôt au cadre visé (le ressort de zoom le lisse) ; retour plus vif.
- Punch-in refusé, ou relâché plus tôt, si son cadre est encombré ou frôle une tour (< 42 m).
- Essais écartés, mesurés au banc : glissement latéral du cadre (deux versions), relèvement de 12°,
  critère sans la largeur de tour (mieux sur le Cadran, pire ailleurs).

Banc, images au-dessus de 15 % (tours entières) : Grande Ombre 0,3 % à 4 oiseaux (plus long épisode
0,5 s, max 15,7 %), 0 % à 6 (max 12,9 %), 0 % à 12 ; couchant 0,3 % (0,6 s) ; punch-in 0 % (avant :
max 28 %, caméra à 22 m d'une tour ; après : max 14 %, 49 m au plus près). Caméra au plus près d'une tour
pendant la Grande Ombre : 45 m à 4 oiseaux, 39 m à 6. Coût de `CameraDirector.update` : médiane
0,04 ms, p99 0,8 ms (12 évaluations au plus par estimation à 10 Hz).
Captures : couverture **réellement peinte** par les tours (rendu des seules tours, trame comprise) :
max 16,3 % à 4 oiseaux (Cadran, 98,5 s, entrée dans la Grande Ombre), 10,2 % à 6, 4,2 % à 12.

## 3. Dissolution franche des tours (W9) — fait

`towerMaterial.ts` : les fragments à moins de 30 m de la caméra (au-dessus de 20 m) ou devant un oiseau
(au-dessus de 3 m, fût compris) sont **effacés en entier** ; seule une bande étroite (30-38 m ; 90-112 %
du rayon de dégagement de l'oiseau) fait la transition en trame IGN fixe à l'écran. Avant : au plus 72 %
des pixels, un voile moiré. Plus de trame de proximité entre 38 et 60 m. Coupée au podium (inchangé).
Preuve : dans les 12 cas des captures finales où un oiseau est derrière une tour (géométrie exacte), la part de tour
peinte sur l'oiseau passe de 23-29 % (avant, trame à 72 %) à **0 %** (`final/metrics.json`, champ
`occluded[].painted`). Rafales de 10 images consécutives (screencast) : `burst-final-parasols-n6-101.jpg`,
`burst-final-geantes-n4-101.jpg`, `v3/burst-geantes-n4-101-disc.jpg` — découpe nette qui suit l'oiseau,
bande tramée de quelques pixels, aucun scintillement. Pas de mesure GPU dédiée (GPU partagé à 99 %) :
même boucle qu'avant, le cœur effacé réduit le remplissage.

## 4. Vérifications

`npx tsc --noEmit` : 0 erreur. `npx vitest run src/host/camera src/host/render/world` : 86 tests verts
(nouveau : « Grande Ombre à 4 et 6 oiseaux : plan serré qui se resserre, front dans le cadre, humain
tenu » ; le test des boîtes d'oiseaux vérifie les oiseaux cadrés et l'humain). `check:boundaries` OK.
Deux parties complètes de 3 manches (4 et 6 oiseaux) : console propre.

## 5. Non fait / limites

- **Cadran** : le gnomon (74 m, disques de 32 m) entre souvent entre la caméra et les oiseaux au nord-est.
  L'entrée dans la Grande Ombre passe parfois 0,5 s au-dessus de 15 % (16,3 % peint) et la parade recule
  alors jusqu'à × 1,45-1,8 : sur la graine 7 à 4 oiseaux, 108 s est un plan moyen (298 m).
- Plan serré : des bots non cadrés passent au bord du cadre ou sous la bande du HUD (0,6 à 1 par image en
  moyenne) ; les inclure quand ils sont à l'écran élargissait le cadre sans les réduire (écarté).
- Quand l'humain fuit loin devant le front, le mur de nuit n'entre dans le cadre qu'à ~90 m de lui.
- Titre : dissolution toujours active (aucune demande de l'agent title) ; `Towers.tsx` non modifié.
