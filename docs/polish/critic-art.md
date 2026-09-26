# Ombres — revue de direction artistique (phase de polish)

Relecteur : directeur artistique (Moebius, NPR). Référence : `docs/ART_BIBLE.md` (§0 les 15 règles, §1.2 planches mentales, §4-6, §8).
Rien n'a été corrigé : ce document liste des problèmes vérifiés en images, avec une cause probable et une correction concrète.

## Méthode

- Serveur de dev sur le port 8821, Chrome headless accéléré, 1920 × 1080 ; téléphones iPhone 15 Pro et Pixel 7 en paysage (et un iPhone en portrait).
- Scripts (réutilisables, `PORT=8821 node …`) dans `tools/polish/art/` :
  - `title.mjs` : chargement, puis titre avec une image toutes les 1,6 s pendant 70 s (une boucle et demie de cinématique) ;
  - `match.mjs` : partie complète à vitesse réelle (2 téléphones pilotés, 1 joueur clavier, bot par défaut), salon avec URL longue, cartes des règles, 3 manches, nuit, résultats, podium, téléphones à chaque phase ;
  - `twelve.mjs` : 12 oiseaux, une manche, mode daltonien à mi-manche ;
  - `screens.mjs` : menu, réglages, crédits, Échap au salon, téléphone en portrait ;
  - `phones.mjs` : galerie des états du téléphone (page de dev) avec mesure de la boîte du bouton PIQUER ;
  - `pale-vs-ground.mjs`, `sample-oklch.mjs` : mesures OKLab.
- Captures : `shots/polish/art/{title,match,twelve,screens,phones}/`. Planches contact : `shots/polish/art/sheet-*.jpg`. Recadrages de preuve : `shots/polish/art/crop-*.jpg`.
- Test high-key (`docs/art/tools/highkey.mjs`) : il passe partout (midi médiane 0,892 ; couchant 0,68 ; Grande Ombre 0,575 ; podium 0,726 mais 2,4 % de pixels sous L 0,3, près du plafond de 3 %). Les défauts relevés ci-dessous tiennent au dessin, pas à la valeur générale de l'image.
- Le GPU était à 100 % d'occupation pendant toute la revue (19 Chrome d'autres agents) : aucune mesure de performance n'a été refaite.

## Verdict d'ensemble

**Ce qui marche.** À midi, le jeu est déjà une planche de Moebius. Sable crème, lavis pastel à liseré de pigment, ombres de tours en disques lavande, parasols à panneaux d'ombrelle : `match/025-r1-noon-t6.jpg` pourrait servir de capture de magasin. L'UI « cases de BD » est cohérente et soignée (salon, pause, réglages, résultats, téléphone). Le mode daltonien est très réussi (`crop-cb.jpg`), et le plan de couchant du titre (`title/026`) fonctionne.

**Ce qui fait amateur**, par ordre d'impact :

1. **Les heures qui devraient être le spectacle se salissent.** Au couchant, les ombres posées sur la peinture virent à l'olive, au kaki et au marron (mesuré sur Safran : L 0,49, C 0,07, teinte 78°). Leurs bords montrent l'escalier des texels dès que la caméra resserre, et le liseré des empreintes pâles fait des damiers.
2. **La caméra se laisse manger par les tours**, en jeu comme au titre : un fût ou un disque occupe 25 à 40 % du cadre dans environ un tiers des images de couchant et de titre.
3. **Les effets et accessoires pensés pour la vue de jeu cassent en gros plan** : bouffées de sable en « biscuits » de 200 px, ruban de traînée en bâton bleu rigide, couronne détachée qui ressemble à un bateau en papier, rideau du Simoun en voile flou.
4. **Le podium**, dernière image de la partie, est le plan le plus faible : oiseaux gris en « artichaut » à contre-jour, plaques posées devant les corps, couronne invisible, image figée.
5. **À 12 oiseaux**, on ne retrouve pas le sien : 30 à 45 px d'envergure, et une bande de couleur de 2 à 3 px.

Rien de tout cela n'est structurel : la plupart des corrections tiennent dans quelques lignes de shader ou de règles de cadrage.

## Problèmes (triés par sévérité)

Sévérité : 5 bloquant, 4 majeur, 3 notable, 2 mineur, 1 détail. Périmètre : staging, world, birds, hostui, phone, game, other.

