# Ombres — ordres de travail du polish (vague 1)

Lead de production. Sources : les cinq rapports `docs/polish/critic-{art,feel,firsttime,tech,audio}.md` (preuves dans `shots/polish/<critique>/`, scripts dans `tools/polish/<critique>/`). Ce document fusionne les doublons, tranche les contradictions et répartit le travail entre **7 correcteurs parallèles aux périmètres disjoints**.

Ordre de priorité dans chaque flux : d'abord ce qui est cassé ou laid (sévérité 5-4), ensuite la lisibilité et le game feel, puis les « wow » peu risqués, enfin le reste. **Traiter les ordres dans l'ordre de la liste.** Un ordre « wow » ne se commence qu'une fois les ordres de sévérité ≥ 3 du flux terminés et vérifiés.

---

## 0. Règles communes à tous les correcteurs

- **Port de dev réservé** : staging 8831 · world 8832 · birds 8833 · hostui 8834 · phone 8835 · game 8836 · audio 8837. Lancer `PORT=<port> pnpm dev` en arrière-plan et **l'arrêter à la fin** (tuer toute l'arborescence `pnpm dev → tsx watch → node server/index.ts`, puis vérifier que le port est libre). Tous les scripts `tools/e2e/**` et `tools/polish/**` lisent `PORT`.
- **Périmètre strict.** Tu ne modifies que tes fichiers. Seules exceptions : les « Edits ciblés » listés dans tes ordres (§10), faits avec l'outil Edit sur les lignes indiquées, **en relisant le fichier juste avant** (un autre correcteur peut l'avoir changé).
- Aucune installation Nix impérative, aucun `git commit`, aucune modification de `package.json`.
- Options de test uniquement derrière `?debug` (`?debug`, `?debug=fast&speed=4`, `?debug=nosave`, `?debug=perf`). Rien de debug visible en jeu.
- **Regarder chaque capture** (outil Read). Une correction n'est « faite » que si le critère de vérification de l'ordre est rempli, preuve à l'appui (chemin de la capture, chiffre mesuré).
- GPU partagé avec les autres correcteurs : avant toute mesure de performance, vérifier `/sys/class/drm/card1/device/gpu_busy_percent` (< 20 % au repos) et préférer les timer queries (`?debug=perf`, `tools/polish/tech/perfmatrix.mjs`). Toute modification de shader (world, birds) note son coût GPU mesuré.
- Avant de rendre la main : `npx tsc --noEmit -p tsconfig.json` filtré sur tes chemins, `npx vitest run <tes dossiers>`, `pnpm check:boundaries`, et une partie complète de fumée (`PORT=<port> node tools/e2e/solo.mjs`) sans erreur console.
- Respecter les réglages « Réduire les flashs » et « Tremblement » pour tout nouvel effet (flash, crayonné tenu, secousse).
- Consigner ce qui a été fait (et les écarts à la bible ou au GDD) dans `docs/agent-notes/<module>.md`, section « Polish vague 1 ».
- **À ne pas casser** (cités comme réussis par les critiques) : l'image de midi (planche Moebius), la caméra du duel, le resserrement des dernières secondes, la montée de nuit vers la carte, les états PIQUER du téléphone et les vibrations, la fréquence du narrateur, le mode daltonien, l'UI en cases de BD.

---

## 1. Arbitrages du lead

### 1.1 Vérifications faites par le lead

- **Les pilotes de téléphone scriptés restent bloqués sur PLONGER** (constat de firsttime, confirmé). `tools/polish/lead/release-check.mjs` (port 8826) : en CDP, relâcher un doigt par un `touchMove` qui ne le contient plus (méthode de `tools/e2e/qa/pilot.mjs`), ou par un `touchEnd` qui porte les points restants (méthode de `steer` dans `lib.mjs`), **laisse `.act--dive` enfoncé**. Seul un `touchEnd` vide le relâche. Le code du téléphone (`usePressable`, pointerup/cancel/lostcapture) est correct pour un vrai appareil : c'est un artefact du banc d'essai. Le même défaut bloque COUP D'AILE après le premier appui, si bien que les pilotes n'esquivent plus. **Conséquence : la « domination du Faucon » mesurée par art et firsttime contre des pilotes téléphone est biaisée** (au podium de match.mjs : « En bas 100 % / 99 % »). Les mesures headless de feel (`bot-pressure.ts`, `solo-sweep.ts`) sont, elles, fiables.
- **Plafond de résolution** : confirmé à la lecture du code (`WorldCanvas.tsx` passe `dpr={1}`, `NprPipeline.tsx` le corrige par `setDpr` seulement quand le preset change, et `App.tsx` rend de nouveau le `<Canvas>` sur `glorySlot`).
- **Nuit** : confirmé en image (`shots/polish/feel/solo-default/087-ten_01636_p1.44.jpg`). Des deux côtés du front, le territoire garde les mêmes couleurs saturées ; seuls le sol hors arène et les tours changent.
- **Titre, podium, ombres olive, bulles en double** : confirmés en image (`shots/polish/art/sheet-title-a.jpg`, `match/191-podium-late.jpg`, `match/079-r1-sunset-t89.jpg`).
- **Câblage** : les sons d'interface passent par `setNavSound((name, v) => playUi(name, …))` dans le runner, un câblage générique. Ajouter `'count' | 'sun'` à `NavSound` suffit, sans toucher au runner. `qualityMonitor.shouldDowngrade()` est la seule API que le runner appelle (runner.ts:942) : world peut en refaire l'intérieur sans toucher au runner.

### 1.2 Contradictions tranchées

| Sujet | Tranché | Pourquoi |
|---|---|---|
| Faucon trop fort (art, firsttime) contre bots trop passifs (feel) | **Plus de pression** (chasse dès 15 s, Pie à la place du Nomade en solo). Pas d'affaiblissement du Faucon tant qu'une nouvelle mesure avec des pilotes réparés ne l'a pas justifié. | Mesures biaisées (§1.1). En headless, le profil « mixte » gagne 75 % des manches en Voyageur : le solo n'est pas trop dur, il est trop passif. |
| Hauteur de la couronne : en px écran et plafonnée à 1,5 m (art), ou 2,5 + 1 × piqué (feel) | **Bible §6.7** : environ 3 m au-dessus du cavalier (2,5 + 1,0 × piqué), jamais multipliée par l'échelle cosmétique au-delà de 1, taille écran ≥ 14 px ; posée sur la capuche en gros plan. | La bible fait foi ; c'est l'écart actuel (≈ 7 m) qui pose problème. |
| Cadrer les vraies positions des oiseaux avec un poids 1 (feel) | Poids du GDD §13.1 conservés (ombres 1,0, oiseaux 0,7), plus une **contrainte dure** : la boîte écran de chaque oiseau reste dans le rectangle utile. | Les ombres restent le sujet (bible §5.4) sans perdre l'oiseau. |
| Musique du titre +6 dB (firsttime) ou départ à 13 s +2 dB (audio) | **Départ à 13 s, +2 dB** (audio). | Cela traite la cause : 13 s d'intro quasi muette dans le fichier. |
| Flash « planche » à chaque touche (bible §6.8) | **Réservé aux touches qui comptent** : couronne, touche impliquant un humain, ou vol ≥ 1 % de l'arène. Au plus un toutes les 6 s. | 11 flashs par manche à 12 oiseaux banalisent le moment fort (feel). |
| Ombre sur la peinture : mélange OKLab de 35 % vers `castShadow` (bible §4.5, §5.1) | **Refroidir en OKLCH** : ratio de L conservé, C × 0,85, teinte tournée de 25 à 40° vers celle de l'ombre. On garde l'exigence de la bible : ΔE ≥ 0,059 entre joueurs sous l'ombre. | La lettre de la bible produit la boue olive que son esprit interdit (§1.2 « Coucher », §2.3). |
| Territoire côté nuit (bible §4.6 : lavis au chroma 0,13) | **Désaturé et assombri pendant la Grande Ombre**, rallumé aux résultats (§4.7 inchangé). | Aujourd'hui, le côté gelé est aussi vif que le côté jour, voire plus : la lecture est inversée. |
| Oiseau caché : mélange de 55 % vers l'ombre (bible §5.3) | **35 % au soleil bas** (`paletteElev` < 10), pièces colorées gardées à 80 % de leur chroma. | Au couchant, la moitié des oiseaux devient des corbeaux gris sans couleur de joueur. |
| Échelle des oiseaux à 12 : × 1,7 (art) ou × 1,5 (feel) | **× 1,6 au-delà de 8 oiseaux**, plus un LOD lointain à bande d'aile élargie. | Compromis entre les deux mesures ; le LOD fait l'essentiel. |
| Dédoublonnage des bulles : dans le directeur ou dans l'UI | **Dans l'UI** (hostui, H1). Le directeur (game, G3) ne règle que le moment des indications. | Un seul propriétaire de l'affichage. |
| Terminologie EN : « Dive » désigne à la fois le vol bas et l'attaque | **Glossaire commun** (§9). Chaque propriétaire l'applique dans son fichier de chaînes ; hostui (H7) fait la vérification finale par grep sur tous les fichiers. | Fichiers de chaînes disjoints ; un seul correcteur responsable du résultat. |

### 1.3 Écartés

- Affaiblir le Faucon ou le remplacer dans `defaultBots(3)` sans nouvelle mesure (voir G1 : mesure conditionnelle).
- Couronne dimensionnée en px écran et plafonnée à 1,5 m : contraire à la bible, remplacé par B4.
- Musique du titre +6 dB : remplacé par A5.
- « Halo papier sous l'oiseau qui appuie » (art DA-06) : remplacé par le jeton permanent et la pulsation d'étiquette (H3), moins coûteux et déjà dans la bible.

---

## 2. STAGING — `src/host/camera/**` (port 8831)

