# Polish vague 1 — correcteur world (W1-W13)

Périmètre : `src/host/render/**` hors `bird/` et `fx/`, `public/textures/**`. Port 8832. Captures :
`shots/polish/fix-world/`. Outils : `tools/polish/world/` (voir la fin). Aucun fichier hors périmètre
modifié (aucun Edit ciblé n'était prévu pour world), à part les outils : `tools/polish/art/pale-vs-ground.mjs`
(porte demandée par W8) et `docs/art/tools/final.mjs` + nouveau `docs/art/tools/game.mjs` (portes W4, W6, W8).

Méthode : les captures AVANT / APRÈS sont prises avec `tools/polish/world/cap.mjs` (Math.random à graine,
sim figée à une horloge de palette ou à un instant de la Grande Ombre, `--nohud` au besoin) ; comme les autres
correcteurs modifiaient bots et sim en même temps, deux passes ne donnent pas exactement la même partie : les
comparaisons sont qualitatives, les critères sont vérifiés par mesure (sample-oklch, portes, timer queries).
Toutes les pages de test sont lancées avec `node --import ./tools/polish/world/nohmr.mjs …` (sinon le HMR de
Vite rechargeait la page à chaque édition d'un autre correcteur et cassait la mesure en cours).

## Bilan

| Ordre | Statut | Preuve |
|---|---|---|
| W1 plafond de résolution | fait, vérifié | `dprcap.mjs` : 1280 × 720 (Low) et 1920 × 1080 (High sur 3840 × 2160) au titre, au salon, en manche, au podium, à la revanche |
| W2 qualité auto | fait ; vérifié par tests, décisions vérifiées sous contention | 17 tests verts ; `bgtab` et `bgtab --nohide` : même décision ; banc à 8,5 ms |
| W3 budget High 12 oiseaux | partiel | leviers faits, −0,6 à −2 ms en A/B ancien / nouveau build ; p90 ≤ 9,5 ms au calme NON vérifié (GPU saturé par les autres correcteurs) |
| W4 ombres sur la peinture | fait, vérifié | portes `final.mjs` (C ≥ 0,08, aucune olive, ΔE gelés 0,0591) ; Safran à l'ombre `#9D592B` L 0,53 C 0,108 h 52 (avant : `#765B30` h 78) |
| W5 bords d'ombre | fait, vérifié en image | recadrages × 3 sans marche ; coût ≈ +0,3 ms (A/B entrelacé) |
| W6 nuit | fait, vérifié | ΔL 0,13 / 0,20 et C nuit / jour 0,58 / 0,50 (Indigo, Safran) ; illumination des résultats intacte |
| W7 hachures des tours | fait, vérifié en image | titre et podium sans quadrillage ; contre-jour en aplat + filet ; test de géométrie |
| W8 pâle contre sol | fait, vérifié | `pale-vs-ground.mjs` : minimum 0,060 à toutes les keyframes ; swatches au couchant |
| W9 tours en trame | fait, vérifié | oiseau visible à travers la trame (swatches, match) ; rafale de 10 images : trame identique |
| W10 rideau du Simoun | fait, vérifié en image | aplat opaque, festons cernés, trame < 80 m / devant les oiseaux |
| W11 tirets des empreintes | fait, vérifié en image | tirets réguliers le long du bord |
| W12 lavis vivant | fait (plafond à 0,125 au lieu de 0,12) | captures 4 et 12 oiseaux ; high-key ; ΔE §3.4 inchangés |
| W13 crayonné → couleur | fait, vérifié | rafales des manches 1 et 2 ; rien avec « Réduire les flashs » |

## Détail

### W1 · Plafond de résolution (fait, vérifié)
- `WorldCanvas.tsx` : le dpr est calculé à chaque rendu (`presetDpr(QUALITY_PRESETS[level], hauteur CSS du
  conteneur du canvas, devicePixelRatio)`, suivi par `ResizeObserver` + `resize`) et passé en **prop** `dpr` au
  `<Canvas>`. `npr/NprPipeline.tsx` : plus de `setDpr`. R3F peut rappeler `configure()` autant qu'il veut.
- Vérifié : `PORT=8832 node tools/polish/tech/dprcap.mjs --q=low` → `1280x720` au titre, au salon, en manche,
  au podium (arrivée et panneau) et à la revanche ; `--q=high --w=3840 --h=2160` → `1920x1080` partout
  (avant : 3840 × 2160 dès le podium). Test `presetDpr` ajouté à `quality.test.ts`.

### W2 · Qualité auto (fait ; décisions vérifiées sous contention)
- `quality.ts` : banc High seulement si médiane ≤ 8,5 ms (`BENCH_HIGH_MAX_MS`), Medium ≤ 12 ms. Nouveau
  `QualityMonitor` : `pushGpu(ms)` reçoit le temps GPU de chaque image de manche pendant l'heure dorée, le
  couchant et la Grande Ombre ; `shouldDowngrade(level)` (même signature, appelée par runner.ts aux
  résultats) descend d'un cran si le p90 dépasse budget × 1,1 (11 ms en High, 8,8 en Medium), puis remet la
  fenêtre à zéro. Sans timer query : repli sur les intervalles d'image de la même fenêtre, bornés à 100 ms.
  Remise à zéro à chaque changement de preset. Sans banc mémorisé, niveau de départ **Medium** (la chauffe du
  chargement ne se fait plus en High).
- `npr/NprPipeline.tsx` : la requête TIME_ELAPSED existante (`benchTimer`) entoure la frame pendant le banc
  **et** pendant les phases surveillées, lecture asynchrone (`GpuTimer.poll(onSample)`), aucune attente GPU ;
  `GpuTimer.time()` s'efface si une sonde externe a déjà une requête active (plus d'INVALID_OPERATION).
- `quality.test.ts` : 17 tests (GPU : 9 ms garde, p90 11,4 descend, 10,9 garde, le GPU prime sur les
  intervalles saccadés d'une montée de caméra sous contention, Medium > 8,8 → Low, remise à zéro, valeurs
  aberrantes ; repli : onglet caché de 6 s = 100 ms ; banc : 8,2 → High, 9,8 → Medium, 13 → Low).
- Vérifications (le GPU était saturé par les autres correcteurs pendant toute la session : 2 à 3 autres Chrome
  headless, `gpu_busy` 99-100 %) :
  - `bgtab.mjs` et `bgtab.mjs --nohide` : **même décision** dans les deux cas (High → Medium à l'entracte, le p90
    GPU contendu dépassant 11 ms). Avant, la décision dépendait de la seule montée de caméra : moyenne des
    intervalles 49,7 ms (masqué) contre 16,7 ms (témoin). Le moniteur ne regarde plus les intervalles d'image
    quand la timer query existe : l'onglet masqué ne produit simplement pas d'image mesurée.
  - `benchscene.mjs` : scène du banc (titre, High) p50 12,5 ms sous contention → banc « medium ». Au calme, le
    critique tech mesurait 9,8 ms (High choisi à tort) ; le seuil de 8,5 ms laisse maintenant ~1,5 ms de marge
    au climax (manche à 12 oiseaux ≈ +10 % sur la scène du banc).

### W3 · Budget GPU High à 12 oiseaux (partiel)
- Leviers : High passe en **SMAA MEDIUM** et **1 500 cailloux** (`quality.ts`) ; rides du sol dans une branche
  coupée au-delà de 160 m ; territoire non lu hors de l'arène (ρ > 1,06 : dunes et anneau lointain, 30 à
  50 % du cadre) ; rotation OKLCH de W4 dans une branche (pixels à l'ombre seulement) ; le rideau du Simoun
  opaque écrit la profondeur (le sol derrière lui est éliminé par l'early-Z au lieu d'être mélangé).
- Mesures (TIME_ELAPSED autour de la frame, scène figée, 12 oiseaux, High 1080p, `cap.mjs --gpu`) : le GPU
  n'a jamais été calme plus d'une minute (autres correcteurs), donc **A/B entrelacé** entre le build d'avant le
  polish (`dist/`, 09:28) et le code courant (build dans le scratchpad), servis tour à tour sur le port 8832 :

  | Phase | avant p10 / p50 / p90 | après p10 / p50 / p90 | conditions |
  |---|---|---|---|
  | Midi | 10,12 / 11,05 / 13,58 | 9,39 / 9,52 / 9,67 | paire la moins chargée (busy 53-81 % au départ) |
  | Heure dorée (KF21) | 10,58 / 10,72 / 10,89 | 9,98 / 10,18 / 10,40 | idem |
  | Grande Ombre (104 s) | 11,74 / 12,09 / 12,72 | 10,79 / 11,66 / 12,40 | idem |
  | Midi (p50, moyenne de 2) | 14,5 | 13,1 | saturé (99 %), avec le raccourci « sol plat » |
  | Heure dorée (p50) | 15,2 | 13,5 | idem |
  | Grande Ombre (p50) | 16,4 | 14,2 | idem |

  Soit **−0,6 à −0,9 ms** dans la paire la moins chargée, **−12 à −14 %** dans les paires saturées (avec le
  dernier levier). Par passe (code courant, `--passes`, charge moyenne) : midi 9,1 ms [ombres 0,12 · G-buffer
  5,91 · encre 1,59 · SMAA 1,48] ; heure dorée 10,4 [0,24 · 6,88 · 1,61 · 1,71] ; Grande Ombre 12,7 [0,34 ·
  9,03 · 1,77 · 1,60]. Rapporté aux mesures au calme du critique tech (midi 9,7 [10,3], heure dorée 10,6 [11,1],
  Grande Ombre 11,1 [11,4]), le gain relatif donne ≈ 8,5 / 9,2 / 9,7 ms en p50 : **le p90 ≤ 9,5 ms à la
  Grande Ombre n'est probablement pas atteint** et n'a pas pu être mesuré au calme.
- Pourquoi pas plus : le G-buffer passe de ~5,9 ms (midi) à ~9 ms (Grande Ombre) ; les oiseaux et leurs FX
  (hors périmètre) en font ~2 ms à 12. Leviers restants, non pris faute de mesure au calme pour les arbitrer :
  SMAA LOW en High, seuil de la classification B-spline du territoire (0,3 → 0,22 m/px : escaliers de cellules
  en gros plan), fleurs d'aquarelle abandonnées (W12). À re-mesurer avec
  `node tools/polish/tech/perfmatrix.mjs --q=high --n=12 --speed=1` quand le GPU est calme
  (`/sys/class/drm/card1/device/gpu_busy_percent` < 20 %, aucun autre Chrome).

### W4 · Ombres sur la peinture (fait, vérifié)
- `groundMaterial.ts` (`shadowPaintAB` / `coolAB`) : sur la peinture, l'ombre garde le ratio de L de
  l'ombre au sol, prend **C × 0,85** et une teinte tournée vers **290°** (violet des ombres) par le chemin court,
  de 0,22 × l'écart côté rouge (Safran 89° → 54°, Corail 40° → 16°) et 0,15 × l'écart côté vert (Anis 133°
  → 157°), au plus 40°. Le sable nu garde 100 % vers `castShadow`. L'ombre teintée des empreintes et des âmes
  d'oiseaux suit la même règle sur la peinture (le mélange vers `tintAB` ne vaut plus que sur le sable).
- Pourquoi pas 25-40° pour tout le monde : une rotation uniforme écrase les teintes proches du violet
  (Indigo, Lilas, Prune, Azur) ; mesuré, ΔE entre joueurs gelés 0,052 à k = 0,4. Avec la rotation
  proportionnelle, Safran (le cas olive) tourne de 35°, Corail de 24°, Carmin de 18°, et ΔE gelés ≥ 0,059.
- Portes ajoutées à `docs/art/tools/final.mjs` (formules en jeu dans `docs/art/tools/game.mjs`) :
  `gameShadowChroma` (C formule ≥ 0,08 : min 0,082 ; affichée min 0,074 pour Jade / Sarcelle à L 0,40, limite
  du gamut sRGB), `gameNoOliveShadow` (aucune ombre sur peinture, forte ou pâle, avec 60° < h < 110° et
  L < 0,55 ; 5 avant), `gameFrozenPair` (ΔE entre joueurs gelés 0,0591 ≥ 0,059). Sortie : toutes les portes vertes.
- En jeu (`shots/polish/fix-world/after1-4/pe7.png`, couchant, `sample-oklch`) : ombre de tour sur Safran
  `#9D592B` L 0,534 C 0,108 h 52 (avant `#765B30` L 0,49 C 0,069 h 78) ; recadrage
  `after1-4/crop-pe7-shadows.jpg`, `after3-4/pe7-s.jpg` : terre de Sienne sur Safran, lie-de-vin sur Corail,
  indigo profond sur Indigo, plus de boue olive.
- Amendement de la bible §4.5 / §5.1 noté dans `docs/agent-notes/world.md`.

### W5 · Bords d'ombre nets (fait, vérifié en image ; coût ≈ +0,3 ms)
- Chunk `shadow` : `sampleShadowAuto(wp, bias, dp0)` choisit la B-spline 3×3 dès qu'un texel de la cascade
  couvre plus d'un pixel (`dp0 · res < 2 · demi-taille`, dp0 = |fwidth(p0)| calculé hors branche), 4 taps
  sinon — pour les trois cascades, au lieu du seul `vDist < 170 m`.
- `world/frame.ts` : en manche, cascade focus sur `cameraState.frame` + 20 m (lecture seule de
  `camera/cue.ts`), si ce cadre est plus serré que 0,7 × la cascade proche (4 oiseaux : ~2× plus fin ;
  12 oiseaux : inutile, coupée).
- Vérifié : recadrages × 3 au couchant (`after3-4/crop-pe7-edge2.jpg`, `crop-pe7-edge3.jpg`) : bandes d'ombre
  de tours et disques sans escalier, bords d'empreintes lisses (avant : `before-4/crop-pe7-edge.jpg`, marches
  de 2 à 4 px à 1:1 sur les bouts de bandes).