### DA-01 · 4 · world — Escaliers de texels sur les ombres dès que la caméra resserre
- **Constat** : à l'heure dorée et au couchant, les bords des ombres de tours et les silhouettes d'oiseaux au sol sont en marches de 8 à 14 px. Or le bord net d'une ombre de 270 m est précisément le spectacle (§5.4).
- **Preuve** : `match/124-r2-golden-t68.jpg`, `crop-124-shadowsteps.jpg`, `crop-124-footprint.jpg`, `match/079-r1-sunset-t89.jpg`, `title/019`, `crop-019-terr.jpg`.
- **Cause** : `src/host/render/world/groundMaterial.ts:261` ne choisit la lecture lissée (B-spline 3×3) que si `vDist < 170 m`. Or la caméra de jeu est à plus de 170 m tout en cadrant serré (4 oiseaux, piqué), si bien qu'un texel de 0,25 à 0,3 m couvre 8 à 14 px. Les longues ombres qui sortent de la cascade proche tombent dans la lointaine (2,1 m/texel).
- **Correction** : choisir le lissage d'après la taille du texel à l'écran (`length(fwidth(p0)) * res / (2*half) < 1` → lissé) et non d'après la distance. En mode `round`, activer la cascade `focus` (`shadowMap.ts`, déjà écrite pour les plans bas) sur le rectangle cadré `cameraState.frame` + 20 m, soit environ 0,1 m/texel. Option : reconstruire le contour par interpolation de la hauteur plutôt que par test binaire.

### DA-02 · 4 · world — Les ombres sur le territoire font de la boue (olive, kaki, marron)
- **Constat** : ombre de tour ou empreinte d'oiseau sur Safran = olive-brun (`#765B30`, L 0,49, C 0,069, h 78°) ; sur Carmin = marron ; sur Corail = brique terne. Au couchant, c'est la moitié de l'image. Cela contredit la planche « Coucher » (§1.2 : ombres violettes, vitrail) et l'esprit anti-boue du §2.3.
- **Preuve** : `match/056-r1-golden-t55.jpg` (disque olive en bas à gauche), `match/079`, `match/126`, `crop-079-footprint.jpg`, `crop-lobby-birds.jpg` ; mesure `node tools/polish/art/sample-oklch.mjs shots/polish/art/match/079-r1-sunset-t89.jpg 1250,760`.
- **Cause** : `groundMaterial.ts:404`, `mix(lab.yz, shLab.yz, 0.35)` sur la peinture. On baisse L et on tire 35 % vers un violet peu chromatique, ce qui désature le jaune vers l'olive au lieu de le refroidir.
- **Correction** : sur la peinture, calculer l'ombre en OKLCH. Garder le ratio de L, prendre `C × 0,85` et tourner la teinte de 25 à 40° vers la teinte de `castShadow` (≈ 290°, par le chemin court) : c'est la règle du peintre, une ombre refroidit la couleur sans la griser. Contrôle automatique : aucune ombre sur peinture avec C < 0,08, ni avec h entre 60 et 110° et L < 0,55. Appliquer la même règle à `tintAB` pour les empreintes.

### DA-03 · 4 · staging — La caméra de jeu se laisse boucher par les tours
- **Constat** : au couchant (tangage 42°) et quand le cadrage resserre, un sommet de tour occupe 25 à 40 % du cadre et cache les oiseaux et leurs étiquettes.
- **Preuve** : `match/155-r3-golden-t74.jpg` (la Pile occupe 40 % du cadre, 2 oiseaux aux bords), `match/129`, `match/083` (étiquettes « Lou » et « Lagon · Faucon » sur un parasol), `match/082`, `match/160`, planche `sheet-r3.jpg`.
- **Cause** : `framing.ts` et `framingRig.ts` cadrent les ombres et les oiseaux sans tenir compte des occultants. Le tangage qui descend de 58 à 42° rapproche les sommets de la caméra, et le zoom de piqué aggrave l'effet.
- **Correction** : (a) dissolution en trame (IGN, comme le permet la bible §6.8) des parties de tour situées au-dessus de 20 m qui sont à moins de 60 m de la caméra, ou qui recouvrent un oiseau ou le rectangle d'action (`towerMaterial.ts`, uniforme des positions écran des oiseaux fourni par `HudProjector`) ; (b) dans le rig, pénalité si une tour dépasse 15 % du cadre, ce qui remonte le tangage de 5 à 8° ; (c) pas de zoom de piqué quand la paire passe sous un disque.

