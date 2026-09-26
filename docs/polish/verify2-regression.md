# Non-régression après le polish (vague 2)

Agent de non-régression de la vague 2, 2026-09-26, 19 h 29 → 20 h 50. Serveur de dev sur 8861, builds de
production servis sur 8862 (`dist-server/server.mjs` + `OMBRES_DIST`), tous arrêtés par PID à la fin. Les
scénarios Playwright ont tourné avec `tools/polish/verify/watch.mjs` (HMR coupé, **toute** la console
journalisée, avertissements compris, sur toutes les pages, téléphones compris).

**Machine partagée.** L'agent verify2-eyes travaillait en même temps sur 8863 (partie de groupe, `fpsline`,
`perfmatrix` High/12, `crownring`). Ma première mesure GPU a croisé la sienne : 42 img/s, 41 % d'images au-delà
de 20 ms, donc inutilisable. Je l'ai arrêtée par PID. Toutes les mesures de performance ci-dessous passent par
`whenfree.sh` / `perffree.sh` (scratchpad) :

- le script attend qu'aucun Chrome headless étranger ne tourne pendant 6 s, puis lance la mesure ;
- il surveille la machine toutes les 2 s pendant la mesure ;
- il relance toute passe où un autre Chrome est apparu.

Toutes les lignes retenues ont `max_foreign=0`.

**Verdict :**

- **Scénarios et contrôles :** tous verts, sans erreur ni avertissement console hors coupures volontaires.
- **Performance :** aucune régression mesurable.
  - En A/B entrelacé des builds de production vague 1 et vague 2, sur GPU libre, les temps GPU de l'image
    sont identiques à ±0,3 ms.
  - Tout tient 60 img/s en production.
- **Régression trouvée et corrigée :** une régression de lisibilité née de la vague 2. Pendant la Grande
  Ombre, le **porteur de la couronne** (un bot) sortait du cadre ou passait sous le HUD 48 à 81 % du temps.
- **Deux choses restent ouvertes :**
  - la cible W3 (p90 ≤ 9,5 ms en High à 12) n'est toujours pas tenue de l'heure dorée à la nuit ;
  - le degré de cadrage de la couronne est un choix de DA.

## 1. Contrôles statiques

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **0 erreur** (début, après mon correctif, fin) |
| `pnpm check:boundaries` | Frontières OK |
| `npx vitest run` | **29 fichiers, 355 tests verts** au début ; après mon correctif : voir §6. Seul bruit : `THREE_CJS_DEPRECATED` (dépendance, côté test) |

Rien à corriger : aucun conflit de fusion. Les fichiers touchés par deux correcteurs sont `runner.ts` (title
et tech), `Towers.tsx` et `world.md` (tech et world), et `towerMaterial.ts` (climax, avec tech dans son
voisinage). Ils compilent, passent leurs tests et tournent en scénario.

## 2. Scénarios de bout en bout (dev 8861, prod 8862)

| Scénario | Durée | Résultat | Console (PC + téléphones) |
|---|---|---|---|
| `tools/e2e/solo.mjs` | 1 min 37 | 3 manches, fin de partie, revanche | propre |
| `tools/e2e/phones.mjs` | 1 min 45 | 11/11 ✓, revanche votée | propre |
| `tools/e2e/flows.mjs` | 42 s | 16/16 ✓ (crédits, manette, 2e clavier, pause PC et téléphone, arrivée en cours de partie) | propre |
| `tools/e2e/resilience.mjs` | 1 min 16 | 17/17 ✓ : remplaçant à 3,1 s ; reprise en « 3, 2, 1 » ; soleil repris 23,87 → 24,27 ; désert à 0,6 % près | seules erreurs : les coupures volontaires (`ws://localhost:9`, `ERR_UNSAFE_PORT`) |
| `tools/e2e/qa/group.mjs` (vitesse réelle, PC + iPhone + Pixel + clavier) | 7 min 52 | tout le parcours, pause PC et téléphone, retour au salon ; `rawKeys` vides | PC, A, B propres |
| `tools/e2e/qa/keyboard12.mjs` (12 oiseaux, réglages à chaud) | 2 min 31 | EN, daltonien, Low ↔ High, narrateur texte puis muet : OK ; `{"stats":12,"draw":12}` | propre |
| `tools/e2e/qa/prod.mjs` (build de production, `PROD_PORT=8862`) | 1 min 27 | tout vert : titre en 3,1 s, téléphone 0,19 Mo, serveur coupé puis relancé en pleine manche (même salle, aucun remplaçant), revanche | propre, hors refus de connexion pendant la coupure volontaire |