- Coût (`cap.mjs --ab`, 4 oiseaux, heure dorée et couchant, configurations entrelacées dans la même page, 2
  répétitions, GPU chargé) : cascade focus + lissage contre ni l'un ni l'autre : +0,37 ms en p50 (focus ≈ +0,18,
  lissage ≈ +0,2), soit ≈ +0,3 ms une fois retirée la contention. « Ni l'un ni l'autre » est déjà moins cher que
  l'ancien code (qui lissait tout pixel à moins de 170 m). Leviers de mesure : `worldView.roundFocus`,
  `worldView.shadowSmooth` (vrais en jeu).

### W6 · Nuit : ce qui est figé se voit (fait, vérifié)
- `groundMaterial.ts`, côté nuit pendant la Grande Ombre : lavis KF-4 puis **L − 0,10**, **C × 0,52** et même
  rotation OKLCH que W4 (sans rotation, Safran assombri devenait kaki `#735C32`), granulation « sec » doublée ;
  l'assombrissement monte en 0,3 s après le passage de la lèvre (âge = distance au front / vitesse du front,
  `uNightSpeed` = `frontSpeed` de la sim) pendant qu'un **liseré papier** s'éteint sur les bords des lavis ;
  **bande de lumière rasante** de 6 à 12 m devant le front (L + 0,06, 35 % vers `sandLit` KF1) ; **lèvre de
  4 px**. L'illumination des résultats (§4.7) annule l'assombrissement là où la vague est passée : inchangée.