### DA-04 · 4 · staging — Cinématique du titre : environ 40 % des images mal composées
- **Constat** : tour géante au premier plan (`title/010`, `035`, `051`, `menu`) ; plan qui démarre sans sujet au rebouclage (`034`, `035` : fût et rampe hélicoïdale en gros plan, oiseau hors cadre) ; oiseau coupé au bord (`018`, `051`) ; rideau du Simoun en gros plan (`018`). Le plan final « orbit » dure environ 8 s et reste sombre et lointain (`028`-`033` : l'arène fait une petite pizza au milieu d'une plaine ardoise, les oiseaux font 10 px). Le premier plan après le chargement (`006`) cadre une tour plein centre, que « Appuie sur une touche » vient chevaucher.
- **Preuve** : `shots/polish/art/title/*.jpg`, planches `sheet-title-a.jpg` et `sheet-title-b.jpg`.
- **Cause** : dans `src/host/camera/cine.ts`, `CLUTTER_MAX = 0.3` laisse passer une tour qui barre 30 % de la largeur, et il n'y a pas de distance minimale. La grue n'est pas validée sur sa première image. L'orbit est trop haute et trop longue.
- **Correction** : `CLUTTER_MAX` à 0,12, plus une interdiction de toute tour à moins de 45 m dans le tronc de vue et de tout le Simoun à moins de 120 m. Sujet obligatoire dans la zone utile dès la première image, sinon changer d'oiseau. Orbit de 5 s au plus, plus basse (tangage 20-25°), cadrée sur le front de la Grande Ombre. Ou bien finir la boucle sur le plan « sunset » (`title/026`, le meilleur). Valider avec `tools/polish/art/title.mjs` sur 3 graines.

### DA-05 · 4 · world — Tours : quadrillage mécanique et brun boueux
- **Constat** : de près ou à contre-jour, le fût est couvert d'une trame en papier millimétré (verticales et horizontales au pas écran de 6 px). À contre-jour, la tour entière est brun-taupe. On lit du maillage CG, pas de la hachure d'encre.
- **Preuve** : `crop-019-tower.jpg`, `title/010`, `019`, `026`, `match/191-podium-late.jpg` (colonnes du podium).
- **Cause** : `towerMaterial.ts:127-133` applique `h1` (méridiens) plus `h2` (couche croisée quand la cavité est < 0,35) sur tout ce qui est à l'ombre. Or la cavité bakée par segment (`towerGeometry.ts`, `cav()`) est interpolée linéairement sur des segments de plus de 20 m, et à contre-jour tout le fût est « à l'ombre ». Le pas écran constant devient une trame mécanique en gros plan.
- **Correction** : borner la couche croisée aux vrais creux (ajouter un anneau de sommets 2 à 6 m sous chaque surplomb, seuil 0,25). Moduler les hachures par le ton (`hatchTone` existe) sur une bande le long de la silhouette et du terminateur, au lieu d'un remplissage. Passer à un pas de 8-9 px et une opacité × 0,6 quand le fût dépasse 150 px de large. À contre-jour : aplat ombré plus un filet de lumière `sandLit` de 1,5 px côté soleil, comme Moebius traite ses silhouettes au couchant.

### DA-06 · 4 · birds — À 9-12 oiseaux, on ne retrouve pas le sien
- **Constat** : 30 à 45 px d'envergure. La bande de couleur fait 2 à 3 px et le cerne d'encre domine : chaque oiseau devient une croix noir et blanc, et la couleur ne se lit plus que sur le territoire. Le cadrage laisse en plus 15 % de sable vide en bas (`twelve/025`).
- **Preuve** : `twelve/006-noon-t8.jpg`, `crop-12-birds.jpg` (×3), `twelve/015`, `twelve/025`.
- **Cause** : `renderScale="auto"` est plafonné à `RULES.birdRenderScaleMax` (× 1,3), et la bande d'aile (14 % de la demi-envergure) a été pensée pour 38 px et plus.
- **Correction** : au-delà de 8 oiseaux, plafond cosmétique à × 1,7. LOD `far` (moins de 70 px) : bande élargie à 35-40 % de la demi-aile, cape et selle agrandies, cerne réduit à 1,5 px. Jeton-glyphe permanent de 18 px (le composant existe pour le mode daltonien, `WorldLayer.tsx`) sous chaque oiseau humain dès 7 oiseaux. Halo papier au sol sous l'oiseau dont le joueur appuie sur un bouton. Resserrer la marge basse du cadrage « arène entière ».