Les cadences de `group` (31 à 43 img/s) et de `keyboard12` (19 à 46 img/s) ne mesurent rien : elles ont été
relevées pendant que verify2-eyes jouait sa propre partie sur le même GPU (`gpu_busy` de 88 à 95 %). En
Low, 24 img/s pour 3 à 4 ms de GPU le prouvent. Les mesures propres sont au §4.

Toutes les images ont été regardées. Planches : `shots/polish2/verify/sheets/` (`solo-a/b`, `phones-pc`,
`phones-phones`, `flows-resilience`, `group-r1`, `group-r23`, `group-climax`, `group-end`, `group-phones`,
`keyboard12`, `prod`). Je n'ai relevé aucun texte coupé ou débordant, aucune clé brute ni aucun écran vide. Le
podium est sans mât, couronne sur la tête. Les bannières et les sous-titres tronqués sur certaines images sont
saisis en pleine animation d'apparition, comme en vague 1.

**Fausse alerte levée.** `prod.mjs` affiche 6,84 Mo transférés au titre, contre 3,98 Mo en vague 1. La
différence ne vient pas du jeu. `tools/polish/verify2/netload.mjs` compte les octets par requête (CDP) sur les
deux builds de production :

- vague 1 (`dist/`) : 10,80 Mo en 12 s ;
- vague 2 : 10,64 Mo en 12 s ;
- mêmes 133 requêtes ;
- même musique du titre : 3 Mo, chargée en entier dans les deux builds.

`prod.mjs` lit la Resource Timing, où un flux média n'apparaît qu'une fois terminé : le chiffre dépend donc
de l'instant du relevé. Code JS : +39 Ko (+2 %). Build : +4 Mo, dus aux voix du narrateur à 48 kb/s.

## 3. Régressions et conflits

### 3.1 Couronne hors champ pendant la Grande Ombre (corrigé, `framingRig.ts`)

**Constat à l'image.** Dans `group`, `126-r3-greatShadow.jpg` (planche `group-climax.jpg`) :

- le meneur de la partie, Lagon (bot Faucon, couronné, 31,8 %), est coupé par le bas du cadre, sous le
  sous-titre ;
- à `r1-t103`, il n'est pas à l'écran du tout.

Le narrateur dit pourtant « La couronne est à Lagon. Elle se voit de loin. ».

**Cause.** Le plan serré de la Grande Ombre de climax (vague 2) cadre les humains, puis seulement les bots
qui tiennent sous la largeur visée. Le porteur de la couronne n'avait aucune priorité. Avant la vague 2,
l'arène entière restait cadrée, donc le meneur ne sortait jamais du cadre (mais il était minuscule). Climax
avait bien noté les bots au bord du cadre, sans parler de la couronne.

**Mesure.** Banc headless de climax étendu : `tools/polish/verify2/crownbench.ts`. Même simulation, mêmes
bots, vrai `CameraDirector` ; 4 cartes × 3 graines. Il compte la part des images de Grande Ombre où le
porteur de la couronne est hors champ, ou coupé par le bord ou le HUD.

Chaque case donne la part d'images où la couronne est hors champ ou coupée, puis l'envergure médiane
pendant la Grande Ombre (98-100 s → 108-110 s). La colonne « 3 humains » reprend la situation de `group`.

