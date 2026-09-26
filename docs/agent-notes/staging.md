# Agent staging — mise en scène (caméra, cinématiques, repères du HUD)

État : **fait et vérifié en images** (captures de séquences, page de dev). Code : `src/host/camera/**`.
Page de dev : `dev/camera.html` (`src/dev/camera/**`). Outils : `tools/camera-seq.mjs` (séquences + planche ; `--page=/` sur le vrai jeu),
`tools/camera-probe.mjs` (positions écran des ancres au fil du temps). Tests : `npx vitest run src/host/camera` (53 : cadrage exact
sur 48 configurations, temps forts des résultats et worldView, podium, coupes/fondus).

## 1. API d'intégration (pour le runner)

```tsx
import { GameCamera, HudProjector, PodiumStage, stageModes, cueCamera, cameraCue, cameraBeats } from './camera/index.ts'

<WorldCanvas>
  {/* runner : useFrame(…, -10) qui écrit gameView (sim, prevBirds, alpha, realTime, timeScale, players) */}
  <PodiumStage />                                   {/* −3 : au podium, remplace gameView.sim par la scène du podium */}
  <GameCamera />                                    {/* −2 : pilote la caméra PAR DÉFAUT du Canvas */}
  <HudProjector />                                  {/* −1,5 : hudAnchors.birds[slot] + setAudioListener */}
  <Birds quality={q} modes={stageModes} />          {/* −1 ; stageModes est un tableau mutable ('perch' au podium) */}
  <Fx quality={q} glorySlot={glory} />              {/* 0 ; glory = mode podium ? cameraCue.winnerSlot : −1 */}
</WorldCanvas>
```

- Ordre des `useFrame` : **runner < −3** (ex. −10) → PodiumStage −3 → GameCamera −2 → HudProjector −1,5 → Birds −1 → Fx 0 → pipeline NPR 1.
- `<GameCamera/>` pilote la caméra du Canvas (FOV 35-45°, near 1, far 9000) ; `makeDefault` est accepté mais inutile (aucune nouvelle caméra, le pipeline NPR ne se reconstruit pas).
- `gameView.realTime` doit avancer (secondes réelles) : l'illumination des résultats s'y cale.
- Réglage `screenShake` (useSettings) lu à chaque touche.
- Rien n'alloue par frame (hors construction du podium, une fois).

### Le contrat `cameraCue` (`src/host/camera/cue.ts`)

Le runner écrit, la caméra lit. Utiliser `cueCamera(mode, { winnerSlot, podium, cut, coWinners })` (écrit les champs puis incrémente `version`).