### DA-07 · 4 · staging + birds — Le podium, dernière image, est le plan le plus faible
- **Constat** : les oiseaux perchés en V héraldique, vus de dos à contre-jour, se lisent comme des artichauts gris-mauve, cou dressé sans tête lisible. Les plaques sont posées devant les corps. La couronne est invisible (derrière la case du titre) ou apparaît en gris « bateau en papier » (podium à 12). Les colonnes sont des troncs bruns génériques. L'image reste figée plus de 10 s (`182` à `191` identiques), l'UI couvre environ 60 % du cadre, et les rayons de gloire traversent tout l'écran comme des rayures grises.
- **Preuve** : `match/191-podium-late.jpg`, `sheet-podium.jpg`, `shots/qa/podium12/005-podium-late.jpg`.
- **Cause** : pose `perch` (`bird/pose.ts`, `animator.ts`) ; matériau de l'oiseau dans son ombre propre ; `controller.ts:248` place la couronne 3,5 m au-dessus, à une taille écran minimale, soit environ 110 px au-dessus du cavalier, derrière la case ; couronne éclairée comme un objet ; plaques à 37 % (`podium.ts`, `results.css`).
- **Correction** : ailes ouvertes à l'horizontale (cormoran qui sèche ses ailes), tête de profil. Liseré de contre-jour de 2 px (`sun`/`sandLit`) sur la silhouette côté soleil, plus 25 % de remplissage de face. Couronne non éclairée (aplat `#FFF2C3`, cerne d'encre) posée 1 m au-dessus de la capuche. Plaques sous le plateau (haut des plaques à 45-50 %) ou tours plus hautes. Colonnes en archétype Pile crème, ocre et turquoise. Mise en scène : 2,5 s de plan pur (le vainqueur se pose, un battement, la couronne tombe) avant l'entrée de l'UI, et rayons de gloire limités à un disque d'environ 250 px derrière le vainqueur.

### DA-08 · 4 · hostui — Salon PC : l'URL du déploiement déborde du panneau du QR
- **Constat** : « ou ouvre ombres-011e623351e7.deploy.breizhware.com/play » passe sur deux lignes coupées à gauche et à droite, et la case grandit en poussant « Les règles ». En production, c'est l'URL que tout le monde verra.
- **Preuve** : `match/002-lobby-longurl.jpg` (comparer avec `001-lobby-empty.jpg`).
- **Cause** : `src/host/ui/screens/Lobby.tsx` et `lobby.css` : ligne en taille fixe, césure sur le tiret.
- **Correction** : hôte sans schéma sur une seule ligne, ajusté à la largeur (22 → 14 px, mesure `measureText` ou container query), avec `<wbr>` après chaque point, ou forme courte « ombres-…/play ». Hauteur de case fixe.

### DA-09 · 3 · world — Rideau du Simoun : un voile flou « aérographe »
- **Constat** : dès que la caméra s'en approche (titre, Grande Ombre côté est), le rideau devient un voile translucide brun-rose qui couvre 25 à 35 % du cadre et salit tout ce qu'il y a derrière. C'est le seul élément de l'image qui ne soit pas un aplat.
- **Preuve** : `title/018`, `match/134-r2-greatShadow-t109.jpg`, `match/089`, `twelve/034`, `crop-lobby-storm.jpg`.
- **Cause** : `StormCurtain.tsx`, `alpha = 0.7*body + 0.3*edge`, matériau transparent.
- **Correction** : aplat opaque, festons découpés en trame (screen-door) plutôt qu'en alpha. Dissoudre en trame à moins de 80 m de la caméra, ou quand il passe entre la caméra et les oiseaux. Au titre, `hideStorm` pour tout plan à moins de 120 m.

### DA-10 · 3 · birds — Effets pensés pour la vue de jeu, ratés en gros plan
- **Constat** : les bouffées de sable deviennent des biscuits plats de 150 à 250 px suspendus en l'air, dont l'un est en cours de dissolution (`title/019`, `024`, `026`). Le ruban de traînée devient un bâton bleu rigide de 30 px (`006`, `010`, `019`). L'aile vue par la tranche en plein battement se lit comme une voile (`014`, `024`).
- **Preuve** : `shots/polish/art/title/`.
- **Cause** : `fx/system.ts` travaille en tailles monde sans plafond écran ; le ruban n'a ni effilement visible ni fondu de proximité.
- **Correction** : particules plafonnées à 60 px à l'écran et rétrécies à moins de 25 m de la caméra (disparition par rétrécissement, §6.8). Ruban de largeur `min(0,35 m, 6 px)`, effilement fort sur ses 30 % finaux, dissolution à moins de 30 m.