| Variante | 4 oiseaux, 1 humain | 4 oiseaux, 2 humains | 6 oiseaux, 1 humain | 4 oiseaux, 3 humains |
|---|---|---|---|---|
| Climax tel quel | **49 %** · 128 → 180 px | **48 %** · 116 → 163 px | **57 %** · 102 → 161 px | **81 %** |
| **Retenu : couronne en premier sous 1,4 a (hystérésis ×1,15)** | **28 %** · 125 → 165 px | **35 %** · 115 → 147 px | **17 %** · 92 → 134 px | **26 %** |
| Plafond 1,6 a | 19 % · 105 → 162 px | 26 % · 102 → 141 px | 13 % · 88 → 134 px | 17 % |
| Couronne toujours cadrée | 1,3 % · 95 → 160 px | 1,4 % · 90 → 136 px | 0,7 % · 88 → 132 px | 0 % |

Avec la version retenue :

- l'envergure médiane sur toute la Grande Ombre baisse de 2 à 5 % ;
- les tours ne changent pas : 14,4 % au plus, 0 image au-delà de 15 % à 4 oiseaux ;
- les 81 tests caméra restent verts, dont les deux tests de climax qui interdisent un cadre plus large que
  1,45 a.

La version « couronne toujours cadrée » casse ces deux tests : quand le meneur est à l'autre bout de
l'arène, le cadre monte jusqu'à 1,65-1,8 a. Le plafond 1,6 a fait passer 0,5 % des images au-dessus de 15 %
de tours.

**Correctif** (Edit ciblé, `src/host/camera/framingRig.ts`, `updateGsMask`) : après les humains, le porteur
de la couronne entre dans le masque si le cadre reste sous `GS_CROWN_CAP × a`, avec `GS_CROWN_CAP = 1.4`.
S'il était déjà cadré, le seuil est multiplié par `GS_KEEP`, pour éviter le va-et-vient.

- Constante commentée avec ses mesures ; commentaire d'en-tête du plan serré mis à jour.
- La boucle des bots saute les oiseaux déjà dans le masque.
- **Décision de DA à prendre :** monter `GS_CROWN_CAP` cadre mieux la couronne, au prix d'oiseaux plus
  petits (tableau ci-dessus). La valeur 1,4 est le choix prudent qui ne défait pas le gain de climax.

**À l'image, en vraie partie :** voir §6.

### 3.2 Jumelle de la démo et à-coup du titre (déjà corrigé par verify2-eyes)

Tech signalait que `demoFuture.prebuild` ne faisait rien quand l'appel venait du délai limite (`didTimeout`),
d'où 16 à 36 ms à la bascule de carte sous charge. Le code actuel avance de `IDLE_TIMEOUT_CHUNK` = 4 ticks
dans ce cas. Le commentaire de verify2-eyes est en place (`src/host/camera/demoFuture.ts`). Rien à ajouter.

### 3.3 Cercle noir au titre (déjà traité par verify2-eyes)

Title avait vu un petit cercle d'encre flotter dans le ciel au titre (`final-menu/095`). C'est l'anneau de
couronne (`drawCrownRing`), dont l'ancrage a été corrigé par verify2-eyes (`src/host/render/fx/system.ts`).
Non retouché.

## 4. Performance GPU à 12 oiseaux (iGPU Renoir, GPU libre)

Outil : `tools/polish/tech/perfmatrix.mjs --n=12 --speed=1`. Il pose une requête TIME_ELAPSED sur toute
l'image. Préchargement : `world/nohmr.mjs`. Aucun Chrome étranger pendant les passes retenues ; charge de 1 à 4.

### 4.1 Serveur de dev, par preset

Chaque case donne le temps GPU de l'image entière, p50 / p90, en ms.

| Preset (résolution) | Midi | Après-midi | Heure dorée | Couchant | Grande Ombre | img/s |
|---|---|---|---|---|---|---|
| Low (1280×720) | 3,20 / 3,60 | 3,66 / 4,47 | 3,58 / 4,05 | 3,81 / 4,66 | 3,83 / 4,46 | 60,3 partout |
| Medium (1600×900) | 6,76 / 7,07 | 6,59 / 6,94 | 6,95 / 7,29 | 7,86 / 8,32 | 7,99 / 8,55 | 60,3 partout |
| High (1920×1080), passe 1 | 9,95 / 10,67 | 9,23 / 9,65 | 10,01 / 10,64 | 10,24 / 10,73 | 10,32 / 10,66 | 60,3 partout |
| High, passe 2 | 9,51 / 10,05 | 9,70 / 10,33 | 10,10 / 10,97 | 10,74 / 11,83 | 10,33 / 10,82 | 56,4 à l'heure dorée, 54,1 au couchant, 60 ailleurs |