### S1 · sév. 4 · Cadrage de manche : l'oiseau réel reste dans le cadre utile
- **Constat** : à 6 oiseaux, un oiseau chevauche la bande de sable 63 % du temps au couchant, 42 % au compte à rebours et 39 % l'après-midi. En duel, au couchant, l'oiseau du joueur est coupé par le bord gauche pendant 2,5 s : la caméra cadre l'ombre du Faucon partie dans le Simoun. À 12 oiseaux, le cadrage « arène entière » laisse 15 % de sable vide en bas. Cause : `framingRig.ts:166-177` (point pris à 70 % du chemin ombre → oiseau, z × 0,7) et `ROUND_RECT.y0 = 0.15`, trop haut sous la bande HUD, qui finit à 116 px plus l'onglet de couronne.
- **Correction** : garder les poids du GDD §13.1 (ombres 1,0, oiseaux 0,7) et ajouter une contrainte dure : la boîte écran de chaque oiseau actif (ancre ± demi-envergure à l'écran, plus la couronne si c'est le meneur) tient dans le rectangle utile (haut 0,21, bas 0,13, côtés 0,06). Si c'est impossible, abandonner d'abord les ombres au-delà de ρ = 1,0 (ombre dans le Simoun), puis élargir. Au-delà de 8 oiseaux, centrer l'ellipse de l'arène dans le rectangle utile et réduire la marge basse. Prévoir l'échelle cosmétique × 1,6 de birds (B1).
- **Vérification** : `node tools/polish/feel/match.mjs --name=six` puis `node tools/polish/feel/read-stats.mjs` : moins de 5 % du temps sous la bande à toutes les phases, 0 % hors cadre ; en duel (`--name=duel`), aucune ancre hors écran ; à 12 (`--name=twelve`), sable vide en bas < 6 % de la hauteur. `npx vitest run src/host/camera` vert, `framing.test.ts` mis à jour.

### S2 · sév. 4 · Grande Ombre : un plan serré qui se resserre encore
- **Constat** : à 98 s, `framingRig.ts:189-197` ajoute le front de nuit (à −1,05·a) à la hauteur de chaque oiseau. La caméra dézoome sur toute l'arène (oiseaux de 40 à 50 px, tiers bas vide) : le climax commence sur le plan le moins dramatique de la manche.
- **Correction** : borner le point du front à (x de l'oiseau le plus à l'ouest − 40 m), pour que la lèvre entre dans le cadre sans imposer le plan large. Sur les 12 s, poussée lente (largeur −10 %) et tangage un peu plus bas (−3°), en gardant le décalage vers l'est (GDD §13.1). Ne pas toucher au resserrement des dernières secondes, qui est réussi.
- **Vérification** : captures à 98,5, 101, 104 et 108 s en solo (4 oiseaux) et à 6 oiseaux (`feel/match.mjs`) : envergure médiane ≥ 60 px (`read-stats.mjs`), front visible dans le cadre, largeur cadrée qui décroît. Regarder les images.

### S3 · sév. 4 · Les tours ne bouchent plus la caméra de jeu
- **Constat** : au couchant (tangage 42°) et en cadrage serré ou en piqué, un disque ou une Pile occupe 25 à 40 % du cadre et cache oiseaux et étiquettes (`shots/polish/art/match/155`, `129`, `083`).
- **Correction** : dans `framingRig`, estimer la part d'écran couverte par les parties de tours au-dessus de 20 m (projection des disques et segments des `TowerDef`). Au-delà de 15 %, remonter le tangage de 5 à 8° et/ou décaler la cible. Pas de zoom de piqué (`camDiveZoom`) quand la paire passe sous un disque. S'ajoute à W9 (dissolution en trame côté world), sans dépendance entre les deux.
- **Vérification** : `PORT=8831 node tools/polish/art/match.mjs` : sur les images d'heure dorée et de couchant des 3 manches, aucune tour ne dépasse 15 % du cadre et aucune étiquette n'est posée sur un disque (planche à regarder).