### DA-11 · 3 · birds — Couronne détachée, coupée, prise pour un bateau en papier
- **Constat** : la couronne flotte 100 à 340 px au-dessus du meneur, coupée par le haut du cadre au titre (`title/010`-`014`). Vue en jeu, c'est un petit gobelet crème qui semble posé au sol (`crop-079-crown.jpg`). Au podium, elle est grise.
- **Cause** : `controller.ts:248` calcule `lift = crownLift(3,5-5,7 m) × scale` avec une taille minimale en px, et le matériau éclairé la grise à contre-jour.
- **Correction** : hauteur exprimée en px écran (12 à 24 px, plafonnée à 1,5 m). Aplat or non éclairé plus cerne. Trois pointes bien ouvertes, plus larges que hautes. En gros plan (plus de 200 px d'envergure), couronne posée sur la capuche.

### DA-12 · 3 · birds — Au couchant, les oiseaux deviennent des corbeaux gris
- **Constat** : dans l'ombre des tours et derrière le front, les oiseaux sont gris ardoise et la couleur du joueur disparaît (`match/129`, `089`, `134`, `164`).
- **Cause** : l'état « caché » mélange 55 % vers `castShadow`. Au couchant, les ombres couvrent une grande part de l'arène : la moitié des oiseaux est cachée en permanence.
- **Correction** : garder les pièces colorées à 80 % de leur chroma même cachées ; limiter le mélange à 35 % quand `paletteElev < 10` ; liseré de lumière rasante (`sandLit` KF1, 1,5 px) sur le dos côté soleil tant que l'oiseau n'est pas dans la nuit.

### DA-13 · 3 · world — Le liseré « pointillé » des empreintes pâles est un damier
- **Constat** : le bord de l'empreinte pâle forme des blocs bicolores en escalier au lieu de tirets.
- **Preuve** : `crop-079-footprint.jpg`, `match/070`, `match/124`.
- **Cause** : `groundMaterial.ts`, environ ligne 410 : `dash = abs(step(.5, fract(along/2.4)) - step(.5, fract(across/2.4)))` produit un damier monde de 2,4 m (la bible §5.3 donne des bandes obliques fines).
- **Correction** : reprendre la formule de la bible, ou paramétrer les tirets par l'angle autour du centre de l'empreinte : tirets de 1,8 m, rapport 50 %.

### DA-14 · 3 · world — Territoire PÂLE indistinct du sol au soleil bas
- **Constat** : sur le sol rose de KF10 (et le lavande de KF3), certaines pâles se confondent avec le sable.
- **Mesure** (`node tools/polish/art/pale-vs-ground.mjs`, ΔE OKLab pâle contre `groundFlat`) : Corail KF10 **0,032**, Prune KF3 0,038, Carmin KF10 0,044, Rose KF10 0,048, Safran KF16 0,051. On lit mal en dessous de 0,06 environ.
- **Cause** : `groundMaterial.ts`, environ ligne 205, `Lp = Lg < 0.66 ? mix(Lg, Ls, 0.45) : Lg - 0.03`, avec un chroma × 0,55.
- **Correction** : pâle à `Lg - 0.06` et chroma × 0,7 entre L 0,66 et 0,80, ou une garde : si ΔE(pâle, sol) < 0,06, pousser L puis C jusqu'à 0,06. Ajouter une porte « pâle contre sol ≥ 0,05 » à `docs/art/tools/final.mjs`.

### DA-15 · 3 · hostui — Bulles d'indication : doublons et chevauchements
- **Constat** : deux « Vise avec ton ombre. » s'affichent en même temps, la seconde masquant l'étiquette « Brieuc » (`match/079`). Une bulle glisse sous le cadran solaire, son texte coupé (« …RE DE TOUR : SABLE », `match/044`). Une bulle se pose sur une étiquette (« Safran · Guetteur » sous « Vise avec ton ombre », `twelve/015`), et des étiquettes s'empilent (« Lagon » sur « Corail »).
- **Cause** : `src/host/ui/hud/WorldLayer.tsx` ne contraint que l'axe x (`EDGE_FRAC`) ; il n'y a ni zone d'exclusion ni dédoublonnage.
- **Correction** : rectangles d'exclusion lus du DOM (cadran, bande de sable et onglet de couronne, bannière, récitatif) ; en cas de collision, bulle sous l'oiseau avec la pointe vers le haut. Une même clé affichée à moins de 2 s d'intervalle → une seule bulle. Masquer l'étiquette d'un oiseau qui porte une bulle, et décaler de 26 px les étiquettes qui se touchent.

### DA-16 · 3 · birds — Traînées fantômes au début de chaque manche
- **Constat** : de longues lignes blanches droites traversent l'arène pendant le compte à rebours.
- **Preuve** : `match/017-r1-countdown-t-3.jpg`, `match/112`, `crop-112-lines.jpg`.
- **Cause** : dans `fx/system.ts`, les tampons `trail`, `tipL`, `tipR` et `streak` ne sont vidés que si l'oiseau disparaît. Quand la sim change (salon → manche, manche → manche), le même slot est téléporté et le segment de l'ancienne position à la nouvelle est dessiné.
- **Correction** : mémoriser `view.sim` et tout vider quand elle change ; vider aussi le tampon d'un oiseau qui se déplace de plus de 20 m en une frame.

### DA-17 · 3 · world — Le front de la Grande Ombre ne se lit pas comme une « lèvre dorée »
- **Constat** : le front se lit comme un fil orange de 2 px, ou une fissure. Côté nuit, le territoire est plus saturé que côté jour, ce qui inverse la lecture (où est le gel ?).
- **Preuve** : `match/089`, `match/134`, `twelve/034`.
- **Correction** : bande de lumière rasante de 6 à 12 m devant le front (sol et peinture tirés vers `sandLit` KF1, L + 0,06), lèvre de 4 px en 1080p. Côté nuit, pendant la Grande Ombre seulement, chroma du lavis − 15 % et L − 0,04 : il se rallume aux résultats, et l'illumination prend alors tout son sens.

### DA-18 · 3 · hostui — Pictogramme de l'oiseau des règles : un avion sur PC, un boomerang sur le téléphone
- **Constat** : dans les illustrations des règles, le PC dessine un avion de chasse (ailes droites rayées, cockpit rond, empennage) et le téléphone un boomerang. Aucun ne ressemble à l'oiseau-ptérosaure du jeu.
- **Preuve** : `match/013-rules-a.jpg` contre `match/014-A-rules.jpg`, `crop-lobby12-rules.jpg`.
- **Cause** : `src/host/ui/RuleArt.tsx` (`Bird`) et `src/phone/ui/RulesCards.tsx` ont chacun leur dessin.
- **Correction** : un seul pictogramme tiré de la vue de dessus réelle (ailes en M tendu, long cou et bec, queue en éventail), placé dans `src/shared` et utilisé partout. Sur le téléphone, peindre la règle dans la couleur du joueur (Brieuc/Safran voit du Corail).

### DA-19 · 3 · phone — Salon : la carte des règles est coincée entre le joystick et les boutons
- **Constat** : le bord droit de la carte touche l'anneau de COUP D'AILE (`match/011-A-lobby-still.jpg`, `004`). Dès qu'on pilote, le socle du joystick la recouvre (`007`). Un toast « RATÉ… » reste en fantôme translucide sur le panneau des objectifs (`007`).
- **Cause** : `src/phone/phone.css`, `.lobby-rules` en position absolue à `left: 50%` avec `translateX(-62%)` et une largeur de 190 px / 30vw, sans réserve pour `.stick-zone` ni `.act`.
- **Correction** : sortir la carte de la zone de pilotage (second onglet du panneau d'objectifs, ou vignette au-dessus des boutons), ou la faire disparaître en 150 ms tant qu'un pointeur est posé. Toasts au-dessus du bandeau, jamais sous un panneau.

### DA-20 · 3 · phone — L'étoile de PIQUER sort de l'écran
- **Constat et mesure** (`tools/polish/art/phones.mjs`) : sur iPhone 15 Pro en paysage (659 × 393), l'étoile va jusqu'à x 684 et y 424, soit 25 px et 31 px hors écran. Sur Pixel 7, 8 et 14 px. Un rayon croise l'anneau de COUP D'AILE.
- **Preuve** : `phones/iPhone15Pro-play-target.jpg`, `phones/Pixel7-play-target.jpg`.
- **Cause** : `phone.css`, `.act__star { inset: -14% }` plus l'animation `scale(1.06)`, avec un bouton à 24 px du bord.
- **Correction** : rayons contenus dans le disque (`inset: -6%`, rayons de 38 à 47 sur 100), ou bouton décalé vers l'intérieur de 0,14 × son diamètre en état cible. Tourner l'étoile de 22,5° pour qu'aucun rayon ne vise COUP D'AILE.

### DA-21 · 2 · phone — Des phrases entières composées dans la police des chiffres
- **Constat** : en fin de partie, « +2 places dans la dernière ligne droite », « 4 piqués réussis » et « 0 sur 2 » sont en Averia Bold minuscule. On dirait une police de repli.
- **Preuve** : `match/189-A-matchEnd.jpg`, `phones/iPhone15Pro-matchEnd-winner.jpg`.
- **Cause** : `src/phone/screens/GameScreens.tsx:312`, `<div className="t-num">{m.title.value}</div>`, plus les compteurs de votes.
- **Correction** : ne composer que les nombres en Averia (comme le fait `useTn`), le reste en Patrick Hand SC.

### DA-22 · 2 · hostui — Voiles et fondus « template web »
- **Constat** :
  - le voile d'encre à 42 % sur le sable chaud donne un brun-gris boueux derrière les cartes des règles (`match/013`) ; même voile kaki sur le téléphone en pause et en reconnexion (`sheet-phones-iphone.jpg`) ;
  - au titre, le pied de page est une pilule d'encre translucide à 72 % et « Appuie sur une touche » respire en opacité : ce sont les seuls éléments semi-transparents de l'UI (`title/006`, `010`) ;
  - la case « Les règles » du salon se vide complètement entre deux cartes (`crop-lobby12-rules.jpg`) ;
  - le panneau des résultats est encore à mi-opacité quand le « 3 » de la manche suivante apparaît (`match/112`).
- **Cause** : `styles/base.css:392` (`.veil`), `title.css` (`.title__foot`, `title-breathe`).
- **Correction** :
  - pendant les règles, la pause et les réglages, tenir le flash « planche » (`uFlash` ≈ 0,5 dans `InkEffect`, la scène redevient un crayonné) ou poser un voile papier à 55 % (effet calque) ;
  - pied de titre en case papier opaque, respiration par un déplacement de ± 3 px ;
  - changement de carte des règles par essuyage d'encre, sans case vide ;
  - le panneau des résultats sort, puis 250 ms plus tard le compte à rebours commence.

### DA-23 · 2 · staging — Carte des résultats : perspective et vide
- **Constat** : en vue verticale, les tours des bords se couchent en saucisses de cylindres. La grande plaine ardoise est vide, traversée d'une bande lavande qui ressemble à une rivière.
- **Preuve** : `match/108-r1-results-a.jpg`, `match/147`.
- **Correction** : vue verticale avec un FOV de 18 à 22° prise de plus loin (quasi orthographique, comme une carte) dans `camera/director.ts`, et voir l'idée W2.

### DA-24 · 3 · game — Échap au salon renvoie au titre alors qu'un joueur clavier est inscrit
- **Constat** : Échap ramène au titre, qui affiche alors « Clavier 1 dans la partie » dans un cartouche chevauchant le cadre du logo. Le joueur clavier ne peut pas quitter la partie seul.
- **Preuve** : `screens/009-lobby-kb-escape.jpg` (journal : « après Échap au salon : title »).
- **Correction** : au salon, Échap (ou Retour arrière) retire d'abord le dernier joueur clavier, avec un rappel dans la ligne « Espace pour jouer au clavier » ; un second Échap ramène au titre. Placer le cartouche sous la case du pitch.

### DA-25 · 2 · game — Noms de bots en double ; champion sans titre
- **Constat** : à 12 oiseaux, le salon liste deux « Faucon », deux « Laboureur » et deux « Pie » sans nom de couleur (`twelve/002-lobby-12-flying.jpg`). Au podium, le champion peut recevoir « Sans titre, mais pas sans panache » (`shots/qa/podium12/005`).
- **Correction** : afficher les bots du salon au format « Azur · Faucon », comme en jeu. Le vainqueur reçoit toujours un titre (repli « Le Souverain » ou « Maître du couchant »).

### DA-26 · 2 · hostui — Libellés et faits en double
- **Constat** : « Heure dorée » s'affiche en même temps dans l'onglet du cadran et dans la bannière centrale (`match/056`, `twelve/020`). « Raz-de-marée » est le fait marquant des trois manches d'affilée (`108`, `147`, `177`).
- **Correction** : n'afficher l'onglet du cadran que si la bannière n'est pas montrée ; ne jamais répéter un même fait marquant dans une partie.

### DA-27 · 3 · game — Équilibrage : le Faucon par défaut écrase la partie
- **Constat** : le Faucon Voyageur gagne les 3 manches (42,8 %, 39,7 % puis 36,4 %, contre 9 à 19 % pour les autres) et finit à 16 soleils contre 8, 3 et 1. Aucune fin de manche n'a basculé. Adversaires : 2 téléphones et 1 clavier pilotés par script.
- **Preuve** : `shots/polish/art/match/match.log`, résultats `108`, `147`, `177`.
- **Réserve** : des pilotes scriptés ne sont pas des humains.
- **Correction** : quand il y a 2 humains ou moins, bots par défaut un cran plus bas ; Faucon remplacé par Pie ou Guetteur (`bots.md`) ; bot meneur moins agressif au couchant.

### DA-28 · 3 · other — Budget GPU en High à 12 oiseaux
- **Constat** : 10,0 à 11,3 ms (`qa.md`, timer queries), au-dessus du budget de 10 ms. Non re-mesuré ici, faute de GPU disponible.
- **Correction** : la qualité auto passe en Medium au lancement d'une partie à 9 oiseaux ou plus ; ou SMAA medium en High (− 0,3 ms) ; exiger 20 % de marge au banc du titre.

### DA-29 · 2 · world — Lavis à mi-distance : aplats saturés, l'aquarelle disparaît
- **Constat** : à l'heure dorée, les grandes zones Safran et Carmin se lisent comme un tapis de Twister (`match/056`, `070`, `twelve/025`) : granulation et liseré ne se voient plus.
- **Correction** : variation basse fréquence du lavis (± 3-4 % de L, bruit monde de 25 à 40 m) ; liseré d'au moins 3 px mais aussi d'au moins 0,8 m monde ; « fleurs » d'aquarelle (backruns) aux départs de traînée ; chroma des forts plafonné à 0,12 à l'heure dorée.

### DA-30 · 1 · hostui — Chargement
- **Constat** : environ 1,2 s de papier blanc avant le premier trait (polices en `font-display: block`). « OMBRES » y est composé en Julius fin alors que le titre a un logotype dessiné (`title/001`-`005`).
- **Correction** : dessiner le SVG sans attendre les polices ; reprendre le logotype en petit.

### DA-31 · 1 · hostui — Crédits
- **Constat** : des échantillons sont listés comme des morceaux sous « Musique » (« Oud A2 », « Oud C3 », « Oud G2 », « Duduk C4 », `screens/007-credits-14000.jpg`).
- **Correction** : sous-section « Instruments échantillonnés », une ligne par auteur.

## Idées « wow » (fort impact, faible risque, dans la bible)

- **W1 · La dernière lumière.** Pendant la Grande Ombre, une bande de lumière rasante corail de 6 à 12 m court devant le front : le territoire y brille une dernière fois avant d'être gelé. C'est du shader seul (`nightDist` existe déjà), et cela fait l'image de fin de manche que la bible annonce (§4.6).
- **W2 · La carte devient une planche.** Aux résultats, la vue verticale se change en planche imprimée : marge papier, cadre d'encre tremblé, cartouche calligraphié « Les Parasols — manche 1 », rose des vents, échelle en mètres, tampon à la couleur du vainqueur. DOM et caméra seulement (FOV serré, DA-23).
- **W3 · Du crayonné à la couleur.** Pendant « 3-2-1 », la scène reste un crayonné (`uFlash` tenu), puis la couleur coule d'ouest en est à « Envol ! » (masque du front de nuit utilisé à l'envers). Le même crayonné remplace le voile brun de la pause et des règles (DA-22). Réutilise `InkEffect`.
- **W4 · Le logo vivant.** Les ombres des lettres du logo suivent le vrai soleil de la démo (azimut et élévation de `worldView`) : au coucher de la démo, les lettres projettent de longues ombres violettes, en synchronie avec le monde. SVG seul.
- **W5 · L'ombre du champion.** Au podium, le vainqueur s'envole, passe bas devant le soleil, et son ombre démesurée balaie les plaques des deux autres avant qu'il se pose, couronné. La height map fait le travail ; il faut un vol scripté de 3 s (risque moyen).
- **W6 · Le téléphone du vainqueur.** Son fond se couvre de son lavis en 1,5 s (front mouillé), avec une gloire d'encre tournante et une vibration en roulement de tambour ; les autres voient leur pourcentage s'écrire à la plume.

## Non couvert

- **Audio.** Je ne peux pas écouter : le mix et le narrateur restent à juger à l'oreille, par un humain (voir `qa.md` §8.2).
- **Performance.** Non re-mesurée : GPU occupé à 100 % par d'autres agents.
- **iOS réel.** Seule l'émulation Playwright a été vue.