Rappel vague 1 :

- Low 3,11 → 3,72 (p90 au pire 4,13) ;
- Medium 6,60 → 7,84 (p90 au pire 8,29) ;
- High 9,35 → 11,09 (p90 au pire 13,15).

Low et Medium sont inchangés à 0,1-0,3 ms près. High est un peu meilleur à la Grande Ombre, et son p90 au
pire passe de 13,15 à 10,7-11,8 ms.

**Par passe, High (`--passes`)** : 9,06 → 11,09 ms au total. Relevé au pire, à la Grande Ombre :

| Passe | Vague 2 | Vague 1 |
|---|---|---|
| Ombres | 0,32 | 0,27 |
| G-buffer | 7,53 | 7,06 |
| Encre | 1,70 | 1,53 |
| SMAA | 1,53 | 1,61 |
| **Total** | **11,09** | **10,46** |

- Le SMAA LOW de world ne rapporte presque rien ici (1,43 à 1,64 ms, contre 1,61).
- Le G-buffer prend environ 0,5 ms, soit le coût des ajouts d'aquarelle qu'estimait world.
- L'écart total se tient dans la variation d'une passe à l'autre (voir 4.2).

### 4.2 A/B entrelacé des builds de production : vague 1 (`dist/`, 14 h 22) contre vague 2, High/12

Chaque case donne le temps GPU de l'image entière, p50 / p90, en ms.

| Phase | Vague 1, passe 1 | Vague 1, passe 2 | Vague 2, passe 1 | Vague 2, passe 2 |
|---|---|---|---|---|
| Midi | 9,17 / 9,40 | 9,17 / 9,48 | 9,41 / 9,75 | 9,42 / 9,70 |
| Après-midi | 9,25 / 9,52 | 9,23 / 9,53 | 9,11 / 9,45 | 8,96 / 9,29 |
| Heure dorée | 9,68 / 10,01 | 9,82 / 10,16 | 9,88 / 10,44 | 9,36 / 9,68 |
| Couchant | 10,15 / 10,56 | 10,04 / 10,34 | 10,28 / 10,63 | 10,24 / 10,62 |
| Grande Ombre | 10,54 / 10,97 | 10,55 / 10,93 | 10,28 / 10,64 | 10,25 / 10,60 |
| img/s | 60,3-60,4 partout | 60,3-60,4 | 60,3-60,4 | 60,3-60,4 |

**Aucune régression GPU** : les écarts restent sous 0,3 ms, dans les deux sens, et sous le bruit d'une passe à
l'autre. Les gains de world (shader du sol, SMAA) compensent ses ajouts (aquarelle, glacis) et ceux de birds
(LOD lointain, échelle ×1,75).

**W3 reste non tenu.** En production, un p90 ≤ 9,5 ms n'est atteint que l'après-midi (9,29-9,45 ms). Il
vaut 9,7 ms à midi, puis 9,7 à 10,6 ms de l'heure dorée à la nuit (jusqu'à 11,8 ms en dev). Le seuil de descente de la qualité (11 ms) n'est jamais
atteint en production.

Les images au-delà de 20 ms n'apparaissent qu'en dev, et pas à chaque passe (High passe 2 : 7,6 % et
11,5 %). Elles n'apparaissent dans aucune des 4 passes de production. C'est probablement le coût CPU du code
non empaqueté, pas le GPU.

### 4.3 Qualité « auto » (`tools/polish/verify/auto12.mjs`, 12 oiseaux, 2 manches à vitesse réelle)

Premier lancement, sans banc mémorisé.

**Build de production, A/B** (vague 1 `dist/` contre vague 2, 8862, GPU libre) :