- Écarts à l'ordre, mesurés : L − 0,10 au lieu de − 0,12 (à − 0,12 la médiane high-key de la Grande Ombre
  tombait à 0,495) ; C × 0,52 au lieu de 0,6 (la chroma AFFICHÉE du Safran de jour est bornée par le gamut :
  à 0,6 le rapport mesuré nuit / jour était 0,66). ΔE entre joueurs côté nuit (KF-4, forts) : 0,052 ≥ 0,05
  (porte `gameNightPair` de `final.mjs`).
- Vérifié (`sample-oklch` sur `after5-4/104.png`, 4 oiseaux, valeurs finales, même joueur de part et d'autre du
  front) : **Indigo** jour L 0,52-0,58 C 0,117-0,134 (médiane 0,123) / nuit L 0,33-0,38 C 0,068-0,074 (médiane
  0,071) → ΔL ≈ 0,19, C nuit / jour 0,58 ; **Safran** jour L 0,665 C 0,134 / nuit L 0,54-0,56 C 0,070-0,074 →
  ΔL 0,11-0,12, rapport 0,52-0,55. Captures : `after5-4/100`, `104`, `108` (4 oiseaux, sans HUD),
  `after4-12/100…108` (12 oiseaux) : la vague qui fige se lit d'ouest en est, la dernière bande de jour est la plus
  vive de l'image. Résultats : `after3-4/results-0.png`, `results-1.png` (carte rallumée par l'illumination).
