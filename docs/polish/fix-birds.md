# Polish vague 1 : correcteur birds (B1-B7)

Périmètre : `src/host/render/bird/**`, `src/host/render/fx/**`. Edit ciblé hors périmètre : `src/sim/rules.ts`, ajout de la seule constante `birdRenderScaleMaxCrowded: 1.6` (B1).
Captures dans `shots/polish/fix-birds/`. Outils : `tools/polish/fix-birds/game.mjs` (partie réelle figée à des instants choisis, recadrages ×3, `--reads`, `--png`), `dodge.mjs` (esquives), `zoomgrid.mjs` (zoom ×8 avec grille avant `sample-oklch`). Le HMR de Vite est coupé dans ces pages, car les autres correcteurs modifient le code en même temps.
API et comportements : `docs/agent-notes/birds.md` §6.

Contrôles finaux : `npx vitest run src/host/render/bird src/host/render/fx` passe (17 tests), `tsc` ne signale rien sur mes chemins (la seule erreur, `tools/polish/feel/bot-pressure.ts`, n'est pas à moi), `pnpm check:boundaries` passe, et `PORT=8833 node tools/e2e/solo.mjs` joue une partie complète plus la revanche sans erreur console.

## B1 · À 9-12 oiseaux, on voit la couleur de chacun (fait, avec une réserve)

- `controller.ts` : au-delà de 8 oiseaux, le plafond passe à `RULES.birdRenderScaleMaxCrowded` (×1,6).
- LOD lointain, calé sur l'envergure affichée (traitement complet sous 68 px, fondu jusqu'à 98 px) :
  - bande d'aile à 38 % de la demi-aile (`BAND_FAR`) au lieu de 14 % ;
  - cape et selle ×1,6 (déformation en espace de liaison, identique pour le corps et la coque) ;
  - coque de 1,2 à 0,5 px ;
  - sous 78 px (hystérésis 78/86), pièces colorées sans ID propre : le double trait d'encre des bords de bande mangeait 2 px sur 3.
- Couleur d'identité protégée dans toutes les lumières : chroma au moins égal à 80 % de celui du joueur, luminance ramenée vers celle de l'albédo. Sans cela, au couchant, toutes les bandes viraient au pastel orangé (constaté sur `after2-12/crops-004`).
- Vérifié :
  - Relevé au format `read-stats` (`game.mjs --reads`, 12 oiseaux, `node tools/polish/feel/read-stats.mjs shots/polish/fix-birds/twelve-reads/reads.json`). Médiane d'envergure par phase : compte à rebours 70, midi 60, après-midi 59, heure dorée 59, couchant 59, Grande Ombre 62 px. Avant : 71 / 51 / 51 / 60 / 49 / 61 px. Le p10 passe de 43-48 à 52-56 px.
  - Recadrages ×3 (`after2-12/crops-002-r1-u0.15.jpg`, `after4-12/crops-003-r1-u0.8.jpg` au couchant) : bande de 8 à 12 px réels, soit 24 à 36 px sur le recadrage. Les couleurs se distinguent (corail, lagon, indigo, safran, azur, carmin, prune, anis, sarcelle, rose, lilas, jade). Avant : `before-12/crops-002-r1-t15.jpg`, des croix noir et blanc.
- Réserve : la médiane frôle 60 px sans l'atteindre à trois phases (59 px), parce que le plafond ×1,6 est le compromis tranché par le lead. Le cadrage « arène centrée, marge basse réduite » de staging (S1) doit apporter les pixels manquants. Je n'ai pas relevé le plafond.
- Mesure `feel/match.mjs --name=twelve` : pas faite par ce script. Il ne coupe pas le HMR et la page s'est rechargée en pleine manche (run bloqué, tué). Le relevé ci-dessus reprend la même sonde (`installReadProbe`) et le même `read-stats.mjs`.
- Coût GPU (A/B, page `dev/birds.html?view=game&n=12&debug=1`, timer queries, GPU partagé à 99-100 %) : passe G-buffer médiane 6,58 ms sans les ajouts, 6,62 à 6,86 ms avec. Environ +0,03 à +0,3 ms, dans le bruit de la contention.