- dans les deux builds, le banc du titre choisit **Medium** (`gpu_busy` 71-72 %) ;
- 2 manches à 60,0-60,1 img/s, 0 % d'images au-delà de 20 ms ;
- Medium stable aux entractes ;
- console propre.

Comportement identique.

**Serveur de dev** (8861) :

- le banc choisit **High** ;
- manche 1 en High : 60 / 57,4 / 56,9 / 55,8 / 56,6 img/s de midi à la Grande Ombre, avec 0,1 à 7,6 %
  d'images au-delà de 20 ms ;
- le moniteur redescend en **Medium** après la manche 1 ;
- manche 2 à 60 img/s, 0 %.

En vague 1, en dev, High avait tenu ses deux manches. L'A/B de production ne montre pourtant aucun écart.
Le banc est à la limite sur cette machine (déjà noté en vague 1 : High ou Medium selon la passe). Les images
manquées n'apparaissent qu'en dev. Je ne retiens donc pas de régression. Dans tous les cas, la qualité auto
retombe là où on tient 60 img/s.

## 5. Constats laissés tels quels

- **W3 (budget High à 12)** : voir 4.2. Il faut encore gagner 0,5 à 1,2 ms de l'heure dorée à la nuit. Le
  gain le plus plausible est dans le G-buffer (7,5 ms au pire). Mesure faisable maintenant, sur GPU libre,
  avec `whenfree.sh`.
- **Couronne** : le choix du plafond (§3.1) revient à la DA et à climax.
- **Autres bots au bord du cadre à la Grande Ombre** : comme l'annonçait climax, de 0,2 à 1,3 bot par image
  est coupé par le bord ou le HUD (4 et 6 oiseaux). Mon correctif ne traite que la couronne.
- **`?debug=fast`** : le « 5 » du compte à rebours final chevauche encore la bannière de la Grande Ombre sur
  une manche raccourcie (`solo/07`). C'est connu depuis la vague 1 ; ça ne se produit pas à vitesse réelle.

## 6. Contrôle final et fichiers

**Après mon correctif :**

- `tsc` : 0 erreur ;
- `check:boundaries` : OK ;
- `npx vitest run` : **29 fichiers, 355 tests verts**, dont les 81 tests caméra.

**Vraie partie de contrôle** : `tools/polish/climax/realgame.mjs --n=4 --rounds=3 --tag=verify2`. Un humain
au clavier et 3 bots, sur Parasols, Géantes et Cadran. Captures : `shots/polish2/climax/verify2/n4/`, planches
`sheet-r1..3`, regardées.

| Mesure à la Grande Ombre | Ma partie | Parties de climax (`real-final`, `real`) |
|---|---|---|
| Envergure médiane | 130 px (min 83) | 117 et 139 px |
| Largeur | 234 à 413 m | 190 à 426 m |
| Tours au plus | 12,0 % | 12,3-12,5 % |
| Console | propre | — |

- À 108 s sur le Cadran (`r3-108.jpg`), le meneur couronné (Safran, bot) est dans le cadre, à côté de
  l'humain et d'un poursuivant.
- À 101-104 s sur la même carte, il est encore hors champ (flèche jaune en bas) : le plafond était atteint,
  comme le banc le prévoit dans environ 28 % des cas.

Serveur de dev 8861 et serveurs de production 8862 arrêtés par leur PID.

**Fichiers modifiés (jeu)** : `src/host/camera/framingRig.ts` (Edit ciblé, §3.1 : `GS_CROWN_CAP`,
`updateGsMask`, commentaire d'en-tête).

**Outils ajoutés** (`tools/polish/verify2/`) :

- `crownbench.ts` : banc headless de climax, plus le porteur de la couronne ;
- `netload.mjs` : octets par requête pendant le titre, via CDP.

Scripts de machine partagée dans le scratchpad : `whenfree.sh`, `perffree.sh`, `ab.sh`, `auto-ab.sh`.

**Captures** : `shots/polish2/verify/sheets/`. Les scénarios ont aussi réécrit `shots/runner/{solo,phones,flows,resilience}`
et `shots/qa/{group,keyboard12,prod}`. Le vrai match de contrôle de la couronne est dans
`shots/polish2/climax/verify2/`.