- Amendement de la bible §4.6 noté dans `docs/agent-notes/world.md`.

### W7 · Tours : des hachures d'encre (fait, vérifié en image)
- `towerGeometry.ts` : anneaux de sommets 2 et 6 m sous chaque surplomb large (`Seg.inner`) : la cavité n'est
  plus interpolée sur des fûts de 20 m (test ajouté dans `world.test.ts`).
- `towerMaterial.ts` : méridiens dont l'épaisseur suit un ton (principe de `hatchTone`) vivant seulement dans
  une bande le long de la silhouette (N·V) et du terminateur ; couche croisée seulement si cavité < 0,25 ;
  pas 8,5 px et opacité × 0,6 au-delà de ~150 px de large ; à contre-jour (caméra face au soleil) aplat ombré
  sans hachures et filet `sandLit` de ~1,5 px juste à l'intérieur du trait de silhouette, du côté où le soleil
  déborde (les deux bords s'il est pile derrière), tant que le disque est au-dessus de l'horizon. La distance
  à la silhouette est calculée sur le solide de révolution (rayon de profil, angle rayon / visée) : N·V
  interpolé sur un 48-gone ne descend jamais sous ~0,1 et le filet tombait sous le trait d'encre (diagnostic
  en couleurs de debug sur un build à part : `podium-dbg*/`).