## B2 · Traînées fantômes au début de chaque manche (fait)

- `FxSystem.update` : si `view.sim` change (salon → manche, manche → manche, titre, podium), il vide traînées, filets, traînée du clac, historiques, particules et effets en cours. `updateBird` fait de même pour un oiseau qui se déplace de plus de 20 m en une frame (`TELEPORT_M`).
- Cause confirmée : avec `timeScale = 0` (compte à rebours), le temps des FX ne s'écoule plus, les filets ne vieillissent pas, et le segment entre l'ancienne et la nouvelle position restait affiché.
- Vérifié :
  - Deux tests dans `system.test.ts` : nouvelle sim figée, et saut de plus de 20 m. Sans le correctif, ils échouent avec des segments de 125 m et de 72 m.
  - Captures sans aucune ligne droite : `after-4p/001-r1-countdown.png`, `007-r2-countdown.png`, `013-r2-results-2.png` (compte à rebours de la manche 3), `006-r1-results-1.png` (résultats), ainsi que `after2-12/001-r1-countdown.jpg` à 12 oiseaux.

## B3 · Podium : oiseaux lisibles, couronne sur la tête, gloire contenue (partiel)

- Pose `perch` (`animator.ts`) en cormoran : corps à 42°, ailes ouvertes à l'horizontale, surface tournée vers la caméra (bande lisible), mains tombantes qui respirent, cou avancé, tête de profil (côté stable par oiseau).
- `material.ts` :
  - 25 % de remplissage de la face à l'ombre ;
  - liseré de contre-jour porté par la coque : 4 px côté soleil, soit environ 2,5 px visibles sous le trait du post-traitement, couleur crème-corail (`sandLit` KF1 éclairci).
- Couronne non éclairée, posée juste au-dessus de la tête. Le cavalier est caché derrière le cou dressé, d'où la tête plutôt que « 1 m au-dessus de la capuche ».
- Gloire : 24 rayons à 35 % dans un disque de 250 px.
- Vérifié (`tools/e2e/qa/podium12.mjs --n=12` et `--n=4`, copies dans `shots/polish/fix-birds/podium12|podium4/`, zooms `z.jpg`) :
  - bandes lisibles sur les trois oiseaux, à 4 et à 12 ;
  - gloire contenue derrière le vainqueur, sans rayure plein écran ;
  - liseré visible (`after-4p/podium4-zoom.jpg`) ;
  - à 12, couronne visible sous le bandeau.
