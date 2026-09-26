# Polish vague 1 — correcteur staging (`src/host/camera/**`)

Port 8831. Captures : `shots/polish/fix-staging/`. Outils ajoutés (à moi) : `tools/polish/staging/`.
Aucune modification hors périmètre (les plaques de `results.css` n'ont pas bougé). API : voir
`docs/agent-notes/staging.md` §8.

Tous les scripts Playwright ont été lancés avec `node --import ./tools/polish/staging/nohmr.mjs …` :
ce préchargement coupe le WebSocket HMR de Vite, sinon les modifications des six autres correcteurs
rechargeaient la page en pleine partie. `tools/polish/staging/match.mjs` est une copie de
`feel/match.mjs` dont la sonde importe les modules par leur URL réelle : celle de `feel/lib.mjs`
lisait une deuxième instance de `viewModel.ts` (ancres à 0) dès que Vite ajoutait `?t=`.

Vérifications communes : `npx vitest run src/host/camera` : 74 tests verts (53 avant), dont
`framing.test.ts` (fitSets, clampRigToSets, alignY) et le nouveau `framingRig.test.ts`.
`tsc` n'a aucune erreur sur `src/host/camera` ni `tools/polish/staging` (la seule erreur restante est
dans `tools/polish/feel/bot-pressure.ts`, qui n'est pas à moi). `check-boundaries` passe. La partie
de fumée `tools/e2e/solo.mjs` (3 manches, fin de partie, revanche) finit sans erreur console.

---

## S1 · Cadrage de manche : l'oiseau réel reste dans le cadre utile — **fait**

**Cause confirmée.** Le cadrage visait des points tirés vers l'ombre (70 %, z × 0,7). Au couchant,
l'oiseau réel partait donc sous la bande du HUD, ou hors champ quand son ombre était dans le Simoun.

**Correction.**
- `framing.ts` : `fitSets`, un cadrage conjoint exact en perspective. Chaque ensemble de points a son
  rectangle et des demi-étendues par point. Le premier ensemble est le sujet (centré) ; les autres
  sont des contraintes dures.
- `clampRigToSets` sert de garde-fou derrière les ressorts ; `projectRig` projette sans three.
- `framingRig.ts` : le sujet garde les poids du GDD (ombres 1,0, oiseaux 0,7) dans les marges du
  GDD. La boîte de chaque oiseau réel (± W/2, W/2 au-dessus, 0,74 W dessous pour l'étiquette, plus la
  couronne du meneur) doit tenir dans `USEFUL_RECT` (côtés 0,06, haut 0,21, bas 0,13). La boîte est
  prise à la position actuelle et dans 0,7 s. W suit `birdAnchors.scale`, donc l'échelle × 1,6 de B1.
- Si ces boîtes forcent le cadre, les ombres au-delà de ρ = 1,0 sont lâchées d'abord.
- Au-delà de 8 oiseaux, l'arène est posée contre le bas dans y 0,21-0,96 et les oiseaux descendent
  jusqu'à 0,975.
- Compte à rebours : un cadre fixe qui englobe les cercles des boucles.

**Vérifié.** Parties réelles d'une manche (pilote clavier et bots), `read-stats` étendu
(`tools/polish/staging/read-stats.mjs`, mêmes critères que `feel/read-stats.mjs`) :

| Scénario | Sous la bande, hors punch-in (échantillons avec ≥ 1 oiseau) | Hors cadre, hors punch-in | Avant (critique feel), sous la bande |
|---|---|---|---|
| six | **0,0 %** à toutes les phases | **0,0 %** | 42 % (rebours), 39 % (après-midi), 63 % (couchant) |
| duel | **0,0 %** | **0,0 %** : aucune ancre hors écran | 61 % (midi) ; hors cadre 18 % au couchant |
| twelve | **0,0 %** | **0,0 %** | 42 % (midi) |
| solo (4) | **0,0 %** | **0,0 %** | — |

- Pendant un punch-in (S6), seuls des bots sortent ; l'oiseau du joueur n'est jamais hors cadre (0 échantillon).
- Sable vide sous l'arène à 12 oiseaux, hors punch-in : médiane 3,2 %, p90 4,6 %, 4,1 % des
  échantillons au-dessus de 6 %, uniquement à la Grande Ombre, quand les oiseaux fuient vers l'est.
  Avant : 15 %.
- Images : `sheet-twelve-overview.jpg` (1er passage), `twelve/ov-*.jpg`.
- Banc headless (`tools/polish/staging/framing-sim.ts`, vraie sim, vrais bots, vrai réalisateur) :
  0,0 % sous la bande et 0,0 % hors cadre sur 2, 4, 6 et 12 oiseaux et 4 cartes, hors punch-in.

**Prix.** Le cadre est plus large d'environ 20 %. Mesuré au banc à partir de l'ancien `framingRig`
reconstitué :
- duel : envergure médiane 121-167 px au lieu de 148-194 ;
- 6 oiseaux : 60-75 px au lieu de 64-84.

Le duel reste de loin la caméra la plus proche : 105-196 px de médiane en partie réelle.

## S2 · Grande Ombre — **partiel**

**Fait.**
- Le front est borné à 40 m à l'ouest de l'oiseau le plus à l'ouest.
- Poussée lente de 10 % : le sujet peut occuper 10 % de plus de l'écran.
- Tangage −3° sur la phase.
- Le décalage vers l'est est gardé, borné par le glissement admis (`slackRight`).
- Le resserrement des dernières secondes est inchangé.

**Vérifié.**
- Solo (4 oiseaux, page de dev, `devpage/fix-s2-gs-n4.jpg`) : 98,8 → 108 s, cadre de plus en plus
  serré, lèvre du front dans le cadre dès 103 s.
- Envergure médiane à la Grande Ombre en partie réelle : solo 85 px, six 61, twelve 61, duel 115
  (critère : ≥ 60 px).

**Pas atteint à 6 oiseaux.** `devpage/fix-s2-gs-n6.jpg` : le plan reste large. Les bots s'étalent du
nord au sud (160 m) en fuyant vers l'est, et la contrainte dure de S1 garde tous les oiseaux dans le
cadre. Le front n'est plus la cause. Pour obtenir un plan serré à 6, il faudrait laisser sortir des
oiseaux, ce que S1 interdit.

## S3 · Les tours ne bouchent plus la caméra de jeu — **fait, sauf des pointes transitoires en duel**

**Correction.**
- `towerCover.ts` rastérise la silhouette des tours (troncs de cône, disques en ellipse selon l'angle
  de vue, grille 48 × 27, recouvrements comptés une fois).
- Dans `framingRig`, à 10 Hz, la part d'écran des parties au-dessus de 20 m est évaluée sur le cadre
  courant et sur le cadre visé.
- Au-delà de 15 %, le tangage remonte de 5 puis 8°, puis le cadre recule de × 1,2, × 1,45 ou × 1,8
  (hystérésis à 11 %). Le recul s'est avéré nécessaire : au-dessus d'un grand disque, relever le
  tangage ne dégage rien. Mesuré sur un cadre du duel au bord du Grand Parasol : 51 % de
  couverture, encore 51 % à +8°, 17 % après un recul de × 1,45 et 12 % à × 1,8.
- Pas de zoom de piqué ni de punch-in quand la paire est sous un disque (`birdUnderDisc`).

**Vérifié.**
- `art/match.mjs` complet (3 manches, 2 téléphones, clavier, Faucon ; `artmatch/`, planches
  `sheet-art-r1-golden-sunset.jpg` et `sheet-art-r23-golden-sunset.jpg` regardées) : aucune tour
  au-delà de 15 % du cadre aux heures dorées et au couchant, aucune étiquette sur un disque
  (`artmatch/157` : l'étiquette est au-dessus du disque ; la trame W9 fait déjà son effet).
- Estimation de la caméra en parties réelles : six max 7 %, solo max 11 %, twelve max 5 %.
- **Duel : 5,5 % des échantillons au-dessus de 15 %**, en deux épisodes de 1,6 à 4 s, pointe à 26 %
  à 86 s (`duel/014-phase-sunset_01448_p0.95.jpg`). Le cadre de 110 m frôle le Grand Parasol, et les
  ressorts mettent environ une seconde à reculer.

## S4 · Cinématique du titre — **partiel, nettement mieux sans être à 100 %**

**Fait** (`cine.ts`, `director.ts`).
- `CLUTTER_MAX` passe de 0,3 à 0,12.
- `shotFault` repère quatre défauts :
  - une tour à moins de 45 m réellement à l'image (plus de 5 % de large), ou une caméra collée à une tour ;
  - une tour de premier plan (jusqu'au sujet, 80 m au moins) de plus de 12 % de la largeur ;
  - le Simoun à moins de 120 m, vu d'une caméra basse ;
  - une tour de premier plan dans la case du logo ou du pied de page (`TITLE_LAYOUT.uiRects`).
- Suivis :
  - première prise choisie parmi 6 oiseaux × 2 côtés × 4 angles : la première propre, sinon la moins mauvaise ;
  - nouvelle prise en coupe franche, avec 0,8 s d'anticipation, au lieu d'un lent passage de l'autre
    côté qui laissait une tour plein cadre deux secondes ;
  - oiseaux en piqué exclus (nouvelle prise si le sujet engage un piqué).
- Couchant : sujet, distance (40 ou 30 m) et place du soleil choisis de la même façon.
- Grue : la visée est corrigée (au plus 25°) pour que le sujet reste à l'image du plan serré au plan
  large. Plus de plan sans sujet à mi-grue.
- Vue large : 4,8 s en heure dorée, tangage 22°, cadrée sur un groupe d'oiseaux et le front.
- La boucle finit sur deux prises de couchant ; ordre des plans : crane, track, group, track, orbit,
  sunset, sunset.
- Le Simoun proche est masqué pour tout le plan (`hideStorm`, décidé à la coupe, donc sans saut en
  cours de plan).
- Premier plan après le chargement : validé comme les autres (choix de prise avant la première image).

**Vérifié.**
- `art/title.mjs` sur 4 graines (`title-a` … `title-d`, planches regardées) et `titlecut.mjs` sur 3
  lancements (`sheet-titlecut.jpg`) : les premières images ont toutes un oiseau net, ni tour au
  centre ni image vide.
- `tools/polish/staging/title-probe.mjs` (défaut de composition à 4 Hz, 3 graines × 90 s) :
  29,5 % d'échantillons signalés. Ce détecteur est strict : un fût à 40 m au bord du champ suffit.
  Sur la planche finale `sheet-title-d.jpg`, environ 5 images sur 40 sont vraiment ratées (tour de
  premier plan ou mur de tour : 009, 018, 034, 041), contre environ 40 % pour la critique art. Il n'y
  a plus de Simoun en gros plan, plus de plongeon à 25 m, plus d'orbite sombre de 8 s.

**Pas atteint.**
- La lettre de « 0 image avec une tour de plus de 12 % de la largeur » est impossible avec des plans
  bas qui traversent l'arène des Parasols : un disque de 12 m à 120 m fait déjà 18 % de la largeur. Je
  l'ai appliquée aux tours de premier plan.
- Les derniers ratés viennent des moments où aucune des 48 prises essayées n'est propre (bots serrés
  contre les tours). Il faudrait un autre type de plan de secours, par exemple sur le ciel.

## S5 · Podium — **fait**

**Fait** (`podium.ts`, `director.ts`).
- Tours en archétype Pile synthétique : fût crème, disque ocre sous les plaques, plateau turquoise.
- `PERCH_ABOVE_PLATE_PX` passe de 26 à 84 px (72 pour le vainqueur, dont la plaque est la plus haute,
  pour que sa couronne reste sous le bandeau).
- Entrée : poussée de 4,5 s, le temps du plan pur avant l'UI (podiumReady à 2,2 s, plus les 2,5 s de
  délai de H6). La focale passe de × 1,16 à × 1 pendant que la caméra monte.
- Ensuite, respiration de focale ± 2 % (17 s) et balancement.
- `podiumReady` inchangé. `results.css` non modifié.

**Vérifié** (`tools/polish/staging/aspects-podium.mjs`, `aspects/`, planche `sheet-podium-aspects.jpg`) :
- podium à 4 et à 12 en 1920 × 1080 et en 3840 × 2160 : les trois oiseaux entiers au-dessus des
  plaques, couronne visible à 12 ;
- deux captures à 3 s d'écart différentes : 5,6 % des pixels en 1080p, 4,3 % en 4K ;
- in-game dans `artmatch/191-podium-late.jpg`.

**Limite.** Contre-jour voulu par le GDD (soleil derrière le vainqueur) : les Piles se lisent en tons
d'ombre mauves. La forme et les disques sont lisibles, mais le crème, l'ocre et le turquoise ne le sont
qu'en valeur. Un éclairage d'appoint des tours relèverait de world.

## S6 · Punch-in sur les touches qui comptent — **fait (avec un écart assumé)**

**Fait.**
- Déclenchement sur un `diveHit` dans le champ qui vole la couronne, implique un humain ou vole au
  moins 1 % de l'arène (au-delà de 8 oiseaux : couronne ou humain seulement).
- La paire est centrée dans le rectangle utile ; montée 0,3 s, tenue ralenti + 0,5 s, retour en ressort.
- Au plus un toutes les 6 s de sim, jamais dans les 3 dernières secondes, jamais sous un disque.
- Le zoom de piqué de 8 % s'efface pendant un punch-in.
- Beat `punchIn` et `cameraState.punch`.

**Écarts.**
- Largeur × 0,75 **ou plus serré, jusqu'à × 0,5**. L'échelle cosmétique garde les petits oiseaux vers
  60 px : à 12 oiseaux, × 0,75 ne les grandit pas du tout. Le zoom est donc calculé pour gagner × 1,3
  d'envergure à l'écran.
- Les oiseaux humains restent à l'écran.
- Le plan est refusé s'il n'est pas assez serré ou si la paire n'y est pas près du centre, après trois
  essais moins serrés. C'est le cas d'une couronne entre bots quand l'humain est à l'autre bout.

**Vérifié** (`tools/polish/staging/punch-stats.mjs`) : les 12 punch-ins des parties réelles
donnent un gain d'envergure de **× 1,43 à × 2,01**.

| Partie | Gains mesurés | Écart minimal entre punch-ins |
|---|---|---|
| twelve | × 1,49 à × 2,01, dont une **couronne entre bots** à × 1,84 (`sheet-twelve-crown-punch.jpg`) | 6,5 s |
| six | × 1,43 à × 1,77 | 9,3 s |
| solo | × 1,61 | — |
| duel | × 1,87 | — |

Deux touches de couronne sur quatre à 12 oiseaux ont été refusées (l'humain était trop loin). Le
banc headless montre aussi zéro punch-in dans les 3 dernières secondes.

## S7 · Carte des résultats quasi orthographique — **fait**

**Fait.**
- `MAP_FOV` = 18°, avec la même emprise, prise 2,3 × plus loin.
- La focale se resserre pendant la montée : la largeur cadrée est interpolée, donc sans saut.
- `mapReady`, la moitié gauche et l'illumination sont inchangés.
- `cameraState.mapRect` et `mapReady.rect` donnent la boîte écran de l'arène (suit la poussée
  lente). hostui (H14) utilise pour l'instant `resultsMapRect(aspect)`, qui reste valable.

**Vérifié.**
- Résultats des manches 1 et 2 (`artmatch/093-r1-results-b.jpg`, `artmatch/136-r2-results-b.jpg`) :
  les fûts des bords sont des moignons courts.
- Rayon le plus oblique : 13,3° au bord gauche de la carte en 16:9 (≤ 15°).