- Vérifié : titre (`sheet-title-after3.jpg`, `title-after3/002`, `020`) : fûts nets, plus de papier
  millimétré ; tour à contre-jour en aplat (`crop-title020-rim.jpg`) ; podium : colonnes en aplat mauve sans
  hachures, filet corail sur les deux bords (`podium10/crop-podium-col.jpg` ; avant : `after1-4/results-3`).

### W8 · Pâle lisible contre le sol (fait, vérifié)
- `washLab` : garde pâle / sol — si ΔE(pâle, sol LOCAL) < 0,06, la luminosité du pâle s'écarte du sol du côté
  du fort (jusqu'à 0,05), puis sa chroma monte (jusqu'à 0,85 × celle du fort). Le fort ne bouge pas.
- `tools/polish/art/pale-vs-ground.mjs` réécrit : garde les valeurs de la bible pour mémoire et calcule le
  lavis EN JEU pour les 12 couleurs à toutes les keyframes, porte ≥ 0,05 (code 1 sinon) ; porte
  `gamePaleVsGround` dans `final.mjs`. Résultat : **minimum 0,060** partout (avant 0,032 Corail KF10,
  0,038 Prune KF3). Pâle / fort d'un même joueur : 0,024 (valeur de la bible inchangée).
- Swatches (`tools/polish/world/swatches.mjs`, copie de celle de firsttime, images dans
  `shots/polish/fix-world/swatches/`) : au couchant, bandes pâles de Corail, Carmin et Rose nettement visibles.