### S4 · sév. 4 · Cinématique du titre : 100 % d'images composées
- **Constat** : environ 40 % des images sont ratées : tour géante au premier plan et trame de tour derrière le logo, plan sans sujet (au rebouclage et à 2,5 s), oiseau en piqué à moins de 25 m avec une traînée de 700 px en diagonale, rideau du Simoun en gros plan, orbit finale de 8 s sombre et lointaine (arène en « pizza », oiseaux de 10 px), premier plan après le chargement sur une tour plein centre sous « Appuie sur une touche ».
- **Correction** : dans `cine.ts`, passer `CLUTTER_MAX` de 0,3 à 0,12. Rejeter un plan si une tour est à moins de 45 m dans le tronc de vue, si le Simoun est à moins de 120 m (`hideStorm` sinon), ou si une tour coupe le rectangle du logo ou du pied de page. Exiger le sujet dans la zone utile dès la première image (sinon l'autre côté, puis un autre oiseau, comme `freshCheck`). Exclure des suivis les oiseaux en piqué engagé à moins de 25 m de la caméra. Orbit de 5 s au plus, tangage 20-25°, cadrée sur le front de nuit, ou boucle qui finit sur le plan « sunset » (`title/026`, le meilleur). Valider le premier plan après le chargement comme les autres.
- **Vérification** : `PORT=8831 node tools/polish/art/title.mjs` sur 3 graines, plus `tools/e2e/qa/titlecut.mjs`. Sur chaque planche : 0 image avec une tour de plus de 12 % de la largeur, 0 image sans oiseau net, 0 Simoun en gros plan. Regarder chaque planche.

### S5 · sév. 4 · Podium : composition du dernier plan
- **Constat** : le bas du corps des oiseaux perchés est caché par les plaques, les colonnes sont des troncs bruns et l'image reste figée plus de 10 s. La pose, la couronne et le liseré relèvent de birds (B3), l'UI de hostui (H6).
- **Correction** (`camera/podium.ts`, `PodiumStage.tsx`) : placer les oiseaux nettement au-dessus des plaques (`PERCH_ABOVE_PLATE_PX` de 26 à environ 70-90 px, ou tours plus hautes) pour que corps et tête soient entiers. Colonnes en archétype Pile crème, ocre et turquoise (`TowerDef` synthétiques). Pendant les 2,5 s de plan pur avant l'entrée de l'UI (H6), poussée lente sur le vainqueur, puis dérive lente (± 2 % du cadrage) pour que l'image ne soit jamais figée. Si les plaques doivent bouger, Edit ciblé de la seule hauteur des plaques dans `results.css` (§10), avec `PLATE_TOP` et `PLATE_TOP_DENSE` mis à jour ensemble ; le noter dans `ui.md`.
- **Vérification** : podium à 4 (`tools/e2e/podium.mjs` ou `art/match.mjs`) et à 12 (`tools/e2e/qa/podium12.mjs`) : les 3 oiseaux entiers au-dessus des plaques, deux captures à 3 s d'écart différentes, en 1080p et en 3840 × 2160 (`tools/polish/tech/aspects.mjs`).

### S6 · sév. 3 · « Punch-in » sur les touches qui comptent
- **Constat** : le zoom de piqué (8 %) ne se voit plus quand le cadre dépasse 150 m de large. À 12 oiseaux, la caméra reste sur l'arène entière de 6 s jusqu'à la Grande Ombre ; une touche se lit comme deux oiseaux de 45 px. Le brief demande une caméra qui dramatise.
- **Correction** : sur un `diveHit` qui vole la couronne, implique un humain (`gameView.players`) ou vole au moins 1 % de l'arène, largeur × 0,75 et cible décalée vers la paire pendant le ralenti plus 0,5 s, puis retour en ressort. Au plus un toutes les 6 s, jamais dans les 3 dernières secondes. Au-delà de 8 oiseaux, seulement pour la couronne ou un humain. Doit rester compatible avec la contrainte de S1.
- **Vérification** : `feel/match.mjs --name=twelve` et solo : sur la rafale autour d'une touche de couronne, l'envergure des deux oiseaux est au moins 1,3 fois celle d'avant ; au plus un punch-in toutes les 6 s (journal).

### S7 · sév. 2 · Carte des résultats quasi orthographique
- **Constat** : en vue verticale à FOV 40°, les tours des bords se couchent en « saucisses ».
- **Correction** : dans `camera/director.ts`, vue carte à FOV 18-22° prise de plus loin (même emprise) ; garder `mapReady`, la moitié gauche et l'illumination. Exposer le rectangle écran de la carte (dans `cameraBeats` ou `worldView`) pour la planche imprimée de hostui (H14).
- **Vérification** : captures des résultats des manches 1 et 2 : les fûts du bord restent quasi verticaux (≤ 15° d'inclinaison apparente).

---

## 3. WORLD — `src/host/render/**` sauf `bird/` et `fx/`, `public/textures/**` (port 8832)

### W1 · sév. 4 (5 sur une TV 4K) · Plafond de résolution perdu après le premier podium
- **Constat** : R3F rappelle `configure()` à chaque rendu du `<Canvas>` et remet `dpr={1}`. App se rend de nouveau sur `glorySlot` au podium. En Low 1080p, le rendu passe de 1280 × 720 à 1920 × 1080 (3,0 → 6,2 ms GPU) ; en High sur 4K, à 3840 × 2160 (9,8 → 35,6 ms) pour le podium et toute la revanche.
- **Correction** : calculer le dpr dans `WorldCanvas.tsx` à partir du niveau et de la hauteur de fenêtre (écouteur resize) et le passer en prop : `dpr={presetDpr(QUALITY_PRESETS[level], innerHeight, devicePixelRatio)}`. Retirer le `setDpr` de `npr/NprPipeline.tsx`.
- **Vérification** : `node tools/polish/tech/dprcap.mjs --q=low` : canvas en 1280 × 720 au titre, au salon, en manche, au podium et à la revanche ; `--q=high --w=3840 --h=2160` : 1920 × 1080 partout.

### W2 · sév. 4 · Qualité auto : banc avec marge, surveillance GPU au climax
- **Constat** : le banc du titre mesure 9,8 ms pour un seuil de 10, alors qu'une manche à 12 oiseaux coûte 10,6 à 11,1 ms. Le moniteur ne voit que 2 s d'intervalles calés sur la synchro, pendant la montée de caméra, et reçoit un delta non borné.
- **Correction** (`quality.ts`, `npr/NprPipeline.tsx`) : mesure GPU continue pendant les manches (le `benchTimer` existant, une requête TIME_ELAPSED par image, lecture asynchrone). Garder le p90 de l'heure dorée à la Grande Ombre. `qualityMonitor.shouldDowngrade(level)`, dont l'API ne change pas (runner.ts:942 l'appelle aux résultats), rétrograde si p90 > budget × 1,1. High seulement si la médiane du banc est ≤ 8,5 ms. Delta poussé borné à 100 ms. Sans banc mémorisé, chauffe du chargement en Medium.
- **Vérification** : `tools/polish/tech/benchscene.mjs` (marge visible), `bgtab.mjs` et `bgtab.mjs --nohide` (même décision dans les deux cas), `quality.test.ts` étendu et vert.

### W3 · sév. 3 · Budget GPU High à 12 oiseaux ≤ 9,5 ms p90
- **Constat** : High à 12 oiseaux coûte 9,7 ms à midi et 10,6 à 11,1 ms de l'heure dorée à la Grande Ombre (p90 11,4 ms) ; 3 à 7 % d'images à 33 ms au climax.
- **Correction** : SMAA MEDIUM en High (−0,3 ms), rides du sol coupées au-delà d'une distance, pebbles 2 200 → 1 500. Compenser tout coût ajouté par W4 à W13.
- **Vérification** : GPU au calme (gpu_busy < 20 %), `node tools/polish/tech/perfmatrix.mjs --q=high --n=12 --speed=1` : p90 ≤ 9,5 ms à toutes les phases. Tableau avant/après dans `world.md`. `docs/art/tools/highkey.mjs` passe toujours.

### W4 · sév. 4 · Ombres sur la peinture : refroidir sans griser
- **Constat** : une ombre de tour ou une empreinte sur Safran donne `#765B30` (L 0,49, C 0,069, h 78°, olive) ; sur Carmin du marron, sur Corail de la brique. Au couchant, cela couvre la moitié de l'image. Cause : `groundMaterial.ts:404`, `mix(lab.yz, shLab.yz, 0.35)`.
- **Correction** : sur la peinture, ombre calculée en OKLCH : ratio de L conservé, `C × 0,85`, teinte tournée de 25 à 40° vers celle de `castShadow` (≈ 290°, par le chemin court). Même règle pour `tintAB` des empreintes. Garder ΔE ≥ 0,059 entre joueurs sous l'ombre (bible §4.5). Noter l'amendement de la bible (§1.2) dans `world.md`.
- **Vérification** : `node tools/polish/art/sample-oklch.mjs` sur de nouvelles captures d'heure dorée et de couchant (`art/match.mjs`, images 056 et 079) ; porte ajoutée à `docs/art/tools/final.mjs` : aucune ombre sur peinture avec C < 0,08, ni avec h entre 60 et 110° et L < 0,55 ; ΔE entre joueurs sous l'ombre ≥ 0,059.

### W5 · sév. 4 · Bords d'ombre nets : fin des escaliers de texels
- **Constat** : à l'heure dorée et au couchant, bords des ombres de tours et silhouettes d'oiseaux en marches de 8 à 14 px. `groundMaterial.ts:261` ne lisse que si `vDist < 170 m`, alors que la caméra de jeu est au-delà de 170 m tout en cadrant serré. Les longues ombres qui sortent de la cascade proche tombent dans la lointaine (2,1 m/texel).
- **Correction** : choisir le lissage d'après la taille du texel à l'écran (`length(fwidth(p0)) * res / (2*half) < 1`) et non d'après la distance. En mode round, activer la cascade focus (`shadowAreas.focusOn`) sur le rectangle `cameraState.frame` + 20 m (lecture seule depuis camera).
- **Vérification** : recadrages 1:1 à l'heure dorée et au couchant avec 4 oiseaux (`art/match.mjs`, images 124 et 079) : marches ≤ 2 px. Surcoût GPU mesuré ≤ 0,3 ms.

### W6 · sév. 4 · Nuit : on voit ce qui est figé, et la « dernière lumière » (wow W1)
- **Constat** : de part et d'autre de la lèvre de 3 px, le territoire a la même couleur, voire plus saturée côté nuit ; la vague qui fige d'ouest en est ne se lit pas (image la plus forte de la fin de manche selon la bible §4.6).
- **Correction** : pendant la Grande Ombre, côté nuit, lavis à L −0,12 et C × 0,6 (en plus de KF-4), avec la granulation « sec » bien visible. Vague de 0,3 s au passage de la lèvre (liseré papier qui s'éteint). Bande de lumière rasante de 6 à 12 m devant le front (sol et peinture tirés vers `sandLit` KF1, L + 0,06), lèvre de 4 px en 1080p. Rallumage aux résultats par l'illumination §4.7, sans changement. ΔE entre joueurs côté nuit ≥ 0,05.
- **Vérification** : captures à t = 100, 104 et 108 s (feel solo et twelve). Avec `sample-oklch` de part et d'autre du front, pour un même joueur : ΔL ≥ 0,10 et C nuit ≤ 0,6 × C jour. Illumination des résultats intacte.

### W7 · sév. 4 · Tours : des hachures d'encre, pas du papier millimétré
- **Constat** : de près ou à contre-jour, le fût porte une trame verticale et horizontale au pas écran fixe de 6 px, et la tour entière devient brun-taupe (`crop-019-tower.jpg`, `title/010`, `019`, `026`, colonnes du podium). Cause : `towerMaterial.ts:127-133` (h1 + h2 sur toute l'ombre, cavité interpolée sur des segments de plus de 20 m).
- **Correction** : couche croisée limitée aux vrais creux (anneau de sommets 2 à 6 m sous chaque surplomb dans `towerGeometry.ts`, seuil 0,25). Hachures modulées par `hatchTone`, sur une bande le long de la silhouette et du terminateur plutôt qu'en remplissage. Pas de 8 à 9 px et opacité × 0,6 quand le fût dépasse 150 px de large. À contre-jour : aplat ombré plus un filet `sandLit` de 1,5 px côté soleil.
- **Vérification** : recadrages de tours en gros plan au titre (`art/title.mjs`) et au podium : aucun quadrillage régulier visible, filet de lumière à contre-jour. Regarder `sheet-title-*`.

### W8 · sév. 4 · Territoire pâle lisible contre le sol à toutes les heures
- **Constat** : ΔE OKLab entre le pâle et `groundFlat` : Corail KF10 0,032, Prune KF3 0,038, Carmin KF10 0,044, Rose KF10 0,048 (feel mesure même 0,004 à 0,03 en jeu) ; en dessous d'environ 0,06, on lit mal. Cause : `groundMaterial.ts` ~205, `Lp = Lg < 0.66 ? mix(Lg, Ls, .45) : Lg - 0.03`, chroma × 0,55.
- **Correction** : garde par couleur et par keyframe : si ΔE(pâle, sol) < 0,06, pousser L puis C jusqu'à 0,06 (ou pâle à Lg − 0,06 et chroma × 0,7 entre L 0,66 et 0,80). Ajouter la porte « pâle contre sol ≥ 0,05 » à `docs/art/tools/final.mjs` et à `tools/polish/art/pale-vs-ground.mjs`.
- **Vérification** : `node tools/polish/art/pale-vs-ground.mjs` : minimum ≥ 0,06 à toutes les keyframes ; `tools/polish/firsttime/swatches.mjs` : au couchant, bandes pâles de Corail, Carmin et Rose visibles (captures regardées) ; ΔE fort/pâle d'un même joueur et ΔE entre joueurs toujours dans le tableau §3.4.

### W9 · sév. 3 · Tours proches : dissolution en trame
- **Constat** : complément de S3. Même bien cadrées, des sommets passent devant les oiseaux au couchant et au titre.
- **Correction** (`towerMaterial.ts`) : dissolution en trame IGN (screen-door, bible §6.8) des fragments au-dessus de 20 m qui sont à moins de 60 m de la caméra ou recouvrent un oiseau. Les positions écran des oiseaux sont calculées dans world à partir de `gameView` et de la caméra, dans un `useFrame`, sans allocation. Désactivée au podium, où les tours sont des perchoirs.
- **Vérification** : images de couchant (`art/match.mjs`) et de titre : aucun oiseau caché par une masse de tour pleine ; la trame est fixe à l'écran, sans scintillement (rafale de 10 images).

### W10 · sév. 3 · Rideau du Simoun : un aplat, pas un voile
- **Constat** : de près (titre, Grande Ombre côté est), voile brun-rose translucide sur 25 à 35 % du cadre. Cause : `StormCurtain.tsx`, `alpha = 0.7*body + 0.3*edge`.
- **Correction** : aplat opaque, festons découpés en trame (screen-door) plutôt qu'en alpha ; dissolution en trame à moins de 80 m de la caméra ou entre la caméra et les oiseaux.
- **Vérification** : captures de titre (plan équivalent à `title/018`) et de Grande Ombre (`match/134`) : aucun voile translucide, les festons sont nets.

### W11 · sév. 3 · Liseré pointillé des empreintes pâles : des tirets, pas un damier
- **Constat** : `groundMaterial.ts` ~410 produit un damier monde de 2,4 m (blocs bicolores en escalier).
- **Correction** : formule de la bible §5.3 (tirets d'environ 1,8 m le long du bord, rapport 50 %), ou tirets paramétrés par l'angle autour du centre de l'empreinte.
- **Vérification** : recadrage d'une empreinte pâle à l'heure dorée (équivalent de `crop-079-footprint.jpg`) : tirets réguliers le long du bord.

### W12 · sév. 2 · Lavis à mi-distance : l'aquarelle reste vivante
- **Constat** : à l'heure dorée, les grandes zones Safran et Carmin se lisent comme des aplats vectoriels (« tapis de Twister »).
- **Correction** : variation basse fréquence du lavis (± 3-4 % de L, bruit monde de 25 à 40 m) ; liseré d'au moins 3 px et d'au moins 0,8 m monde ; chroma des forts plafonné à 0,12 à l'heure dorée ; « fleurs » d'aquarelle aux départs de traînée si le budget le permet.
- **Vérification** : captures d'heure dorée à 4 et 12 oiseaux regardées ; `highkey.mjs` passe ; tableau ΔE §3.4 inchangé.

### W13 · wow · Du crayonné à la couleur au « 3, 2, 1 » (idée W3)
- **Correction** : pendant le compte à rebours (sim en mode round, `sun.t < 0`), `InkEffect.uFlash` tenu vers 0,5 : la scène est un crayonné. À « Envol ! », la couleur coule d'ouest en est en 0,8 s (masque du front de nuit à l'envers). Tout se fait dans `src/host/render`, en lisant `gameView`. Désactivé par « Réduire les flashs ». À ne commencer qu'une fois W1-W12 terminés.
- **Vérification** : rafale du compte à rebours des manches 1 et 2 (t = −2, 0,2, 0,5 et 1 s) regardée ; coût GPU nul hors compte à rebours.

---

## 4. BIRDS — `src/host/render/bird/**`, `src/host/render/fx/**` (port 8833)

### B1 · sév. 4 · À 9-12 oiseaux, on voit la couleur de chacun
- **Constat** : envergure de 30 à 51 px, bande de couleur de 2 à 3 px, et un cerne qui domine : chaque oiseau devient une croix noir et blanc.
- **Correction** : plafond cosmétique × 1,6 au-delà de 8 oiseaux (Edit ciblé de `src/sim/rules.ts` : nouvelle constante `birdRenderScaleMaxCrowded: 1.6`, rien d'autre). LOD lointain (envergure < 70 px) : bande d'aile à 35-40 % de la demi-aile, cape et selle agrandies, cerne réduit à 1,5 px.
- **Vérification** : `tools/polish/art/twelve.mjs` et `feel/match.mjs --name=twelve` + `read-stats.mjs` : envergure médiane ≥ 60 px ; sur le recadrage × 3, bande de couleur ≥ 6 px et 12 couleurs identifiables ; coût GPU noté.

### B2 · sév. 3 · Traînées fantômes au début de chaque manche
- **Constat** : de longues lignes blanches droites traversent l'arène au compte à rebours et aux résultats (`crop-112-lines.jpg`). `fx/system.ts` ne vide `trail`, `tipL`, `tipR` et `streak` que si l'oiseau disparaît ; au changement de sim, le slot est téléporté.
- **Correction** : mémoriser `view.sim` et tout vider quand elle change ; vider aussi le tampon d'un oiseau qui se déplace de plus de 20 m en une image.
- **Vérification** : captures du compte à rebours des manches 1, 2 et 3 et des résultats : aucune ligne droite ; test ajouté dans `system.test.ts`.

### B3 · sév. 4 · Podium : oiseaux lisibles, couronne sur la tête, gloire contenue
- **Constat** : trois silhouettes gris-bleu en « artichaut » à contre-jour, ailes en V, cou sans tête lisible ; couronne invisible ou grise ; rayons de gloire en rayures grises sur tout l'écran.
- **Correction** : pose `perch` ailes ouvertes à l'horizontale (cormoran qui sèche ses ailes), tête de profil (`pose.ts`, `animator.ts`). En mode perch, liseré de contre-jour de 2 px (couleur du joueur ou `sandLit`) côté soleil et 25 % de remplissage de face (`material.ts`). Couronne ancrée sur la tête, environ 1 m au-dessus de la capuche, non éclairée. Gloire (`Fx`, `glorySlot`) limitée à un disque d'environ 250 px derrière le vainqueur, rayons d'encre à 35 % (bible §6.8).
- **Vérification** : podium à 4 et à 12 (`tools/e2e/qa/podium12.mjs`) : couronne visible sous le bandeau, bandes de couleur lisibles sur les trois oiseaux, aucune rayure plein écran.

### B4 · sév. 3 · Couronne en jeu : portée, dorée, lisible
- **Constat** : la couronne flotte 80 à 340 px au-dessus du meneur (`crownLift` de 3,5 à 5,7 m × échelle jusqu'à 1,3), coupée par le cadre au titre, prise pour un bateau en papier ou un gobelet posé au sol, grise à contre-jour.
- **Correction** : `anchors.ts` : `crownLift = 2,5 + 1,0 × piqué` (bible §6.7 : 3 m), jamais multiplié par l'échelle cosmétique au-delà de 1. Taille écran ≥ 14 px. Aplat `#FFF2C3` non éclairé, cerne de 1,5 px, 3 pointes plus larges que hautes. En gros plan (envergure > 200 px), couronne posée sur la capuche. Aligner `fx/system.ts` (anneau « couronne gagnée », `iconLift`).
- **Vérification** : recadrages à 4 oiseaux (midi et couchant) et au titre : couronne à moins de 40 px au-dessus du cavalier en jeu, jamais coupée au titre, jamais grise.

### B5 · sév. 3 · Au couchant, pas de corbeaux gris
- **Constat** : l'état « caché » mélange 55 % vers `castShadow`. Au couchant, la moitié des oiseaux est cachée en permanence et perd la couleur du joueur.
- **Correction** : pièces colorées gardées à 80 % de leur chroma même cachées ; mélange limité à 35 % quand `paletteElev` < 10 ; liseré de lumière rasante (`sandLit` KF1, 1,5 px) sur le dos côté soleil tant que l'oiseau n'est pas dans la nuit.
- **Vérification** : captures de couchant (`art/match.mjs`, images 129 et 134) : chroma de la bande d'aile d'un oiseau caché ≥ 0,08 (`sample-oklch`), et il se lit toujours « à l'ombre ».

### B6 · sév. 3 · Des effets qui tiennent le gros plan
- **Constat** : au titre et en piqué, bouffées de sable en « biscuits » de 150 à 250 px, ruban de traînée en bâton rigide de 30 px, traînée de clac et lignes de vitesse sur 700 px en diagonale, icône « œil barré » en pleine cinématique.
- **Correction** : particules plafonnées à 60 px à l'écran et rétrécies à moins de 25 m de la caméra (disparition par rétrécissement, §6.8). Ruban de largeur `min(0,35 m, 6 px)`, effilement fort sur ses 30 % finaux, dissolution à moins de 30 m. Lignes de vitesse et traînée de clac bornées à 25 % de la largeur d'écran. Icônes 3D (œil barré, etc.) masquées en mode démo et quand l'envergure dépasse 200 px.
- **Vérification** : `art/title.mjs` sur 3 graines : aucune bouffée de plus de 60 px, aucun ruban de plus de 8 px, aucune icône d'état au titre (planches regardées).

### B7 · sév. 3 · L'esquive se voit
- **Constat** : un raté esquivé ne produit que de petites bouffées ; l'esquiveur n'a aucun signe. C'est le seul geste d'adresse du défenseur.
- **Correction** (`fx/system.ts`, sur `diveMiss` avec `dodged`) : arc d'encre de souffle autour de l'esquiveur (SDF, 0,4 s), 4 à 6 plumes arrachées au chasseur, 3 étoiles au-dessus du chasseur planté (réutiliser le décroché). Lisible à 50 px d'envergure. Le ralenti est fait par game (G4), le son par audio (A7).
- **Vérification** : rafale autour d'une esquive (`feel/match.mjs`, événements `dodged`) : les trois signes sont visibles à 4 et à 12 oiseaux.

---

## 5. HOSTUI — `src/host/ui/**`, `src/shared/strings/host.ts`, `titles.ts`, `public/fonts/**`, `public/ui/**` (port 8834)

### H1 · sév. 4 · Bulles et étiquettes : une passe d'évitement
- **Constat** : sonde firsttime sur 3 manches : 30 bulles sur bulle, 20 bulles identiques en même temps, 552 étiquettes sur étiquette, 58 sur la bannière, 107 et 18 étiquettes et bulles sur la bande de sable, 37 sur le cadran ; 4 bulles à la fois à 12 joueurs ; bulle « Au clac » qui reste après la résolution du piqué. `WorldLayer.tsx` ne contraint que l'axe x.
- **Correction** (`WorldLayer.tsx`, `hud.css`, `viewModel.ts`) :
  - rectangles d'exclusion lus du DOM : cadran, bande de sable et onglet de couronne, bannière, récitatif ;
  - bulles triées en y ; en cas de collision, la bulle passe sous l'oiseau, pointe vers le haut ;
  - au plus 2 bulles sur la TV (le téléphone reçoit toujours son toast) ;
  - même texte à moins de 2 s d'intervalle : une seule bulle portant les jetons des joueurs concernés ;
  - étiquette masquée quand une bulle couvre son ancre ; étiquettes qui se touchent décalées verticalement, avec un trait de rappel vers l'oiseau ;
  - à la résolution d'un piqué (`simEvents` : `diveHit`, `diveMiss`, `diveCancel`), retrait de la bulle d'esquive de la victime.
- **Vérification** : `tools/polish/firsttime/group.mjs` (bloc « chevauchements HUD » du journal) : 0 bulle sur bulle, 0 doublon, 0 bulle sur la bande ou le cadran, étiquettes sur étiquette < 20 ; `tools/polish/tech/netstress.mjs` à 12 téléphones : ≤ 2 bulles ; captures regardées.

### H2 · sév. 4 · Salon : chacun trouve son oiseau et le mannequin
- **Constat** : le téléphone dit « ton oiseau vole sur l'écran » et « plonge sur le mannequin », mais sur la TV 4 à 5 oiseaux blancs de 50 px volent sans étiquette et le mannequin n'est désigné nulle part. En plus d'une minute, aucun joueur piloté n'a coché « Pique ».
- **Correction** (`WorldLayer.tsx`, `host.ts`) : au salon, étiquettes de nom permanentes. Étiquette « Mannequin / Dummy » avec une cible au sol dessinée en DOM (anneau pointillé sous l'ancre). Pulsation de l'étiquette d'un joueur tant que son objectif « Vole » n'est pas coché.
- **Vérification** : capture du salon avec 2 téléphones et le clavier (`tools/polish/firsttime/group.mjs`) : chaque oiseau porte son nom, le mannequin est désigné.

### H3 · sév. 4 · À 9-12 oiseaux : jeton permanent des humains et pourcentage lisible
- **Correction** : au-delà de 6 oiseaux, jeton-glyphe de 18 px permanent sous chaque oiseau humain (mécanisme du jeton daltonien), dans sa couleur. Un appui sur COUP D'AILE pendant les 5 premières secondes fait pulser l'étiquette. `SandBar.tsx` : au-delà de 8 oiseaux, pourcentage des humains dans une étiquette sous leur segment.
- **Vérification** : `tools/polish/art/twelve.mjs` : chaque humain repérable sans événement, pourcentage des humains lisible sur la TV (capture regardée).

### H4 · sév. 4 · Salon : l'URL de déploiement tient dans sa case
- **Constat** : « ou ouvre ombres-011e623351e7.deploy.breizhware.com/play » passe sur 2 lignes coupées et fait grandir la case, qui pousse « Les règles ». C'est l'URL que tout le monde verra en production.
- **Correction** (`Lobby.tsx`, `lobby.css`, `join__url`) : hôte sans schéma sur une seule ligne, taille ajustée à la largeur (22 → 14 px, par `measureText` ou container query), `<wbr>` après chaque point, marge intérieure garantie, hauteur de case fixe.
- **Vérification** : `tools/polish/art/match.mjs` (qui injecte la longue `joinUrl`) : aucun débordement (vérification `scrollWidth ≤ clientWidth`), boîte de même hauteur qu'avec l'URL courte ; captures FR et EN.

### H5 · sév. 3 · Bannières : Grande Ombre brève, aucun doublon
- **Constat** : la bannière « LA GRANDE OMBRE » reste 4,5 s sur le nord de l'arène (`viewModel.ts:674`, `phaseBannerSeconds + 1,5`) ; le nom de phase s'affiche en même temps sous le cadran (« Heure dorée » × 2).
- **Correction** : bannière de la Grande Ombre de 2,5 s au plus, en bandeau fin sous la bande de sable (hors de l'arène). Onglet du cadran seulement quand aucune bannière n'est affichée.
- **Vérification** : captures à 98,5 et 101 s (bannière absente à 101 s) et à 55,5 s (« Heure dorée » affiché une seule fois).

### H6 · sév. 4 · Podium : l'UI laisse respirer le dernier plan
- **Constat** : l'UI couvre environ 60 % du cadre. Le titre se coupe (« CARMIN · » / « GUETTEUR », « REMPORTE LA » / « PARTIE ») ; le récitatif mord sur les cartes ; en cas d'égalité de soleils, le départage n'est pas expliqué ; les plaques disent « Faucon » alors qu'ailleurs le bot s'appelle « Lagon ».
- **Correction** (`MatchResults.tsx`, `results.css`) :
  - 2,5 s de plan pur avant l'entrée de l'UI (délai d'animation du panneau), en accord avec la caméra (S5) ;
  - nom de couleur et caractère sur deux lignes explicites, sans séparateur pendant ; `white-space: nowrap` sur « remporte la partie » ;
  - récitatif placé au-dessus de la grille des titres, avec une marge garantie ;
  - en cas d'égalité de soleils, ligne « Départagés au désert cumulé : 83 % contre 77 % » ;
  - bots nommés « Lagon · Faucon » partout (couleur en grand, caractère en petit) ;
  - en-tête plus compact.
  - Ne pas déplacer les plaques (c'est S5).
- **Vérification** : podium à 4 et à 12 joueurs, en 1080p et en 4K (`tools/polish/tech/aspects.mjs`) : aucune coupure, aucun chevauchement, UI absente pendant les 2,5 premières secondes.

### H7 · sév. 3 · Des règles qui enseignent, et le glossaire EN
- **Constat** : « Trois règles, pas une de plus » promet trop ; la règle des soleils n'est écrite nulle part ; en anglais, « Dive » veut dire deux choses ; l'effet `arrowNorthSouth` de l'heure dorée n'est jamais affiché.
- **Correction** :
  - `host.ts` : « Trois règles pour commencer » ; carte 2 « …Le fort recouvre le pâle. » ; carte 3 « Pique d'en haut : sa traînée devient la tienne. » (et l'équivalent EN) ;
  - `RoundResults.tsx` : sous l'en-tête Soleils, « 1 soleil par oiseau devancé, +1 au vainqueur » (×2 à la dernière manche), avec le calcul animé sur la ligne du joueur au premier affichage ;
  - `Announce.tsx` : afficher `cue.effect` (flèche ↕ ou →) dans la bannière ;
  - glossaire EN (§9) dans `host.ts` et `titles.ts` ;
  - **vérification finale du glossaire** par grep sur `host.ts`, `titles.ts`, `phone.ts`, `hints.ts` et `narrator.ts` (les autres propriétaires corrigent leur fichier ; signaler un oubli dans `REQUESTS.md`).
- **Vérification** : captures des cartes FR et EN et des résultats de manche 1 ; `grep -niE "\\bdive(s|d)?\\b" src/shared/strings/{host,titles}.ts` : ne reste que le bouton ou le vol bas.

### H8 · sév. 3 · Un seul pictogramme d'oiseau pour les règles
- **Constat** : `RuleArt.tsx` dessine un avion de chasse, `src/phone/ui/RulesCards.tsx` un boomerang ; aucun ne ressemble au ptérosaure du jeu.
- **Correction** : créer `src/shared/ruleBird.ts` (nouveau fichier, module pur : tracé SVG vue de dessus, ailes en M tendu, long cou et bec, queue en éventail, viewBox 0 0 100 100), l'utiliser dans `RuleArt.tsx`, puis Edit ciblé de `src/phone/ui/RulesCards.tsx` pour y remplacer le seul dessin de l'oiseau par cet import (§10). Les couleurs et coupures de ce fichier relèvent de phone (P5).
- **Vérification** : captures des cartes sur PC et sur iPhone (`art/match.mjs`, images 013 et 014) : même oiseau, reconnaissable.

### H9 · sév. 3 · Joueur au clavier : aide, touches, cartouche
- **Constat** : une fois entré, le joueur au clavier n'a aucune aide sur ses touches. Le tableau des touches des Réglages est mal aligné (« ou ← ↑ ↓ → » sous Joueur 2, « Plein écran F » dans la colonne du J2). Les touches du J2 s'affichent « ; » et « AltGr ». Au titre, le cartouche « Clavier 1 dans la partie » chevauche le logo.
- **Correction** : `Lobby.tsx` (`KeyboardJoinHint`) : une fois un groupe entré, carte de ses touches (`localButtonLabels` et directions) avec l'objectif suivant et « Échap : quitter » (comportement fait par game, G7). `Settings.tsx` : ligne dédiée « ou flèches (joueur seul) », ligne Plein écran séparée, touches en cartouche avec des noms lisibles (« Point-virgule », « Alt droit ») via `keys.ts`. `Title.tsx` : cartouche placé sous la case du pitch.
- **Vérification** : `tools/polish/firsttime/keyboard.mjs` : captures du salon après Espace, des Réglages et Touches, et du titre après Échap, regardées.

### H10 · sév. 3 · Écran titre : QR discret pour les groupes sans clavier
- **Constat** : un téléphone qui arrive au titre ouvre déjà le salon, mais le titre n'affiche ni QR ni code. Un groupe sur un canapé sans clavier à portée ne peut pas commencer.
- **Correction** (`Title.tsx`, `title.css`) : petit QR avec le code dans le pied de page, « Scanne pour jouer / Scan to play », en case papier opaque. Il ne doit pas gêner la cinématique (zone réservée connue de staging : pied de page).
- **Vérification** : capture du titre ; scanner l'URL du QR (décodée dans le script) mène au profil.

### H11 · sév. 3 · Les résultats s'entendent
- **Constat** : le décompte des parts et le vol des soleils sont muets. L'API prévoit `playUi('count')` et `playUi('sun')`, mais rien ne les appelle.
- **Correction** : `nav.ts` : `NavSound` += `'count' | 'sun'` (le runner les route déjà vers `playUi`). `RoundResults.tsx` : `count` à 10-12 Hz pendant `COUNT_MS`, `sun` (valeur = rang) à l'arrivée de chaque `FlyingSun`. Les niveaux sont réglés par audio (A7).
- **Vérification** : journal audio d'une manche (`tools/polish/audio/record-game.mjs` ou `?debug`) : appels `count` et `sun` pendant les résultats.

### H12 · sév. 2 · Voiles et fondus « planche », pas « template web »
- **Constat** : voile d'encre à 42 % sur le sable chaud, qui donne un brun boueux derrière les règles, la pause et les réglages ; pied du titre en pilule translucide ; « Appuie sur une touche » qui respire en opacité ; case des règles du salon vide entre deux cartes ; panneau des résultats encore à mi-opacité quand le « 3 » suivant apparaît.
- **Correction** : `.veil` (`styles/base.css:392`) en voile papier `#F7F0E3` à 55 % (effet calque). Pied de titre en case papier opaque ; respiration par un déplacement de ± 3 px. Changement de carte des règles par essuyage d'encre (clip-path), sans case vide. Panneau des résultats sorti en moins de 200 ms.
- **Vérification** : captures des règles, de la pause, du titre et de la transition résultats → compte à rebours.

### H13 · sév. 2 · Textes, noms et petits défauts
- **Correction** :
  - salon : bots « Azur · Faucon » ; descriptions de bots à la ligne au lieu de l'ellipse ;
  - résultats : plus de « Indigo · Laboure… » tronqué (`results.css`) ;
  - statistiques : « Repris aux autres (cumulé) », « après-midi » insécable, « pts d'avance », phrase du Bâtisseur alignée FR et EN ;
  - maladresses FR et EN des rapports firsttime et feel (`host.ts`, `titles.ts`) : « Change personality », une seule orthographe EN, noms EN sans accent, « C'est Brieuc qui lance la partie », « Dernière manche ×2 », phrase de pause distincte de « Dix secondes » ;
  - crédits : section voix traduite en EN, « CC BY 4.0 » uniforme, sous-section « Instruments échantillonnés » (`credits.ts`) ;
  - chargement : SVG dessiné sans attendre les polices, logotype en petit (`Loading.tsx`).
- **Vérification** : captures du salon à 12, des résultats, du podium EN, des crédits FR/EN et des premières images du chargement ; balayage des clés brutes (`rawKeys` de `tools/e2e/qa/lib.mjs`) à 0.

### H14 · wow · La carte des résultats devient une planche imprimée (idée W2)
- **Correction** : autour de la carte (rectangle exposé par staging, S7), marge papier, cadre d'encre tremblé, cartouche « Les Parasols — manche 1 », rose des vents, échelle en mètres, tampon à la couleur du vainqueur. DOM et SVG seulement.
- **Vérification** : captures des résultats des manches 1 à 3, regardées.

### H15 · wow · Le logo vivant (idée W4)
- **Correction** : `Logo.tsx` : les ombres des lettres suivent l'azimut et l'élévation du soleil de la démo (`worldView`) ; au coucher de la démo, longues ombres violettes. Mise à jour ≤ 10 Hz.
- **Vérification** : 3 captures du titre à des heures de démo différentes.

---

## 6. PHONE — `src/phone/**`, `src/net/**`, `src/shared/messages.ts`, `src/shared/strings/phone.ts` (port 8835)

### P1 · sév. 3 · Salon : la carte des règles sort de la zone de pilotage
- **Constat** : le bord droit de la carte touche ou passe sous COUP D'AILE (920 px² de recouvrement mesurés) ; le socle du joystick la recouvre dès qu'on pilote ; un toast « RATÉ… » coupé reste en fantôme sur le panneau des objectifs. Cause : `phone.css` `.lobby-rules` (absolu, `translateX(-62%)`, 190 px / 30vw, sans réserve pour `.stick-zone` ni `.act`).
- **Correction** : carte en bandeau fin sous les objectifs, ou dans la colonne centrale bornée entre les deux zones de contrôle. Fondu en 150 ms tant qu'un pointeur est posé. Toasts au-dessus du bandeau, jamais sous un panneau, sans fantôme.
- **Vérification** : `tools/polish/art/phones.mjs` et `firsttime/phonegallery.mjs` (iPhone 15 Pro, Pixel 7, 568 × 320) : 0 px² entre `.lobby-rules` et `.act` ou la zone du socle (`getBoundingClientRect`) ; captures au repos et en pilotage.

### P2 · sév. 3 · PIQUER : l'étoile reste dans l'écran
- **Constat** : `.act__star`, avec son `inset` de −14 % et son animation à `scale(1.06)`, déborde de +25/+31 px sur iPhone 15 Pro, +8/+14 px sur Pixel 7 et +19 px sur iPhone SE ; un rayon croise COUP D'AILE ; « TOUCHÉ ! » se pose sur COUP D'AILE.
- **Correction** : rayons contenus dans le disque (`inset` −6 %, rayons de 38 à 47 sur 100), étoile tournée de 22,5° pour qu'aucun rayon ne vise COUP D'AILE, `overflow: hidden` sur la zone des actions si besoin. « TOUCHÉ ! » en haut au centre.
- **Vérification** : sortie JSON de `tools/polish/art/phones.mjs` : boîte de l'étoile dans le viewport sur les 3 formats, aucune intersection avec `.act--flap` ; captures de l'état cible.

### P3 · sév. 3 · Petits écrans paysage (320 à 360 px de haut)
- **Constat** : à 568 × 320, COUP D'AILE couvre le texte de l'objectif, « Pouce ici » est coupé et « Compris ! » sort de l'écran (bas à 332 px).
- **Correction** : `@media (max-height: 360px)` : boutons plus petits, cartes en une colonne qui défile, « Compris » fixé en bas.
- **Vérification** : `firsttime/phonegallery.mjs` à 568 × 320 et 667 × 340 : tout le texte et tous les boutons à l'écran (mesure et captures).

### P4 · sév. 2 · « Réduire les flashs » s'applique aussi aux téléphones
- **Constat** : `PhoneView` ne transporte que `colorblind` ; le téléphone garde l'éclair du clac, la bordure rouge pulsée et l'éclair du bandeau. Sur le PC, le défaut ignore `prefers-reduced-motion`.
- **Correction** : `reduceFlashes?: boolean` dans `PhoneView` (`messages.ts`), rempli dans `src/host/runner/views.ts` (Edit ciblé, §10). Classe `.reduce-flash` dans `src/phone/App.tsx`, qui neutralise `flash-border`, `.band.is-flash` et l'éclair du clac. Défaut PC de `reduceFlashes` pris de `matchMedia('(prefers-reduced-motion: reduce)')` (Edit ciblé de `src/host/settings.ts`, §10).
- **Vérification** : `npx vitest run src/net` vert ; capture du téléphone pendant une prise d'élan, avec et sans le réglage.

### P5 · sév. 2 · Typographie et textes du téléphone
- **Correction** :
  - Averia seulement pour les nombres (`GameScreens.tsx:312`, compteurs de votes ; même principe que `useTn`), le reste en Patrick Hand SC ;
  - « 0 soleil » ; rang et « sur N » regroupés ;
  - portrait : « Prendre mon envol » après le choix de couleur (`ProfileScreen.tsx`) ;
  - `RulesCards.tsx` : coupures de lignes (`sentenceLines`) et illustrations à la couleur du joueur (ne pas toucher au dessin de l'oiseau, remplacé par hostui en H8) ;
  - glossaire EN (§9) dans `phone.ts`.
- **Vérification** : captures fin de partie gagnant et perdant, profil en portrait et cartes (iPhone 15 Pro), FR et EN.

### P6 · sév. 2 · Voiles papier sur le téléphone
- **Correction** : pause et reconnexion en voile papier `#F7F0E3` à 55 % au lieu du voile kaki (même règle que H12).
- **Vérification** : captures pause et reconnexion.

### P7 · wow · Le téléphone du vainqueur (idée W6)
- **Correction** : écran de fin de partie du vainqueur : son lavis couvre le fond en 1,5 s (front mouillé), gloire d'encre tournante, vibration en roulement de tambour (respect de « Réduire les flashs ») ; les autres voient leur pourcentage s'écrire à la plume.
- **Vérification** : captures en rafale de l'écran de fin (gagnant et perdant) ; vibrations journalisées.

---

## 7. GAME — `src/sim/**`, `src/bots/**`, `src/host/runner/**`, `src/input/**`, `src/director/**` (sauf `narrator.ts` et `lines.ts`, confiés à audio), `src/host/App.tsx`, `src/host/main.tsx`, `src/host/loading/**` (port 8836)

### G1 · sév. 4 · Solo : les bots mettent la pression dès l'après-midi
- **Constat** : aucun bot ne pique pendant les 40 à 50 premières secondes (`styles.ts:136`, `huntFrom = 40`, alors que le GDD §3 place les premiers piqués à l'après-midi, dès 15 s). En headless, Voyageur : 1,3 piqué par manche sur l'humain ; Oisillon : 0,2, et 83 % des manches sans aucun piqué sur lui. `defaultBots(1)` ne compte qu'un chasseur.
- **Correction** :
  - **d'abord réparer l'outil** `tools/e2e/qa/pilot.mjs` (et `tools/polish/feel/pilot.mjs` s'il copie la méthode) : pour relâcher un doigt, envoyer `touchEnd` vide puis `touchStart` avec les points restants (vérifié par le lead, `tools/polish/lead/release-check.mjs`), pour PLONGER comme pour COUP D'AILE ;
  - `huntFrom` 40 → 15 s, avec un appétit réduit avant 40 s ;
  - `defaultBots(1)` : Pie à la place du Nomade ;
  - en Oisillon, l'humain peut être visé au moins une fois toutes les 25 s, par un piqué lent et mal engagé.
- **Vérification** : `npx tsx tools/polish/feel/bot-pressure.ts --rounds=12 --policy=low` : en Voyageur, premier piqué de bot avant 25 s en médiane et au moins 2,5 piqués par manche sur l'humain ; en Oisillon, au moins 1 piqué par manche sur l'humain. `solo-sweep.ts --rounds=24` : profil « mixte » en Voyageur entre 50 et 75 % de victoires. Puis `tools/e2e/qa/group.mjs` avec les pilotes réparés : les stats « En bas » ne sont plus à 100 %. Si le Faucon gagne encore 3 manches sur 3 avec 2-3 humains, remplacer le Faucon par la Pie dans `defaultBots(3)` et le noter.

### G2 · sév. 3 · Des feintes lisibles
- **Constat** : `brain.ts:625` relâche la feinte 0,05 à 0,13 s après la prise d'élan : 48 % des piqués de Seigneur sont annulés en moins de 0,2 s. La cible reçoit bordure rouge, « ! » et vibration pour rien, et la feinte ne peut même pas appâter un humain.
- **Correction** : feinter pendant la chute guidée, 0,35 à 0,55 s après la prise d'élan (juste avant le clac), avec un redressement visible. Taux Seigneur ramené à 35 % des piqués lancés.
- **Vérification** : `bot-pressure.ts` : 0 feinte de moins de 0,2 s ; taux de feinte Seigneur entre 30 et 40 % ; `npx vitest run src/bots` vert.

### G3 · sév. 3 · Les indications arrivent au bon moment
- **Constat** : « Ombre de tour… » s'affiche dans les 3 dernières secondes ; « Au clac » se déclenche sur une feinte annulée 0,1 s après, est consommée, et ne revient pas au premier vrai clac.
- **Correction** (`src/director/hints.ts`) : aucune bulle individuelle à partir de `sun.phase === 'greatShadow'`. « dodge » mise en file à la prise d'élan, affichée seulement au `diveCommit`, et pas marquée vue si le piqué est annulé. Le retrait visuel de la bulle à la résolution du piqué est fait par hostui (H1).
- **Vérification** : cas ajoutés dans `hints.test.ts` (feinte annulée, puis vrai clac : l'indication s'affiche au clac) ; journal d'une manche solo (sonde de `tools/e2e/qa/probe.mjs`) : aucune bulle après 98 s.

### G4 · sév. 3 · Hiérarchie des impacts : un flash rare, un ralenti d'esquive
- **Constat** : chaque `diveHit` blanchit l'écran (11 fois par manche à 12 oiseaux), même pour +0,1 % ; le raté esquivé n'a ni ralenti ni signe.
- **Correction** (runner, sur `diveHit` → `requestPlancheFlash`) : flash seulement pour une touche de couronne, une touche impliquant un humain, ou un vol ≥ 1 % de l'arène (`stolenCells / grid.arenaCells`) ; au plus un toutes les 6 s. Sur `diveMiss` avec `dodged` impliquant un humain : ralenti à 0,6× pendant 0,2 s, soumis à `hitSlowmoMinGap`. Visuels : B7 ; son : A7.
- **Vérification** : manche à 12 oiseaux (`feel/match.mjs --name=twelve`) : au plus 4 flashs, chacun justifié dans le journal ; ralenti d'esquive visible dans une rafale solo.

### G5 · sév. 3 · Rechargement du PC : les téléphones gardent leur écran
- **Constat** : pendant le chargement du PC, `phoneView()` (`views.ts`) traite `boot` comme le salon : objectifs décochés, carrousel, « Lancer la partie » pendant 1,5 à 33 s, en manche, aux résultats et au podium.
- **Correction** : mémoriser `snapshot.phase` dans `restoreEarly`. Pendant le boot, vue de l'écran sauvegardé (play, roundEnd ou matchEnd) avec `paused: { by: null, canResume: false }`. Si un libellé dédié est indispensable, une seule clé dans `phone.ts` (Edit ciblé, §10).
- **Vérification** : `tools/polish/tech/phonereload.mjs` et `refresh.mjs` : la chronologie du téléphone ne passe jamais par le salon, en manche, aux résultats ni au podium.

### G6 · sév. 3 · Plus jamais d'écran blanc
- **Constat** : sans WebGL2, `#root` reste vide sur un fond crème alors que la salle est créée ; aucune ErrorBoundary dans `src/`.
- **Correction** : `main.tsx` : test `getContext('webgl2')` avant de monter `<App/>` ; sinon, écran explicatif (« Ombres a besoin de WebGL 2 : active l'accélération matérielle ») sans démarrer la salle. ErrorBoundary autour de `<WorldCanvas>` et de `<UiRoot>` avec « Recharger » (la sauvegarde restaure la partie). Edits ciblés (§10) : 3 à 4 clés dans `host.ts`, ErrorBoundary autour de `<PhoneApp/>` dans `src/phone/main.tsx`.
- **Vérification** : `tools/polish/tech/nowebgl.mjs` : message visible, pas de salle créée ; exception forcée derrière `?debug` : bouton « Recharger » visible, puis reprise de la partie.

### G7 · sév. 3 · Clavier au salon : sortir, revenir, lire ses touches
- **Constat** : Échap et Retour arrière au salon renvoient au titre (`Lobby` → `uiActions.back()`) même avec des joueurs ; les téléphones restent sur « Lancer la partie » ; le joueur au clavier ne peut pas quitter ; les libellés du J2 sont « ; » et « AltGr ».
- **Correction** (runner, `uiActions.back`, `src/input/labels.ts`) :
  - Échap au salon retire d'abord le dernier joueur clavier (toast) ;
  - s'il reste des téléphones, second Échap dans les 2 s pour revenir au titre (toast de confirmation), et vue des téléphones mise à jour ;
  - Retour arrière ne quitte plus le salon ;
  - `keyLabel` : noms lisibles (« Point-virgule », « Alt droit ») ou libellé principal « Entrée du pavé » en QWERTY. L'affichage en cartouche est fait par hostui (H9).
- **Vérification** : `tools/polish/art/screens.mjs` et `tools/polish/firsttime/keyboard.mjs` : journal « après Échap : lobby » avec clavier ; téléphone après le retour du PC au titre, sur un écran d'attente cohérent.

### G8 · sév. 3 · Des toasts de connexion justes
- **Constat** : « Corail rejoint le désert » part avant le profil, avec la couleur provisoire (`runner.ts` `addPhonePlayer` ~1119). Sur un Wi-Fi instable, « X a perdu la connexion » tombe 5 fois en 12 s.
- **Correction** : toast « rejoint » déplacé dans `hub.on('profile')` à la première validation. Au plus un toast « a perdu la connexion » par joueur toutes les 20 s, ou seulement après plus de 1,5 s d'absence cumulée sur 5 s.
- **Vérification** : journal de `firsttime/group.mjs` : « Safran rejoint » pour Brieuc ; section « clignotement court » de `tech/netstress.mjs` : au plus 1 toast en 12 s.

### G9 · sév. 3 · Le piqué doit payer (essai A/B mesuré)
- **Constat** : hors couronne, une touche vole 0,1 à 1 % de l'arène. En headless, le profil « chasseur » gagne 63, 21 et 8 % des manches (Oisillon, Voyageur, Seigneur), contre 96, 75 et 46 % pour le profil « mixte ».
- **Correction** : essai dans `rules.ts` : `trailStealSeconds` 1,5 → 2,5 et `trailStealCrownSeconds` 3 → 4. **Ne garder que si** `tools/bots-arena.ts` et `solo-sweep.ts` donnent un profil chasseur à moins de 10 points du mixte et aucun caractère au-dessus de 35 % à 6 Voyageurs ; sinon, revenir aux valeurs actuelles. Consigner les chiffres dans `sim.md`.
- **Vérification** : tableaux avant/après de `solo-sweep.ts --rounds=24` et `bots-arena.ts` ; `npx vitest run src/sim` vert.

### G10 · sév. 2 · Titres et faits marquants
- **Constat** : « Le Kamikaze » est donné au meilleur chasseur (7 touches, 0 subie), et « Le Rapace » à personne ; le champion peut recevoir « Sans titre » ; « Raz-de-marée » revient aux 3 manches.
- **Correction** : `matchTitles` : titres positifs attribués d'abord (Rapace si touches ≥ 2 × la moyenne) ; aucun titre négatif du même domaine à celui qui y domine. Titre de repli garanti pour le vainqueur (clé de repli dans `titles.ts`, Edit ciblé si elle n'existe pas, §10). Un fait marquant ne se répète jamais dans une partie.
- **Vérification** : cas ajoutés dans `match.test.ts` ; podium de `feel/match.mjs --name=solo-default`.

### G11 · sév. 2 · Onglet du PC en arrière-plan : pause
- **Correction** : `visibilitychange` → `hidden` pendant une manche non terminée : `this.pause(-1)`, pour que les téléphones affichent la pause. Au retour, reprise avec « 3, 2, 1 ».
- **Vérification** : `tools/polish/tech/bgtab.mjs` : vue du téléphone en pause, reprise avec compte à rebours.

### G12 · sév. 2 · Chargement : un 100 % honnête
- **Constat** : `warmUp()` affiche 100 % dès 30 images, puis attend jusqu'à 20 s des images stables.
- **Correction** (`loader.ts`) : barre à 95 % au bout de N images, 100 % seulement quand c'est stable ; délai limite de 6 s. La chauffe en Medium sans banc mémorisé est faite par world (W2).
- **Vérification** : `tools/polish/tech/loadtrace.mjs` sous charge : pas de 100 % tenu plus de 1 s.

---

## 8. AUDIO — `src/host/audio/**`, `public/audio/**`, `tools/tts/**`, `src/shared/strings/narrator.ts`, `hints.ts`, plus `src/director/narrator.ts` et `lines.ts` par délégation (port 8837)

### A1 · sév. 4 · Les répliques des résultats et du podium ne sont plus couvertes par leur stinger
- **Constat** : la réplique du vainqueur démarre avec `playStinger('gameWin')` (harpe, gong, tongue drum, cri de buse), et le bus UI n'est pas ducké. Rapport parole/reste de 2,9 à 3,9 dB, pire fenêtre −6,6 à −8,5 dB ; Whisper entend « Anis, le désert riche en racette couleur ». Même collision aux résultats de manche. Au passage au podium, le niveau monte 8 dB au-dessus du climax.
- **Correction** : Edits ciblés dans `runner.ts` (§10) : dans `showMatchPanel()`, le stinger puis la réplique 2,2 s plus tard ; dans `showRoundResults()`, le stinger au dévoilement puis la réplique 1,5 s plus tard. `engine.ts` `duck()` : bus UI ducké de −6 dB. `sounds.ts` : `st_game_win_*` à −6 dB, entrées étalées.
- **Vérification** : `tools/polish/audio/record-game.mjs` puis `analyze.py` et `zoom.py` au podium : parole/reste ≥ 8 dB, pire fenêtre de 400 ms ≥ 0 dB, podium ≤ Grande Ombre + 2 LU ; `transcribe.py` : nom du champion correct.

### A2 · sév. 3 (4 à 12 oiseaux) · Le ducking baisse ce qui masque vraiment la voix
- **Constat** : `duck()` ne baisse que musique et ambiance ; à 12 oiseaux, les bruitages forment 68 à 84 % du masque entre 1 et 4 kHz (parole/reste médian ≈ 0 dB) ; Whisper se dégrade sur 14 répliques sur 40.
- **Correction** (`engine.ts`) : ducking de −5 dB sur `buses.sfx` et `sfxSendVol` (80/400 ms) ; filtre en cloche sur le monde pendant la voix (2,5 kHz, Q 0,8, 0 → −4 dB) ; voix −2 dB pour réduire les sauts de sonie.
- **Vérification** : enregistrement à 12 oiseaux + `bands.py` : parole/reste médian ≥ +6 dB entre 1 et 4 kHz ; CER Whisper sur le mix ≤ 1,5 × celui des clips seuls.

### A3 · sév. 3 · Narrateur : une fin de manche qui respire, des ouvertures dégagées
- **Constat** : Grande Ombre, puis « Dix secondes », puis photo-finish : 3 répliques en 6,4 s, qui recouvrent le « 5, 4 ». « Le dernier soleil vaut double » tombe sur le 3-2-1 et le riser. Les ouvertures tombent sur la conque.
- **Correction** : `src/director/narrator.ts` et `lines.ts` (délégation, game n'y touche pas) : pas de `tenSeconds` si `greatShadow` a fini il y a moins de 4 s (ou fusion en une réplique courte) ; `photoFinish` décidé vers 101-102 s × T/110 et seulement s'il finit avant `lastSecondsAt` − 0,2 s ; réplique d'ouverture à t ≈ 1,5 s × T/110. Edit ciblé dans `runner.ts` (§10) : `lastRound` dit dans `continueResults()`, compte à rebours retardé de la durée du clip. `sounds.ts` : `st_last_round` avec `align { peakAt: RULES.countdownSeconds }` ; `count_conch` : durée 2,5 s, release 1 s.
- **Vérification** : enregistrement de 3 manches : narrateur ≤ 3 s de parole dans les 13 dernières secondes, aucune réplique sur les coups de bois ni sur la conque (`zoom.py`) ; `npx vitest run src/director` vert.

### A4 · sév. 3 · À 12 oiseaux, des bruitages hiérarchisés
- **Constat** : 8 à 13 sons/s (pointes à 33) ; le COUP D'AILE des bots est le premier contributeur ; un même souffle sert 5 sons ; « tsk » à 3,9/s.
- **Correction** (`sfx.ts`, `sounds.ts`) : bots −5 dB sur les sons de lit (`flap_strong`, `flap_whoosh`, `flap_climb`, `dive_down`, `tsk`, `tower_*`) ; atténuation de −10·log10(n/6) dB au-delà de 6 oiseaux ; plafond global de 3 « tsk » par seconde ; 3-4 variantes de souffle pour `flap_whoosh`, fichiers distincts pour `dive_down` et `hidden_in` (à prendre dans les assets existants, licences notées dans `CREDITS-sources.md`).
- **Vérification** : `analyze.py` sur un enregistrement à 12 oiseaux : `flap_strong` n'est plus le premier contributeur ; bruitages et musique à ± 2 LU à midi (avec A5).

### A5 · sév. 3 · Musique : audible à midi, un titre qui démarre, moins de redites
- **Constat** : midi et après-midi sont 5 à 9 LU sous les bruitages ; le titre est 6 à 8 LU sous le reste (13 s d'intro quasi muette) ; boucle de salon de 24,5 s ; résultats toujours depuis 0 s.
- **Correction** : +4 dB sur les couches de midi et d'après-midi (`music/score.ts`, `instruments.ts`). `START_AT.title_zhelanov_ambient_1 = 13`, +2 dB sur cette piste. Départ des résultats décalé selon l'index de manche (0, 32, 64 s, sur des débuts de phrase). Salon : alternance de deux boucles ou variante plus longue.
- **Vérification** : `lufs.py` : titre à 3 LU au plus du salon ; musique à ± 2 LU des bruitages à midi (12 oiseaux) ; deux résultats de suite qui ne commencent pas pareil.

### A6 · sév. 3 · Salon et cartes plus calmes
- **Constat** : au salon, les bruitages (−26,5 LUFS) passent au-dessus de la musique ; un sub-drop toutes les 1,5-2,5 s entre bots ; 14,5 sons/s derrière les cartes des règles.
- **Correction** (`sfx.ts`) : profil salon à −8 dB. Au salon, `bigSteal`, `victim_cry`, `stun_tumble` et `dive_boom` seulement si un humain est en cause (garder la touche, retour de l'objectif « Pique »). Écran « intro » : −8 dB de plus.
- **Vérification** : enregistrement du salon et des cartes : bruitages ≤ musique − 3 LU ; sub-drops ≤ 1 toutes les 10 s sans humain en cause.

### A7 · sév. 3 · Accents : couronne, gros vol, esquive, dernières secondes, résultats
- **Constat** : émergence du changement de couronne −0,7 dB, du gros vol −0,3 dB, de « dix secondes » −0,8 dB, de l'esquive −0,3 dB ; coups de bois « 5-4-3 » décalés de 150 à 290 ms du battement de cœur (flams).
- **Correction** (`sfx.ts`, `music/score.ts`) :
  - cloche de couronne, gros vol et dernières secondes : +3 à +5 dB, avec un creux de musique (−3 dB, 250 ms) ;
  - esquive : +4 dB, creux de 200 ms ;
  - dernières secondes jouées par la partition, quantifiées sur le battement (`RoundMusic.onEvent('lastSeconds')`) ;
  - sons `count` et `sun` des résultats (câblés par hostui, H11) à −6 dB, en gamme montante, après la réplique.
- **Vérification** : `tools/polish/feel/audio-listen.py` : couronne et esquive ≥ +3 dB d'émergence ; écart coups de bois / battement ≤ 40 ms.

### A8 · sév. 3 · La voix n'est jamais coupée
- **Constat** : au climax à 12 oiseaux, l'horloge audio décroche (0,57 à 0,97 × le temps réel) ; « Dix secondes » a interrompu la réplique de la Grande Ombre, dont le sous-titre a été retiré 1 s trop tôt.
- **Correction** : `NarratorPlayer.play()` attend la fin d'une voix à qui il reste moins de 0,8 s au lieu de la couper, et ne retire le sous-titre qu'à la fin réelle de la voix. Moins de nœuds créés : pas de `flap_climb` pour les bots hors cadre, `maxTotalVoices` 48 → 24 pendant la Grande Ombre.
- **Vérification** : `tools/audio-cpu.mjs --probe=round:99` à 12 oiseaux (charge audio en baisse, chiffres notés) ; enregistrement de 3 manches : aucune réplique interrompue (journal `subtitleEvents`).

### A9 · sév. 3 · Répliques de soleil aux manches 4 et 5, et graine variable
- **Constat** : `golden` et `sunset` n'ont que 3 variantes sans `reuse` : les manches 4 et 5 restent muettes pendant 80 s. La graine fixe `0x0b5e` fait dire les mêmes répliques à chaque session.
- **Correction** : `lines.ts` : `reuse: true` sur `golden` et `sunset` (la moins récente revient). Graine de partie passée au `NarratorDirector` (Edit ciblé de `runner.ts`, §10), ou `reseed(matchSeed)` dans `startMatch()`.
- **Vérification** : `npx vitest run src/director` (test : 5 manches, chacune a sa réplique `golden`) ; deux sessions donnent des tirages différents.

### A10 · sév. 3 · Des indications sans jargon
- **Correction** (`src/shared/strings/hints.ts`) :
  - « Au clac : COUP D'AILE ! » → « Il plonge sur toi : COUP D'AILE ! » (EN « Incoming strike: WINGBEAT! ») ;
  - heure dorée : « Vole nord-sud, en travers de ton ombre : elle balaie large. » ;
  - couronne : « Piquer le porteur de la couronne rapporte double. » (EN « Strike the crown bearer: double steal. ») ;
  - glossaire EN (§9) dans `hints.ts`.
  - Les répliques voisées du narrateur ne changent pas.
- **Vérification** : `npx vitest run src/director` (`text.test.ts`) ; captures d'une bulle d'esquive et de la bannière d'heure dorée FR et EN.

### A11 · sév. 2 · Accords faux
- **Constat** : carillon du salon (`amb_chimes_loop`) en fa −24 cents sous une boucle en sol majeur ; `ui_pluck` en la sur un titre en mi♭ mineur.
- **Correction** : réaccorder le carillon (ou le remplacer par des lames en sol pentatonique), ou le retirer sous la boucle du salon (`ambience.ts:325`) ; transposer `ui_pluck` quand l'écran audio vaut `title`.
- **Vérification** : `tools/polish/audio/keys.py` : aucune couche hors de la tonalité de l'écran.

### A12 · sév. 1 · Doublons et silence de nuit
- **Correction** :
  - stinger pause/reprise joué une seule fois (retirer l'appel en double dans `audio/index.ts:111`, ou `runner.ts:1040` en Edit ciblé) ;
  - `continueResults(byPlayer)` : `confirm` seulement sur un geste de joueur (Edit ciblé de `runner.ts`, §10) ;
  - nuit : toutes les couches à OFF pendant 1,3 s avant les grillons, et rattrapage des compresseurs compensé pour que le « silence » en soit un.
- **Vérification** : journal B : un seul `st_pause` ; aucun `ui_confirm` sans geste ; master sous −50 dBFS pendant 1,3 s à la nuit.

---

## 9. Glossaire EN (commun à hostui, phone, audio)

| Sens | FR | EN |
|---|---|---|
| Bouton maintenu, vol bas | PLONGER, « En bas » | DIVE (hold), « Low » |
| Attaque sur un autre oiseau | piquer, piqué(s), PIQUER | strike, strikes, STRIKE (« Strike from above », « Easier strikes », « Strikes », « strikes landed », « dodged {n} strikes ») |
| Esquive | COUP D'AILE | WINGBEAT |

Chaque propriétaire l'applique dans son fichier de chaînes (host et titles : hostui H7 ; phone : P5 ; hints : A10). hostui fait le grep final.

## 10. Edits ciblés autorisés hors périmètre

| Correcteur | Fichier | Seule modification permise |
|---|---|---|
| staging (S5) | `src/host/ui/screens/results.css` | hauteur des plaques du podium, si les oiseaux ne tiennent pas autrement |
| world | aucun | — |
| birds (B1) | `src/sim/rules.ts` | ajout de `birdRenderScaleMaxCrowded: 1.6` |
| hostui (H8) | `src/shared/ruleBird.ts` (nouveau), `src/phone/ui/RulesCards.tsx` | remplacer le dessin de l'oiseau par l'import partagé |
| phone (P4) | `src/host/runner/views.ts`, `src/host/settings.ts` | remplir `reduceFlashes` dans la vue ; défaut selon `prefers-reduced-motion` |
| game (G1, G5, G6, G10) | `tools/e2e/qa/pilot.mjs`, `tools/polish/feel/pilot.mjs` ; `src/shared/strings/phone.ts` ; `src/shared/strings/host.ts` ; `src/phone/main.tsx` ; `src/shared/strings/titles.ts` | relâchement des doigts ; 1 clé « l'écran se recharge » si nécessaire ; clés WebGL et erreur ; ErrorBoundary autour de PhoneApp ; clé du titre de repli |
| audio (A1, A3, A9, A12) | `src/host/runner/runner.ts` ; `src/director/narrator.ts`, `src/director/lines.ts` | décalage réplique/stinger (showMatchPanel, showRoundResults) ; `lastRound` dans continueResults ; `confirm` seulement sur geste ; graine du narrateur ; règles de fréquence et reuse (game ne touche pas ces deux fichiers) |

---

## 11. Reporté (hors vague 1)

- **Playtest humain de 2 à 6 joueurs** : équilibrage réel, niveau par défaut, Faucon contre 2-3 débutants. Impossible à faire par un agent.
- **Écoute humaine** du mixage et des clips suspects (« Lagon » entendu « La gomme », « Safran », « L'heure dorée », « fige »), avec régénération TTS au besoin (`tools/tts`).
- **iOS et manette réels** (seule l'émulation a été vue).
- **Idée W5** : au podium, l'ombre du champion en vol balaie les plaques (vol scripté de 3 s, risque moyen).
- **4K** : preset « High+ » (1440p) ou passe d'encre à la résolution native (tech, sév. 2).
- **Perte du contexte WebGL** : pause et surcouche « L'image s'est interrompue » (tech, sév. 2).
- **Onglet dupliqué** : texte dédié et bouton « Reprendre ici » via `HostSession.takeOver()` (tech, sév. 2).
- **Serveur de production** (`server/index.ts`, hors des 7 périmètres, pour le lead) : ETag et 304, cache long pour `/audio`, `/fonts`, `/ui`, Range en 206 ; contrôle `file !== DIST && !file.startsWith(DIST + sep)` (tech, sév. 2 et 1). Environ 30 lignes, à faire avant le redéploiement.
- **Allocations par image** de 5 à 10 Mo/s (tech, sév. 1).
- **À-coup de 77 ms** au changement de carte de la démo du titre (tech, sév. 1).
- **Voix du narrateur** ré-encodée à 48 kb/s, avec présence au-dessus de 3 kHz (audio, sév. 1).
- **Réplique commencée avant un changement de langue** (sév. 1).
- **Horloge audio donnée au directeur** (`ctx.currentTime` au lieu de `performance.now()`) : A8 traite la partie sûre.
- **4e vignette de règles** (COUP D'AILE et tours) au salon, à reconsidérer après H7.
