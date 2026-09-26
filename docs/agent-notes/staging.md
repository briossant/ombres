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

**Retour vers le runner** : `cameraState` (`mode`, `modeTime`, `shot`, `rise` 0..1, `mapReady`, `podiumReady`, `frame` = cadre visible au sol) et l'émetteur `cameraBeats` :
`riseStart` (fin de la pause de nuit) · `illuminate` (vague d'illumination lancée) · `mapReady` (carte cadrée : **moment conseillé pour `setScreenState('roundResults')`**, ≈ 4 s après `night`) · `podiumReady` (2,2 s après l'entrée) · `cut`.

## 2. Ce que fait chaque mode (détails)

**Manche** (`framingRig.ts`, `framing.ts`) — GDD §13.1 à la lettre, avec trois ajouts justifiés :
- Points cadrés : centres d'ombre (poids 1, **ramenés dans l'arène** à ρ ≤ 1,04 : au couchant une ombre peut tomber 100 m au-delà du bord, où elle ne peint pas) et oiseaux tirés vers leur ombre (poids 0,7), **plus leur position dans 0,7 s** (anticipation : un ressort critique à ω 1,8 traîne de 2v/ω ≈ 23 m ; sans elle, un oiseau qui fonce vers le bord sortait du cadre). Marges 12 % / 15 %, largeur 110 m → 1,1 × l'arène ; si les oiseaux débordent le dézoom maximal, on cadre l'ellipse entière de l'arène.
- **Résolution exacte en perspective** (`fitPoints`) : chaque bord du rectangle d'écran est un plan passant par la caméra ; position au plus près sous ces 4 contraintes (testé : `framing.test.ts`, 49 cas).
- Ressorts critiques (exacts, stables) : position ω 1,8, zoom ω 1,2 (**dézoom ω 1,2 × 1,6** : on ne perd jamais un oiseau), zone morte 4 m (cible et largeur). Lacet fixe (nord en haut), tangage 58° → 42° linéaire sur la manche. Pas de ciel en jeu (haut du cadre ≥ 22° sous l'horizon).
- Compte à rebours : le cadre reste celui de l'anneau de départ (les oiseaux bouclent sur place) ; **travelling d'ouverture** : recul de 32 % et +10° de plongée qui se referment en douceur à « Envol ».
- Piqué engagé (`diveCommit`, chasseur et cible dans le champ) : zoom de `camDiveZoom` (8 %) vers la paire, montée 0,36 s, tenu pendant le ralenti après une touche, relâché en 0,9 s.
- Touche (`diveHit` dans le champ, réglage tremblement actif) : tremblement de 0,42 s, amplitude `camShakeAmp` par tranche de 26 m cadrés (≈ 11 px en 1080p quel que soit le zoom ; 0,15 m brut ferait moins d'un pixel à 300 m).
- Grande Ombre : le front de nuit (à la hauteur de chaque oiseau) est cadré, la cible glisse de 6 % vers l'est sans pousser le cadre au-delà du bord est de l'arène.

**Résultats de manche** (`director.ts`) : pause de nuit de 1,5 s (le gel ; le cadrage suit encore les oiseaux qui planent), puis montée de 2,5 s (interpolation du rig : cible, tangage 42° → 90°, distance en log ; lissage à dérivées nulles) jusqu'à la vue verticale nord en haut, l'arène dans x 0,035 → bord du panneau − 2 % (0,515 en 16:9 ; `resultsMapRect(aspect)` suit le zoom de l'UI, vérifié en 4:3) × y 0,085-0,915, puis poussée imperceptible (3,5 % sur 14 s).

**Podium** (`podium.ts`, `PodiumStage.tsx`) : scène synthétique clonée de la dernière manche (territoire peint gardé au sol, tours de la carte retirées) ; trois tours « colonne » à plateau plat placées **par lancer de rayon** pour que le point de perche tombe 26 px (1080p) au-dessus de chaque plaque (`PODIUM_X` = 0,30 / 0,50 / 0,70, haut des plaques 37 % + 40/0/70 px) ; oiseaux en mode `'perch'`, couronne sur le vainqueur, les autres tournent au loin à l'ouest. Caméra à 5,5 m, 46 m des tours, regard relevé de 6° (horizon au tiers bas). Ciel : `sunOverride` 12° plein ouest (disque derrière le vainqueur), palette KF1,6, pas de nuit (`nightAll` 0), Simoun masqué. Entrée : montée de 2 m en 2,2 s puis respiration de ±0,12 m.

**Titre** (`cine.ts`) : plans calés sur le soleil de la démo (u = t/T), coupes franches, reprise au rebouclage :
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

Aucune.