### W9 · Tours proches en trame (fait, vérifié)
- `world/birdScreen.ts` projette les oiseaux (gameView interpolé + caméra, sans allocation) dans
  `NPR.uBirdScr` ; `towerMaterial.ts` efface en trame IGN (seuil 0,72) les fragments au-dessus de 20 m à moins
  de 60 m de la caméra ou devant un oiseau (disque de dégagement = demi-envergure × 1,6 × 1,15) ; coupé au
  podium. Les pixels gardés écrivent l'ID `screenDoor` (254) que l'encre ignore (sinon points noirs).
- Vérifié : `swatches/swatch-couchant.jpg` (Lagon lisible à travers un disque), `after2-4/crop-pe7-tower.jpg`
  (oiseau derrière un fût), titre `title-after3/020` ; rafale de 10 images (`burst/close-*.png`) : la zone
  en trame est identique d'une image à l'autre (seuls le fanion et une traînée bougent : `burst/diff-0-2.jpg`).

### W10 · Rideau du Simoun (fait, vérifié en image)
- `StormCurtain.tsx` : aplat opaque (plus de `transparent`, écrit profondeur, normale et ID `storm` : l'encre le
  cerne), festons découpés net ; dissolution en trame à moins de 80 m de la caméra (jusqu'à 90 % des pixels)
  ou devant un oiseau.
- Vérifié : `after3-4/108.png`, `after3-4/100.png`, `after4-12/108.png` (Grande Ombre côté est : plus de voile
  brun-rose sur le tiers du cadre, un mur de sable festonné), titre (`sheet-title-after3.jpg`).

### W11 · Tirets des empreintes pâles (fait, vérifié en image)
- `footprintDash` : tirets de 1,8 m (50 %) paramétrés par la longueur d'arc de l'ellipse de gameplay
  (quadrature à 6 points, nombre entier de tirets), évalués sur les seuls pixels du liseré ; ellipses dans
  `NPR.uFpEllipse` (écrites par `BirdFootprints`).
- Vérifié : `after3-4/crop-pe7-fp.jpg` (couchant) : tirets réguliers le long du bord, plus de blocs en damier.

### W12 · Lavis vivant à mi-distance (fait, avec un écart)
- Lavis inégal ajouté : ± 3,5 % de L sur ~30 m (canal B du bruit à 1/240) en plus du grain de ~10 m ; liseré
  d'au moins 3 px et d'au moins 0,8 m au sol (≤ 12 px), accumulation de pigment à l'échelle du liseré ;
  chroma des forts plafonnée à **0,125** de KF25 à KF10 (`PAINT_C_GOLDEN_MAX`). Écart : 0,125 et non 0,12 —
  à 0,12 Corail / Carmin gelés tombaient à ΔE 0,058 (< 0,059) et le lavis contre le sol à 0,067. Fleurs
  d'aquarelle non faites (budget W3).
- Vérifié : `after3-4/pe21-s.jpg`, `after4-12/pe16-s.jpg` (4 et 12 oiseaux) ; `final.mjs` : fort / fort 0,089
  (bible 0,089-0,094), portes vertes ; high-key ci-dessous.

### W13 · Du crayonné à la couleur (fait, vérifié)
- `world/countdownSketch.ts` + `InkEffect` : pendant le compte à rebours d'une manche, crayonné tenu (0,62 du
  flash « planche ») ; à « Envol ! », la couleur coule d'ouest en est en 0,8 s réelles (front en x monde,
  ciel compris). Désactivé par « Réduire les flashs ». Hors compte à rebours `uSketch = 0` : branche sautée.