- Non atteint à 4 : la caméra du podium (S5, en cours chez staging) place maintenant la tête du vainqueur contre le bandeau, ce qui cache la couronne. J'ai abaissé la tête (cou avancé), mais la mise en scène remonte l'oiseau jusqu'au bandeau. J'exporte `PERCH_CROWN_TOP_M` (1,1 m au-dessus de l'ancre `head`, dans `anchors.ts`) : S5 doit garder cette hauteur libre, environ 35 px à 4 joueurs.

## B4 · Couronne en jeu : portée, dorée, lisible (fait)

- `anchors.ts` : `crownLift = 2,5 + 1,0 × piqué`, jamais multiplié par l'échelle cosmétique au-delà de 1.
- `crown.ts` : couronne plate extrudée, trois pointes plus larges que hautes, perles aux pointes, aplat `#FFF2C3` non éclairé (légère brume seulement), coque de 1,5 px, au moins 16 px à l'écran.
- Gros plan (envergure > 200 px) : 0,55 m × échelle, posée sur la capuche.
- La position affichée est publiée dans `birdAnchors.crown`. L'anneau « couronne gagnée » (60 → 14 px) et la pile d'icônes s'y calent. L'anneau était invisible avant le correctif `inkBoost` (voir B7).
- Vérifié :
  - `after-4p/crops-crown.jpg` : midi, heure dorée et deux couchants ; couronne or pâle, jamais grise, 12 à 20 px au-dessus du cavalier (sous le seuil de 40 px) ;
  - titre sur 3 graines (`title-1..3`, planches `sheet-title-*.jpg`) : couronne sur la capuche en gros plan (`dev/crownClose.jpg`), jamais coupée par le cadre.

## B5 · Au couchant, pas de corbeaux gris (fait)

- Mélange « caché » de 55 % ramené à 35 % quand `paletteElev` < 10 ; pièces colorées à au moins 80 % de leur chroma.
- Liseré de lumière rasante (`uLipColor`, sandLit KF1) côté soleil, sur la coque élargie à 3 px, soit environ 1,5 px visible. Jamais dans la nuit (test par sommet sur `nightDist`).
- Vérifié (`sample-oklch`, 9×9 px) :
  - oiseau caché de la page de lookdev au couchant (`dev/states1-sunset.jpg`), bande lilas, la couleur de joueur la moins saturée : C = 0,086 ;
  - oiseau caché en jeu (`after-4p/015-r3-u0.5.png`, heure dorée, mélange 55 %) : bande corail C = 0,090, aile C = 0,011, ce qui se lit « à l'ombre » ;
  - Grande Ombre à 12 oiseaux (`after4-12/hid-both.jpg`) : bandes corail et safran reconnaissables sur des oiseaux gris.
- Limite : à 12 oiseaux, la bande d'un oiseau caché ne fait que 3 à 4 px de corde. Le carré 9×9 de `sample-oklch` y mélange le sol, et la mesure sur un seul pixel en JPEG donne C ≈ 0,06 (sous-échantillonnage de la chrominance).

## B6 · Des effets qui tiennent le gros plan (fait)

- Bouffées plafonnées à 60 px de diamètre à l'écran (même calcul de profondeur que le vertex shader) et rétrécies sous 25 m de la caméra.
- Ruban : largeur `min(0,35 m, 6 px)`, effilement fort sur ses 30 % finaux, aminci jusqu'à disparaître sous 30 m.
- Lignes de vitesse et traînée du clac bornées à 25 % de la largeur d'écran.
- Icônes d'état masquées en démo (`config.mode === 'demo'`) et au-delà de 200 px d'envergure (fondu). Les ressorts continuent de tourner, pour ne pas rester figés sur un état périmé.
- Vérifié :
  - tests `system.test.ts` avec une caméra à 12, 20, 35 et 60 m : chaque bouffée à l'écran mesure 60 px ou moins, chaque point de ruban 6 px ou moins. Ils échouent si l'on retire les plafonds ;
  - test « aucune icône en démo » ;
  - `art/title.mjs` sur 3 graines (`title-1/2/3`, planches regardées) : aucune icône d'état, bouffées modestes, rubans fins.

## B7 · L'esquive se voit (fait)

- Sur `diveMiss` avec `dodged` :
  - double arc de souffle (`SHAPE.arc`, 0,4 s) autour de l'esquiveur, ouvert vers le point du raté, 26 à 90 px de rayon, trait de 5,5 → 3 px ;
  - 4 à 6 plumes arrachées au chasseur, lancées vers le haut (12 px au moins) ;
  - 3 étoiles épaisses à halo papier au-dessus du chasseur planté, pendant son décrochage (sans test de profondeur).
- Correctif de shader trouvé en route (`batches.ts`) : `inkBoost` amincissait les traits au lieu de les épaissir (signe inversé). Les étoiles du décroché se réduisaient à des points, et l'anneau « couronne gagnée » était invisible.
- Vérifié :
  - test d'esquive : 1 arc, 6 sprites d'étoiles (halo + encre), au moins 4 plumes, tailles ≥ 6,5 px ;
  - captures à +150 ms et +450 ms (`dodge12/sheet-dodge12-z.jpg`, envergures de 65 à 70 px) : arc, étoiles et plumes visibles ;
  - à 4 oiseaux (`dodge4/sheet-dodge4-z.jpg`) : arc et étoiles visibles.
- Le ralenti (G4) et le son (A7) relèvent d'autres correcteurs.