| Mode | Quand le runner le pose (et quelle sim dans gameView) | Ce que fait la caméra |
|---|---|---|
| `loading` | chargement (sim null) | plan fixe vers le couchant (seul le ciel est rendu tant que la carte n'existe pas) |
| `title` | écran titre, **sim de démo** (`mode: 'demo'`, 40 s) | 6 plans calés sur le soleil de la démo, coupes franches, en boucle (voir §3) |
| `lobby` | salon (sim `mode: 'lobby'`) | cadrage des oiseaux du salon dans le rectangle libre centre-haut (x 0,30-0,69, y 0,13-0,63), tangage 50°, nord en haut (le joystick est absolu) |
| `rules` | cartes des règles (sim du salon ou de la manche) | dérive lente est-ouest, tangage 54° (fondu de 2,2 s depuis le salon) |
| `round` | **au moment où la sim de la manche est posée** (compte à rebours compris) | cadrage de jeu GDD §13.1 + dramatisation (§2) |
| `roundResults` | **à l'événement `night`**, `winnerSlot` = vainqueur de `finishRound` (−1 si égalité) ; **ne pas changer de sim avant la manche suivante** | pause de nuit 1,5 s (le cadrage continue), montée à la verticale en `RULES.camNightRiseSeconds`, carte dans la moitié gauche |
| `podium` | écran de fin de partie : `podium: [1er, 2e, 3e]`, `winnerSlot` (la sim de la dernière manche reste dans gameView) | plan bas face à l'ouest, trois tours sous les plaques de l'UI, soleil derrière le vainqueur |
| `credits` | crédits (sim de démo) | longue suite de plans lents enchaînés par fondus de caméra (3,2 s), sujets sur les bords |

**Coupes et fondus.** La caméra coupe d'elle-même quand `gameView.sim` change d'objet (nouvelle manche, salon, démo, podium) — y compris si la sim change dans la demi-seconde qui précède ou suit le changement de mode. Sinon elle glisse (fondu de caméra de 2,2-2,6 s : salon → règles, titre ↔ crédits). `cut: true` force une coupe.

**Retour vers le runner** : `cameraState` (`mode`, `modeTime`, `shot`, `rise` 0..1, `mapReady`, `podiumReady`, `frame` = cadre visible au sol ; ajouts polish : `mapRect` = boîte écran de l'arène sur la carte des résultats (fractions, suit la poussée lente), `punch` / `punchCount` (punch-in en cours, cumul), `towerCover` (part d'écran bouchée par les tours au-dessus de 20 m), `arena` (boîte écran de l'arène en manche), `shotFault` (défaut de composition du titre, debug)) et l'émetteur `cameraBeats` :
`riseStart` (fin de la pause de nuit) · `illuminate` (vague d'illumination lancée) · `mapReady` (carte cadrée, avec `rect` = boîte écran de l'arène : **moment conseillé pour `setScreenState('roundResults')`**, ≈ 4 s après `night`) · `podiumReady` (2,2 s après l'entrée) · `cut` · `punchIn` (hunter, target : punch-in sur une touche qui compte).

## 2. Ce que fait chaque mode (détails)

**Manche** (`framingRig.ts`, `framing.ts`) — GDD §13.1 à la lettre, avec trois ajouts justifiés :
- (Polish : voir §8 — boîtes des oiseaux réels en contrainte dure dans le rectangle utile.) Points cadrés : centres d'ombre (poids 1, **ramenés dans l'arène** à ρ ≤ 1,04 : au couchant une ombre peut tomber 100 m au-delà du bord, où elle ne peint pas) et oiseaux tirés vers leur ombre (poids 0,7), **plus leur position dans 0,7 s** (anticipation : un ressort critique à ω 1,8 traîne de 2v/ω ≈ 23 m ; sans elle, un oiseau qui fonce vers le bord sortait du cadre). Marges 12 % / 15 %, largeur 110 m → 1,1 × l'arène ; si les oiseaux débordent le dézoom maximal, on cadre l'ellipse entière de l'arène.
- **Résolution exacte en perspective** (`fitPoints`) : chaque bord du rectangle d'écran est un plan passant par la caméra ; position au plus près sous ces 4 contraintes (testé : `framing.test.ts`, 49 cas).
- Ressorts critiques (exacts, stables) : position ω 1,8, zoom ω 1,2 (**dézoom ω 1,2 × 1,6** : on ne perd jamais un oiseau), zone morte 4 m (cible et largeur). Lacet fixe (nord en haut), tangage 58° → 42° linéaire sur la manche. Pas de ciel en jeu (haut du cadre ≥ 22° sous l'horizon).
- Compte à rebours : le cadre reste celui de l'anneau de départ (les oiseaux bouclent sur place) ; **travelling d'ouverture** : recul de 32 % et +10° de plongée qui se referment en douceur à « Envol ».
- Piqué engagé (`diveCommit`, chasseur et cible dans le champ, aucun des deux sous un disque) : zoom de `camDiveZoom` (8 %) vers la paire, montée 0,36 s, tenu pendant le ralenti après une touche, relâché en 0,9 s (effacé par le punch-in, §8).
- Touche (`diveHit` dans le champ, réglage tremblement actif) : tremblement de 0,42 s, amplitude `camShakeAmp` par tranche de 26 m cadrés (≈ 11 px en 1080p quel que soit le zoom ; 0,15 m brut ferait moins d'un pixel à 300 m).
- Grande Ombre : le front de nuit (à la hauteur de chaque oiseau, borné à 40 m à l'ouest de l'oiseau le plus à l'ouest) est cadré, poussée lente et tangage −3°, la cible glisse de 6 % vers l'est sans pousser le cadre au-delà du bord est de l'arène ni sortir un oiseau du rectangle utile.

**Résultats de manche** (`director.ts`) : pause de nuit de 1,5 s (le gel ; le cadrage suit encore les oiseaux qui planent), puis montée de 2,5 s (interpolation du rig : cible, tangage 42° → 90°, focale 40° → 18°, largeur cadrée en log ; lissage à dérivées nulles) jusqu'à la vue verticale nord en haut, l'arène dans x 0,035 → bord du panneau − 2 % (0,515 en 16:9 ; `resultsMapRect(aspect)` suit le zoom de l'UI, vérifié en 4:3) × y 0,085-0,915, puis poussée imperceptible (3,5 % sur 14 s).

**Podium** (`podium.ts`, `PodiumStage.tsx`) : scène synthétique clonée de la dernière manche (territoire peint gardé au sol, tours de la carte retirées) ; trois tours « Pile » (crème, disque ocre, plateau turquoise) placées **par lancer de rayon** pour que le point de perche tombe 84 px (1080p) au-dessus de chaque plaque (`PODIUM_X` = 0,30 / 0,50 / 0,70, haut des plaques 37 % + 40/0/70 px) ; oiseaux en mode `'perch'`, couronne sur le vainqueur, les autres tournent au loin à l'ouest. Caméra à 5,5 m, 46 m des tours, regard relevé de 6° (horizon au tiers bas). Ciel : `sunOverride` 12° plein ouest (disque derrière le vainqueur), palette KF1,6, pas de nuit (`nightAll` 0), Simoun masqué. Entrée : poussée de 4,5 s (focale × 1,16 → 1, montée de 1,6 m) puis respiration de focale ± 2 % et de ±0,12 m.

**Titre** (`cine.ts`) : plans calés sur le soleil de la démo (u = t/T), coupes franches, reprise au rebouclage (polish vague 2 : **prises validées sur l'avenir exact de la démo**, séquence track 0 → crane 0,14 → group 0,3 → track 0,44 → group 0,58 → sunset 0,72 → sunset 0,9, replis, voir §10 ; description d'origine ci-dessous) :
`crane` (u 0 : serré sur un oiseau — sur le ciel s'il vole haut — puis grue qui révèle l'arène dans la zone bas-gauche) → `track` (0,17 : travelling ; oiseau haut en contre-plongée posé à (0,75 ; 0,33), oiseau bas en plongée à (0,33 ; 0,66), bascule douce quand il change d'étage) → `group` (0,34 : plan bas d'un groupe, lacet choisi pour qu'aucune tour ne barre l'image) → `track` (0,50) → `sunset` (0,66 : face au soleil posé à x 0,78 en haut à droite, oiseau en silhouette, choisi parmi ceux dont le contrechamp est dégagé) → `orbit` (0,86 : vue large qui tourne, l'arène peinte et la Grande Ombre dans le bas du cadre, jusqu'à la nuit et au rebouclage ; le runner change de carte à chaque boucle → coupe).
Évitement des tours : `towerClutter` mesure la part de la largeur de l'écran masquée par les tours proches (rayon max, disques et gnomon incliné compris) ; au-delà de 30 % le suivi change de côté (3 fois → autre oiseau), le groupe dérive son lacet puis reprend un autre groupe, le couchant reprend un autre oiseau (nouvelle prise, coupe franche).
Le logo (haut gauche) et le menu (bas droite) restent libres. Les suivis compensent le retard des ressorts (avance 2v/ω).

**Crédits** : même bibliothèque de plans, plus lents (12-14 s), fondus de caméra de 3,2 s, sujets sur les bords (panneau central x 0,23-0,77).

## 3. Qui écrit quoi dans `worldView`

**La caméra (GameCamera) possède `worldView`** : le runner n'y écrit pas.
- `resultsFade` : lissé 0 → 1 pendant la montée (roundResults), 0 ailleurs.
- `exactBorders` : vrai de la montée jusqu'à la sortie de roundResults.
- `illuminateTerritory(winnerSlot, gameView.realTime)` : à 42 % de la montée (la vague de 0,8 s finit avec elle) ; remis à zéro en sortie.
- `sunOverride`, `paletteElevOverride`, `nightAll`, `hideStorm` : réglés au podium, remis à `null`/`false` ailleurs. Titre et salon suivent leur sim (démo = coucher accéléré complet ; salon = KF50 fixe par la sim).

## 4. Repères du HUD et audio

`<HudProjector/>` écrit chaque frame `hudAnchors.birds[slot] = { active, x, y, behind, hidden }` en px CSS (origine du canvas + `size.left/top`) : point de l'oiseau interpolé, abaissé de sa demi-hauteur apparente (≤ 8 % de l'écran) pour que l'étiquette passe dessous ; `behind` si derrière la caméra (coordonnées miroir pour la flèche) ; `hidden` = caché sous une tour **ou dans la nuit**. Vérifié : étiquettes de l'UI réelle sous les oiseaux (page de dev `?ui=1`), sonde `tools/camera-probe.mjs`.
Il appelle aussi `setAudioListener({ x, y, halfWidth, halfHeight })` avec le cadre visible au sol (rayons des coins bornés à 700 m). `audio={false}` pour ne pas créer l'AudioContext (pages de dev).

`buildPodiumView(state, ranking, aspect, dense)` (pur) et `podiumLayout()` sont exportés pour qui voudrait la scène sans le composant.
Échelle des oiseaux au dézoom : déjà gérée par `<Birds renderScale="auto">` (agent birds, ≤ `RULES.birdRenderScaleMax`) ; rien à ajouter.

## 5. Page de dev et vérification

`dev/camera.html?mode=title|lobby|rules|round|roundResults|podium|credits|loading&t=&n=&map=&seed=&speed=&q=&ui=1&anchors=1&shake=0&chain=1&debug&lang=`
Vraie sim + vrais bots (`src/dev/camera/runner.ts` : ralentis de touche comme le GDD, nuit → résultats → podium avec `chain=1`), **UI réelle par-dessus** (`ui=1`, stores remplis par les fixtures de l'agent ui), ancres (`anchors=1`). `window.__cam` : `cue(mode)`, `start(mode, t)`, `jump(t)`, `speed(v)`, `fireDive()` (piqué + touche synthétiques entre les deux oiseaux les plus proches), `director()`, `anchors()`.
Séquences : `node tools/camera-seq.mjs <nom> "<requête>" --frames=9 --every=1500 [--at="1400:__cam.fireDive()"]` → `shots/staging/<nom>.jpg`.

Vérifié en images (captures regardées) : manche entière en accéléré (×5), 2 et 12 oiseaux en 1080p, compte à rebours et travelling (sonde : tous les oiseaux dans 0,14-0,83 de l'écran à « Envol »), piqué + touche (zoom, tache, ralenti ; tremblement mesuré 10,6 px crête, 0,42 s), Grande Ombre (front cadré, arène pleine), nuit → montée → carte à gauche avec le panneau réel (16:9 et 4:3), podium (6 et 9 joueurs, 16:9 et 4:3) avec les plaques réelles, titre (boucles complètes sur 3 cartes/graines, dans la page de dev et dans le vrai jeu), salon avec ses panneaux (page de dev et vrai jeu), crédits, règles.

## 6. Limites connues

- **Podium à plus de 6 joueurs** : l'UI remonte les plaques à 25 % de la hauteur ; il ne reste que 7 % entre la case du champion (bas à ~18 %) et les plaques. Les tours reculent (80 m) mais les oiseaux passent en partie sous la case. Demande à l'UI dans REQUESTS.md.
- Les plans de titre dépendent de ce que font les bots : un plan peut être moins réussi qu'un autre (tour au premier plan malgré l'évitement, oiseau qui file hors du tiers prévu) ; tous restent lisibles et bougent en douceur.
- Chargement : sans sim, seul le ciel est rendu (l'écran de chargement de l'UI le couvre).

## 7. Modifications hors périmètre

Aucune (polish vague 1 compris : les plaques de `results.css` n'ont pas bougé, les oiseaux tiennent au-dessus).

## 8. Polish vague 1 (correcteur staging, ordres S1-S7 ; détail et mesures : `docs/polish/fix-staging.md`)

**Cadrage de manche (S1)** — `framing.ts` gagne `fitSets` : cadrage conjoint de plusieurs ensembles de
points, chacun dans son rectangle, avec des demi-étendues par point (`ext` : côtés, haut, bas, le long
des axes de la caméra, exact en perspective). Le premier ensemble est le sujet (centré, `alignY`
pour le poser contre le bas), les autres sont des contraintes dures ; `slackRight/Left` = glissement
latéral admis. `clampRigToSets` ramène un rig au plus près pour que les ensembles tiennent (garde-fou
derrière les ressorts) ; `projectRig` projette sans three. `fitPoints` est devenu un cas particulier.
Dans `framingRig.ts` : sujet = ombres (1) + oiseaux tirés vers elles (0,7), marges du GDD ; **boîte de
chaque oiseau réel** (± W/2, W/2 au-dessus, 0,74 W dessous pour l'étiquette, couronne du meneur via
`crownLift`, W = envergure × `birdAnchors.scale` : suit l'échelle × 1,6 de B1) **dans `USEFUL_RECT`**
(x 0,06-0,94, y 0,21-0,87), maintenant et dans 0,7 s ; le garde-fou recale le cadre suivi à chaque
frame. Si ces boîtes forcent le cadre, les ombres au-delà de ρ = 1,0 sont lâchées d'abord. Au-delà de
8 oiseaux : arène dans `ARENA_RECT_CROWDED` (y 0,21-0,96, posée contre le bas), oiseaux jusqu'à 0,975.
Compte à rebours : cadre fixe calculé sur les cercles des boucles (centre + rayon).

**Grande Ombre (S2)** — front cadré au plus 40 m à l'ouest de l'oiseau le plus à l'ouest ; poussée
lente (le sujet peut occuper 10 % de plus de l'écran) et tangage −3° sur la phase ; décalage vers l'est
borné par le glissement admis (`slackRight`).

**Tours (S3)** — `towerCover.ts` : rastérisation (48 × 27) de la silhouette des tours (troncs de cône
et disques, ellipses selon l'angle de vue) pour un projecteur quelconque ; `towerCoverage(sim, rig)`
pour la manche. Au-delà de 15 % d'écran (parties > 20 m, cadre courant et cadre visé), tangage +5 puis
+8°, puis recul × 1,2 / 1,45 / 1,8 (hystérésis à 11 %). Pas de zoom de piqué si la paire est sous un
disque (`birdUnderDisc`).

**Punch-in (S6)** — sur un `diveHit` dans le champ qui vole la couronne, implique un humain
(`gameView.players[slot].kind` phone/keyboard) ou vole ≥ 1 % de l'arène (au-delà de 8 oiseaux :
couronne ou humain) : la paire au centre du rectangle utile, largeur × 0,75 **ou moins** (jusqu'à
× 0,5) pour que l'envergure gagne × 1,3 malgré l'échelle cosmétique, montée 0,3 s, tenue ralenti +
0,5 s, retour en ressort. Les oiseaux humains restent à l'écran ; plan refusé s'il n'est pas assez
serré ou si la paire n'y est pas près du centre (après trois essais moins serrés). Au plus un toutes les
6 s de sim, jamais dans les 3 dernières secondes. Seuls des bots peuvent sortir du cadre pendant un
punch-in.

**Titre (S4)** — `cine.ts` : `shotFault` (tour < 45 m à l'image > 5 % de large, tour de premier plan
> 12 % de la largeur, Simoun < 120 m vu d'une caméra basse, tour de premier plan dans la case du logo
ou du pied de page), suivis choisis parmi 6 oiseaux × 2 côtés × 4 angles (première prise propre, sinon
la moins mauvaise), nouvelle prise en coupe franche avec anticipation de 0,8 s, oiseaux en piqué exclus,
grue qui garde son sujet, vue large de 4,8 s à 22° sur un groupe d'oiseaux, la boucle finit sur deux
prises de couchant ; le Simoun proche est masqué pour tout le plan (décidé à la coupe).
`TITLE_LAYOUT.uiRects` décrit les cases de l'UI du titre.

**Podium (S5)** — tours en archétype Pile (fût crème, disque ocre sous les plaques, plateau turquoise),
`PERCH_ABOVE_PLATE_PX` 26 → 84 : oiseaux entiers au-dessus des plaques. Entrée : poussée de 4,5 s
(focale × 1,16 → 1, caméra qui s'élève) jusqu'à l'entrée de l'UI, puis respiration de focale ± 2 %
(17 s) et balancement : l'image n'est jamais figée. `podiumReady` reste à 2,2 s.

**Résultats (S7)** — vue carte à `MAP_FOV` = 18° (même emprise, 2,3 × plus loin) : rayon le plus oblique
≈ 15°. La focale se resserre pendant la montée. `cameraState.mapRect` et `mapReady.rect` donnent la
boîte écran de l'arène (planche imprimée de l'UI, H14).

Outils : `tools/polish/staging/` — `framing-sim.ts` (banc headless du cadrage : vraie sim, vrais bots,
vrai réalisateur, mêmes critères que `read-stats.mjs`), `match.mjs` + `read-stats.mjs` + `punch-stats.mjs`
(partie réelle avec sonde qui importe les modules par leur URL réelle — la sonde de `feel/lib.mjs`
lisait une deuxième instance de `viewModel.ts` quand Vite ajoute `?t=`), `title-probe.mjs` (défauts du
titre), `nohmr.mjs` (préchargement qui coupe le HMR : les autres correcteurs rechargeaient la page).

## 9. Polish vague 2 (correcteur climax : Grande Ombre et tours ; détail et mesures : `docs/polish/fix2-climax.md`)

**Grande Ombre, plan serré (S2)** — `framingRig.ts`. À 8 oiseaux ou moins, de 1,2 s avant la Grande Ombre
jusqu'à la fin de la pause de nuit, le cadre ne suit plus toute la dispersion de l'arène :
- `gsMask` (masque de slots, 5 Hz) : les **humains toujours** (`gameView.players[slot].kind` phone/keyboard),
  puis les bots, des voisins des humains aux plus lointains (sans humain : du plus proche du front au plus
  lointain ; ceux déjà dans la nuit en dernier), chacun gardé
  si le cadre reste sous la largeur visée `1,2 a → 0,8 a` (a = demi-grand axe de l'arène, jamais sous
  `camMinWidth`), × 1,15 pour un bot déjà cadré (hystérésis). Les bots hors masque peuvent sortir (flèche
  hors champ du HUD, GDD §13.1) ; la contrainte dure S1 et le garde-fou ne portent que sur le masque.
  Figé pendant la pause de nuit (la montée part de ce cadre). Au-delà de 8 oiseaux : inchangé (arène).
- Sujet : les oiseaux cadrés et leur position dans 0,7 s, leur ombre seulement si elle est à moins de 45 m
  (au soleil rasant elle file au bord est), et le front à leur hauteur, au plus 90 → 40 m à l'ouest du plus
  à l'ouest d'entre eux (le mur de nuit entre tôt dans le cadre).
- Zoom avant × 1,8 plus vif pendant les 3 premières secondes (poussée à l'annonce), poussée lente de 10 %
  et décalage vers l'est inchangés.
- Tangage −5° sur la phase (au lieu de −3°), **bloqué quand les tours couvriraient plus de 15 % du cadre
  abaissé** (`gsLow`, ressort ; revient sous 11 %). Gardé pendant la pause de nuit (plus de saut de 3° à
  l'instant de la nuit).

**Tours (S3, W9)** — mesure d'encombrement `obstruction()` = max(part d'écran couverte au-dessus de 4 m
(20 m avant), 0,45 × largeur de la plus large tour, pénalité si la caméra est à moins de 45 m d'une
tour (`towerClearance`, nouveau dans `towerCover.ts` ; au-delà de la bande de trame de 30-38 m du
matériau, qui ne se voit plus qu'en passage)). Parades essayées dans l'ordre (relever +5°, +8°,
puis reculer × 1,2 / 1,45 / 1,8 ; 12 évaluations au plus par estimation à 10 Hz), retenue si elle ramène
sous 12 % (avant : 15 %, le cadre se posait sur le seuil). Bug corrigé : le cadre visé contenait déjà le
recul courant, chaque parade était évaluée sur un cadre reculé deux fois (prévision trop optimiste, cadre
resté à 16-20 %). Un recul décidé s'applique aussitôt au cadre visé (le ressort de zoom le lisse ; avant, deux
ressorts en série : le cadre restait bouché ~1 s) ; retour du recul plus vif (ω 1,6 au lieu de 1,0). Punch-in refusé ou relâché plus tôt
(10 Hz) si son cadre est encombré (> 12 %) ou si sa caméra passe à moins de 42 m d'une tour (`punchReject`
= `'tours'`). Essais écartés (mesurés au banc, pas mieux ou pires) : glissement latéral du cadre (deux
versions), relèvement de 12°.

`FramingRig.coverTrace` (base, prévu) et `gsMask` sont lisibles pour le debug et les scripts.
Outils : `tools/polish/climax/` — `bench.ts` (banc headless : Grande Ombre par tranches de 2 s, tours par
phase, épisodes > 15 %, coût de `update`), `shots.mjs` (page de dev, 4 cartes × 4/6/12 oiseaux, mesures
dont la couverture **réellement peinte** par les tours, rafale screencast), `realgame.mjs` (vraie partie
avec un joueur clavier), `debug-cover.ts` (parades à un instant donné).

## 10. Polish vague 2 (correcteur title : cinématique du titre ; détail et mesures : `docs/polish/fix2-title.md`)

**Principe.** Chaque plan de la séquence est une suite de **prises** (`Setup` : type, oiseau, côté,
angle, distance, lacet, tangage). Une prise n'est montrée que si elle a été **simulée** sur sa durée
(ressorts, cadreur et visée compris, pas de 0,2 s puis 0,05 s) et **jugée propre** à chaque instant par
`frameFault` (`cine.ts`). Au premier défaut prévu, coupe franche sur la prise suivante, cherchée d'avance.

**Avenir exact de la démo** — `demoFuture.ts`. La démo est une boucle fermée (sim pure + bots à graine) :
une **jumelle** (même config, bots neufs aux mêmes graines, même `InputRouter`) tourne jusqu'à 8 s en
avance et donne la trajectoire exacte des oiseaux (vérifié identique au tick près). Le runner l'alimente
(3 lignes) : `demoFuture.prebuild(state, botsJumeaux)` dans `buildDemo` (la démo suivante, préparée au
repos, prend son avance au repos du navigateur), `demoFuture.begin(state)` dans `startDemo`,
`demoFuture.follow(st)` après chaque tick de démo. Écart constaté → `valid = false`, extrapolation.

**Juge** `frameFault(sim, birds, pose, aspect, layout, stormHidden, subject)` → `'' | storm | near | wide |
clutter | ui | bird-ui | close | nosubject | hidden | small`. Tours : boîtes écran par segment (troncs et
disques) ; `near` (< 63 m : > 12 %, ou > 7 % au milieu), `wide` (> 12 % jusqu'au sujet + 15 m, > 18 %
au-delà), `clutter` (fût > 5,5 % coupé par le haut au milieu ; sujet collé à une tour), `ui` (tour derrière
logo/pitch : 3 % de la case au premier plan, 5 % toutes tours ; cases du bas : 25 %). Oiseaux : boîte
(envergure × échelle `auto` du rendu) et cœur ; sujet : cœur jamais sous l'UI, ≤ 10 % de la boîte,
entier, non caché, ≥ 4 % de la largeur ; autre oiseau net en partie caché par une case = défaut ; plus de
45 % de la largeur = `close`. Plans larges (`subject` −1) : au moins un oiseau net (≥ 3 %) entier et dégagé.
Cases de l'UI : `titleUiRects(aspect)` (logo, pitch, pied de page, « Appuie sur une touche », menu — le
menu reste réservé même fermé). Au choix des prises, marge (`_margin` = 1) : cases élargies de 1,2 %,
seuils plus stricts, cœur des oiseaux balayé sur ± 0,07 s de vol.

**Plans.** `track`, `crane`, `group`, `sunset`, `orbit` (crédits), et `sky` = poursuite libre (lacet
autour de l'oiseau, face au soleil d'abord ; tangages −6°, −20°, +40°, +62°). Replis : `sunset` → sky,
track, group ; `track` → sky, sunset, group ; `crane` → track, sky, group ; `group` → track, sky, sunset.
Choix (`adopt`) : parmi les prises qui tiennent 2 s (belles : rang ≤ 2) ou 3 s, la plus belle (`rankOf` :
plan voulu 0, contre-jour 1, suivi 1,5, groupe / grue / contre-plongée 2, plongée 3 — 4,5 après
u = 0,6 —, zénithal 5), sinon la plus longue. Cadreur (`hold`) : le sujet garde 35 % de sa dérive.

**Séquence** `TITLE_SEQUENCE` : track 0 → crane 0,14 → group 0,3 → track 0,44 → group 0,58 → sunset 0,72
→ sunset 0,9 → jusqu'au rebouclage (T + nuit 2 s + pause 2 s). La vue large qui tourne (`orbit`) est
retirée du titre (action sous le pied de page, moitié d'image de sable vide).
**Réalisateur** (`director.ts`, partie titre) : deux `CineShot` (`shot`, `spare`). Le plan suivant se
prépare sur `spare` pendant les 2,4 dernières secondes (`TITLE_PREPARE`), par tranches (64 jugements,
1,6 ms par frame au plus) ; au rebouclage, la première prise de la démo suivante (`demoFuture.upcoming`,
`spare.preSim`) ; pendant le chargement, la prise d'ouverture du titre ; aux crédits, le plan suivant. Une
prise qui finit moins de 1,2 s avant la coupe prévue passe la main au plan suivant plus tôt (`handOverAt`).
Horloge des plans = **temps de la démo** (`dt × gameView.timeScale` : ralenti de la dernière seconde).
Le titre est toujours une coupe franche à l'entrée (plus de fondu depuis les crédits). Le Simoun est masqué
pour toute une prise si elle passe à moins de 120 m de lui (décidé à la coupe). `cameraState.shot` = plan
réellement tourné (repli compris), `cameraState.shotFault` = juge de l'image rendue (4 Hz).

**Outils** : `tools/polish/title2/bench.ts` (banc headless : vraies démos, jumelles, chargement, ralenti ;
images ratées, rythme, coût), `every.mjs` (une capture par seconde, planches), `blank.mjs` (sonde d'images
unies). `npx vitest run src/host/camera/cine.test.ts` : cases de l'UI, juge, jumelle, 20 s de démo filmée
sans image ratée.

## 11. Polish vague 3 (correcteur climax-3 : Grande Ombre, tours, couronne ; détail et mesures : `docs/polish/fix3-climax.md`)

**Tours** (`framingRig.ts`, `towerCover.ts`) — encombrement `obstruction()` = max(part de la **tour seule** la plus
couvrante (`towerCoverStats.maxSingle`), 2/3 × toutes les tours, 0,35 × largeur de la plus large, **2 × premier plan**
(tours plantées à moins de 0,8 × la distance au sol caméra → cible, entières), proximité). Seuils 12 / 11 / 8,5 %
(`COVER_MAX` / `COVER_GOAL` / `COVER_OK`). Parades (`COVER_CANDIDATES`) : relever +5, +8, −5°, **glisser** le cadre
(`COVER_SHIFTS`, est / ouest / nord / sud, 14 → 42 % de la largeur, ramené dans la marge des boîtes des oiseaux cadrés
par `clampRigToSets` : jamais un oiseau cadré hors du rectangle utile), reculer × 1,2 / 1,45 (seul, relevé, glissé),
× 1,8. Choix : cadre visé ET chemin (cadre courant, milieu du trajet) propres ; sinon cadre visé propre au chemin le
moins encombré. Parade **gardée** tant que cadre visé ≤ 12 % et chemin ≤ 16 % (`COVER_PATH`) ; recherche d'une moins
coûteuse toutes les 0,5 s (`coverIdx`). Glissement appliqué à la cible visée (`shiftGoalX/Y`, autour de `fitX/Y`),
lissé par les ressorts de position. Recul décidé : dézoom × 1,6 plus vif (`TOWER_OUT_BOOST`). Recul ≥ × 1,45 à la
Grande Ombre → `gsSqueeze` resserre le choix des bots cadrés (jusqu'à × 0,7) ; à la Grande Ombre, aucun recul
au-delà de 250 m (`GS_PARRY_MAX_W`). Punch-in : seuil 12 % (`PUNCH_COVER`).
`coverTrace` = { base, chosen, pick (indice ; −2 gardée), evals } pour les scripts.

**Chapeaux** (`towerCover.ts`, partagé avec `render/world/towerMaterial.ts`) : `towerHats` (segments larges > 5,3 m et
courts ≤ 6,5 m, comme `isDisc` de la géométrie), `hatCutBase` (bas du chapeau, − 6 m sous les grands disques à lanternes
pendues), `foregroundHats(sim)` (de 96,5 s à la fin de la manche) et `HAT_NEAR` (67 m) : à la Grande Ombre, un chapeau
à moins de 62-72 m de la caméra est effacé par le matériau avec tout ce qui le surmonte ; `towerCover(…, hatNear)`,
`towerClearance(…, hatNear)` et `towerCoverage(…, maxDist, hatNear)` suivent la même règle (la caméra ne recule plus
pour une tour qui ne sera pas peinte).

**Couronne** : plafond `lerp(GS_CROWN_CAP_START 1,7 a, GS_CROWN_CAP 1,5 a)` sur la Grande Ombre, borné à
`GS_CROWN_MAX_W` = 235 m. **Entrée** : `GS_LEAD_IN` = 2 s.

Outils : `tools/polish/climax3/bench.ts` (banc headless 97-110 s : tour seule, premier plan, disques tranchés (modèle
du matériau), couronne, front, images composées ; `--bots=dev` = bots de la page de dev ; `--trace=carte:n:graine:t0:t1`
= décisions de parade toutes les 0,1 s), `debug.ts` (parades autour du cadre sans recul), `segs.ts` (segments des tours).