- Vérifié : `tools/polish/world/countdown.mjs` → `sheet-countdown-r1.jpg`, `sheet-countdown-r2.jpg` (t − 2 s,
  + 0,2, + 0,5, + 1 s réelles) ; `--reduce` → `sheet-countdown-reduce.jpg` : aucun crayonné.

## High-key (docs/art/tools/highkey.mjs, page de lookdev, `tools/world-shots.mjs --set=keys`)

Mesuré sur les captures de la page de lookdev (`shots/polish/fix-world/set/`, `set2/`), avant → après :

| Keyframe | L > 0,6 | médiane | seuil |
|---|---|---|---|
| KF80 | 99,0 → 98,9 % | 0,892 → 0,894 | jour : ≥ 60 % et ≥ 0,70 |
| KF50 | 98,5 → 98,2 % | 0,842 → 0,831 | idem |
| KF25 | 92,1 → 91,7 % | 0,789 → 0,778 | idem |
| KF16 | 89,4 → 89,1 % | 0,767 → 0,758 | idem |
| KF10 | 87,7 → 85,8 % | 0,714 → 0,706 | idem |
| KF3 | 45,9 → 44,6 % | 0,591 → 0,584 | couchant : ≥ 0,50 |
| KF1 | — | 0,479 → 0,469 | déjà sous le seuil (exception acceptée : image du gel) |
| Grande Ombre (front à mi-arène) | 32,8 → 29,5 % | 0,529 → **0,497** | couchant : ≥ 0,50 |
| Résultats | — | 0,571 → 0,569 | |

L < 0,3 : ≤ 0,57 % partout (< 3 %). Tout passe sauf la Grande Ombre, à 0,003 sous le seuil : c'est l'effet
voulu de W6 (côté nuit assombri, arbitrage du lead), comme KF1 avant lui ; L − 0,10 au lieu de − 0,12 limite
l'écart (− 0,12 donnait 0,495). À trancher par le lead si le seuil doit rester strict pendant la Grande Ombre.

## Vérifications communes
- `npx tsc --noEmit -p tsconfig.json` filtré sur `src/host/render/` hors `bird/`, `fx/` : aucune erreur.
- `npx vitest run src/host/render/quality.test.ts src/host/render/world` : 24 tests verts (17 qualité, 7 monde
  dont le nouveau test des anneaux de cavité).
- `pnpm check:boundaries` : frontières OK.
- `PORT=8832 node tools/e2e/solo.mjs` (3 manches, fin de partie, revanche) : aucune erreur console.
- `docs/art/tools/final.mjs` (copie avec culori) : toutes les portes vertes, dont les 6 nouvelles `game*`.
- `node tools/polish/art/pale-vs-ground.mjs` : porte OK (minimum 0,060).
- Presets Low / Medium / High compilés et regardés (`sheet-presets.jpg`).

Dernière passe de contrôle après tous les changements : `shots/polish/fix-world/final-4/pe16.png` (heure dorée)
et `final-4/104.png` (Grande Ombre), regardées.

## Outils (tools/polish/world/)
- `cap.mjs` : captures d'une manche figée à des horloges de palette (`pe21`) ou à des instants de la Grande
  Ombre (`104`, en secondes d'une manche normale), Math.random à graine, `--nohud`, `--gpu`, `--ab` (A/B W5).
- `title.mjs` (cinématique du titre, rafales), `countdown.mjs` (W13), `swatches.mjs` (copie de firsttime),
  `profile.mjs` (coût GPU par famille d'objets de la page de lookdev), `nohmr.mjs` (préchargement : pages de
  test sans HMR de Vite).

