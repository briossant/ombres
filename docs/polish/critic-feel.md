# Critique « game feel » — joueur exigeant (polish)

Agent : critique game feel. Serveur de dev : port 8822. Lecture seule du code ; scripts de test dans `tools/polish/feel/`, captures dans `shots/polish/feel/`.

## Verdict en une minute

Le jeu tient debout et il est souvent beau. Le duel est superbe : oiseaux de 150 à 250 px, caméra proche. La montée de nuit vers la carte des résultats est un très beau moment. Le téléphone réagit bien au piqué (PIQUER → couleur de la cible → « PIQUÉ ! » → « TOUCHÉ ! »). Les vibrations suivent le GDD §12.3 à la lettre.

Ce qui manque, c'est la **tension** et la **lisibilité aux moments qui comptent**. Quatre défauts majeurs :

1. **En solo, les bots ne mettent presque aucune pression.** Pendant les 40 à 50 premières secondes de chaque manche, aucun bot ne pique. Ensuite, l'humain subit environ 1,3 piqué par manche en Voyageur, et quasiment aucun en Oisillon.
2. **Le début de la Grande Ombre, qui devrait être le climax, est le plan le plus large et le plus encombré de la manche.** Une bannière reste 4,5 s sur le haut de l'arène.
3. **Derrière le front de nuit, le territoire ne change presque pas.** On ne voit pas ce qui est déjà figé : seule une lèvre de 3 px avance.
4. **Le cadrage vise des points décalés vers l'ombre.** Au couchant, l'oiseau réel passe sous la bande de sable, voire hors du cadre (mon propre oiseau est resté coupé 2,5 s en duel).

Autour de ces quatre points, une série de défauts de 2e rang :

- les indications de tutoriel arrivent à contretemps ;
- les bots Seigneur font des feintes éclair qui déclenchent de fausses alertes ;
- l'esquive n'a aucune récompense visible ;
- le piqué rapporte peu ;
- à 12 oiseaux, impossible de retrouver le sien.

## Méthode (reproductible)

| Scénario | Script | Ce qui a été joué |
|---|---|---|
| Solo, composition par défaut, **3 manches complètes + podium**, vitesse réelle | `node tools/polish/feel/match.mjs --name=solo-default` | moi au clavier (pilote « appliqué » : peint bas, remonte pour chasser, PIQUER au chevron tenu jusqu'à la résolution, COUP D'AILE 0,25 à 0,5 s après le clac, file vers l'est à la Grande Ombre) contre Faucon, Laboureur et Nomade Voyageurs |
| 12 oiseaux (1 clavier + 11 bots de niveaux mêlés), 1 manche | `match.mjs --name=twelve --bots=…` | lisibilité, caméra, bande de sable |
| 6 oiseaux (1 clavier + 5 Voyageurs), 1 manche | `match.mjs --name=six` | cœur de cible 2-6 |
| Duel contre un Faucon Seigneur, 1 manche | `match.mjs --name=duel` | caméra serrée |
| iPhone 15 Pro + Pixel 7 + bots par défaut, 1 manche | `node tools/polish/feel/phones.mjs --name=phones` | salon, cartes, manette, vibrations journalisées (`navigator.vibrate` intercepté) |
| iPhone seul + 3 bots, 1 manche | `phones.mjs --name=phone-solo --solo` | état PIQUER, piqué subi |
| « Écoute » du mixage réel, 6 oiseaux | `node tools/polish/feel/audio-capture.mjs` puis `audio-listen.py` | dérivation sur la sortie de l'AudioContext du jeu, WAV + journal horodaté sur l'horloge audio |
| Écran titre, 48 s | `node tools/polish/feel/title.mjs` | premier contact |
| Headless | `npx tsx tools/polish/feel/solo-sweep.ts`, `bot-pressure.ts` | difficulté du solo (6 profils d'humain × 3 niveaux × 24 manches) ; pression des bots sur l'humain |

L'enregistrement se fait en continu par screencast CDP (10 à 19 images/s) :

- rafales autour de chaque prise d'élan, touche, raté, couronne, gros vol, phase, dernières secondes et nuit ;
- une image de survol toutes les 2 s ;
- une sonde de lisibilité dans la page (`hudAnchors`, `birdAnchors.spanPx`) toutes les 250 ms.

Les planches contact sont dans `shots/polish/feel/sheets/`. Toutes les images citées ont été regardées.

Réserves :

- Le GPU et le CPU étaient chargés par le screencast et, pour les téléphones, par trois pages à la fois : la sim a parfois tourné sous le temps réel.
- Aucune mesure de performance n'a été retenue.
- Le son a été mesuré, pas écouté.

## Ce qui marche (à ne pas casser)

- **Duel** (`shots/polish/feel/duel/`) : caméra proche, oiseaux de 140 à 260 px, fil d'ombre lisible. C'est le meilleur « feel » du jeu.
- **Dernières secondes** : la caméra se resserre sur l'est, compte à rebours énorme, lèvre de lumière nette (`solo-default/034-last1_00569_p0.37.jpg`). La dramaturgie est réussie, mis à part le défaut n° 7.
- **Nuit → montée → carte** : 1,5 s de gel, montée de 2,5 s, illumination, décompte des %, soleils (`sheets/solo-r1-results.jpg`).
- **Téléphone au piqué** (`sheets/phone-solo-dive.jpg`) : PIQUER blanc à rayons, puis à la couleur de la cible, puis « PIQUÉ ! », puis « TOUCHÉ ! ». Quand on est visé : bordure rouge, « ! » rouge, vibration (`sheets/phone-solo-attacked.jpg`).
- **Vibrations** (Pixel 7, 40 appels journalisés) : verrouillage [8], prise d'élan [120], clac [35], décrochage [200,60,200], Grande Ombre [80,80,80], chaque dernière seconde [25], couronne [20,30,20,30,60]. Tout est conforme au GDD §12.3.
- **Narrateur** : 7 à 10 répliques par manche, toujours voisées et sous-titrées, bien placées (couronne, premier piqué, phases, dix secondes, « Très serré »). La voix passe **6 à 12 dB au-dessus du lit sonore** : intelligible.
- **Arc sonore** : sans la voix, le lit monte de −24,8 LUFS (après-midi) à −17,9 (Grande Ombre), puis −31,9 à la nuit. La coupure fait son effet.
- **Rythme d'une partie** : 3 manches plus podium en 7 min 40 s. Entracte de 16 s, cartes passables. Pas de temps mort entre les écrans.

## Problèmes (du plus grave au moins grave)

### 1. [game · 4] Solo : les bots ne mettent pas de pression

**Constat.** Dans la partie solo complète, aucun bot ne pique pendant les **44 à 48 premières secondes** de chaque manche : premières prises d'élan de bot à 47,6 s, 45,7 s et 44 s (`shots/polish/feel/solo-default.log`). Il y a 4 à 8 piqués par manche en tout, alors que le GDD §18 vise 8 à 15.

**Mesure headless** (`npx tsx tools/polish/feel/bot-pressure.ts --rounds=12 --policy=low`, humain qui reste bas, donc la proie idéale) :

| Niveau | Piqués de bots par manche | … sur l'humain | 1er piqué de bot (médiane) | 1er piqué sur l'humain (médiane) | Feintes < 0,2 s | Manches sans piqué sur l'humain |
|---|---|---|---|---|---|---|
| Oisillon | 1,8 | 0,2 | 53 s | jamais | 0/21 | 83 % |
| Voyageur | 4,1 | 1,3 | 40 s | 51 s | 4/49 | 8 % |
| Seigneur | 3,3 | 1,3 | 49 s | 80 s | 19/40 | 33 % |

**Cause.** `src/bots/styles.ts:136` : `huntFrom = … 40` (12 en démo). Le Faucon, seul chasseur de la composition solo, ne chasse pas avant 40 s. La composition `defaultBots(1)` (Faucon, Laboureur, Nomade) contient un seul caractère qui pique. En Oisillon, le choix des victimes (« bots ou couronne ») exclut presque toujours l'humain.

**Conséquences.**

- 40 % de chaque manche sans aucune interaction.
- On n'apprend pas à esquiver en solo.
- En Oisillon, 83 % des manches se jouent sans un seul piqué sur l'humain : on a un bac à sable.

**Correction.**

- Dans `styles.ts`, avancer `huntFrom` à 15 s (début de l'après-midi, GDD §3 « premiers piqués »), avec un appétit réduit avant 40 s.
- Dans `src/bots/roster.ts`, `defaultBots(1)` : remplacer le Nomade par la Pie (déjà proposé dans bots.md §8).
- En Oisillon, autoriser l'humain comme victime au moins une fois toutes les 25 s, avec un piqué lent et « mal engagé » : c'est le bon niveau pour apprendre le clac.
- Cible à revérifier avec `bot-pressure.ts` : en Voyageur, 1er piqué avant 25 s et au moins 2,5 piqués par manche sur l'humain.

### 2. [staging · 4] Le début de la Grande Ombre est le plan le plus large et le moins dramatique

**Constat.** À 98 s, la caméra dézoome sur toute l'arène. Les oiseaux tombent à 40-50 px, le bas du cadre reste vide. La bannière noire « LA GRANDE OMBRE / La nuit fige le sable. File vers l'est → » (550 × 120 px) couvre le nord de l'arène pendant 4,5 s. Le sous-titre du narrateur s'y ajoute. Enfin, « La Grande Ombre » est répété sous le cadran.

**Preuves.**

- `shots/polish/feel/solo-default/ov-game-r0-0057.jpg`
- `solo-default/087-ten_01636_p1.44.jpg` (la bannière est encore là 3,4 s après)
- `twelve/069-ten_01349_p1.15.jpg` : un « ! » et des oiseaux sous la bannière

**Cause.**

- `src/host/camera/framingRig.ts:189-197` ajoute aux points cadrés le front de nuit « à la hauteur de chaque oiseau ». À 98 s, le front est à −1,05·a, donc le cadre s'ouvre sur toute l'arène.
- `src/host/ui/viewModel.ts:674` : une bannière avec sous-titre dure `phaseBannerSeconds + 1.5` = 4,5 s.

**Correction.**

- Dans `framingRig.ts`, borner le point du front à (x de l'oiseau le plus à l'ouest − 40 m), pour que la lèvre entre dans le cadre au lieu d'imposer le plan large. Ajouter une poussée lente (−10 % de largeur sur les 12 s) et un tangage un peu plus bas : on part serré et on se resserre encore.
- Pour la Grande Ombre, bannière de 2,5 s au plus, placée dans le tiers bas ou en bandeau fin au bord haut, sous la bande de sable et non sur l'arène.
- Supprimer le doublon sous le cadran pendant la bannière.

### 3. [world · 4] Derrière le front de nuit, le territoire ne change pas : on ne voit pas ce qui est figé

**Constat.** Au moment où la nuit avance, l'arène est peinte à 85-100 %. De part et d'autre de la lèvre orange, le territoire a la même couleur : même turquoise et même jaune à gauche et à droite du front dans `solo-default/087-ten_01636_p1.44.jpg` (x ≈ 550) et dans `twelve/069-ten_01349_p1.15.jpg` (x ≈ 300-600). Seuls le sable hors arène et les tours virent à l'ardoise.

La « vague qui fige tout d'ouest en est » (brief, GDD §7.1) se réduit à un trait de 3 px. On ne sait pas ce qui est encore jouable. Le bandeau dit « File vers l'est », mais le sol ne montre pas ce qu'on fuit.

**Correction** (shader du territoire, agent world, ART_BIBLE §4.6).

- Derrière le front, assombrir et désaturer nettement le lavis (par exemple L −0,12 et C × 0,6 en plus de KF-4), avec une granulation « sec » bien visible.
- Au passage de la lèvre, jouer une vague de 0,3 s (liseré papier qui s'éteint), pour que chaque mètre gelé « claque ».
- Garder les couleurs identifiables (ΔE entre joueurs ≥ 0,05), comme sous une tour (§4.5, mélange de 35 %).

### 4. [staging · 4] Le cadrage vise des points décalés vers l'ombre : oiseaux sous la bande de sable, voire hors champ

**Constat.** La sonde de lisibilité (`hudAnchors` + envergure à l'écran, toutes les 250 ms) donne, à **6 oiseaux** :

- au **couchant**, au moins un oiseau chevauche la bande de sable **63 % du temps** ;
- pendant le compte à rebours, 42 % du temps ;
- à l'après-midi, 39 % du temps.

Source : `shots/polish/feel/six/reads.json`, script `node tools/polish/feel/read-stats.mjs`.

En **duel**, au couchant (85 s), **mon oiseau est coupé par le bord gauche pendant 2,5 s** : la caméra cadre le Faucon et son ombre, tombée dans le Simoun à l'est (`duel/011-phase-sunset_00642_p0.14.jpg`, `duel/reads.json`, ancre x = −33 px).

En solo, le vol de couronne le plus important de la manche 1 (Faucon sur moi, 3 672 cellules, 2,5 % de l'arène) se joue en haut du cadre, avec des oiseaux d'environ 35 px coincés entre la bande de sable et la bulle « Au clac : Maj ! » (`solo-default/024-windup-h1-t0_00848_p0.55.jpg`, `025-hit-h1-t0-crown_01453_p0.75.jpg`).

**Cause.** Dans `framingRig.ts:166-177`, l'oiseau est cadré à 70 % du chemin ombre → oiseau, altitude comprise (`z × 0.7`), avec un point d'anticipation. L'oiseau réel est donc plus haut à l'écran et plus à l'ouest que le point cadré. Par ailleurs, `ROUND_RECT.y0 = camMarginY = 0.15` (162 px) ne tient compte ni de la bande HUD (bas à 116 px, plus la couronne) ni de la demi-hauteur du sprite (30 à 45 px).

**Correction.**

- Cadrer aussi la position réelle de chaque oiseau avec un poids de 1, en plus de son ombre, avec une marge égale à sa demi-envergure à l'écran.
- Utiliser un rectangle asymétrique : haut à 0,21 (bande HUD plus sprite), bas à 0,15.
- Ne pas cadrer une ombre qui sort de l'arène au-delà de ρ = 1,0 (aujourd'hui 1,04) quand cela coupe un oiseau.
- Test : `read-stats.mjs` doit montrer « sous la bande » < 5 % et « hors cadre » = 0 à toutes les phases.

### 5. [staging · 3] La dramatisation du piqué est invisible hors du duel ; à 12 oiseaux, la caméra ne bouge plus

**Constat.**

- Le zoom de piqué (`camDiveZoom` = 8 %, 0,6 s) ne se voit pas dès que le cadre fait plus de 150 m. Il ne recentre pas la paire.
- À 12 oiseaux, la caméra reste sur l'arène entière de t ≈ 6 s jusqu'à la Grande Ombre (`sheets/twelve-overview.jpg`).
- Mon piqué réussi à 12 oiseaux se lit comme deux oiseaux de 45 px et un « +0,1 % » (`sheets/twelve-myhit.jpg`).

Le brief demande une caméra « qui cadre l'action et la dramatise ».

**Correction** (`framingRig.ts` / `GameCamera`).

- Sur une touche qui implique la couronne ou un humain, faire un vrai « punch-in » : largeur × 0,75 **et** décalage de la cible vers la paire, pendant la durée du ralenti plus 0,5 s, avec le retour déjà prévu. Au plus un toutes les 6 s, jamais pendant les 3 dernières secondes (même règle que le ralenti).
- Au-delà de 8 oiseaux, réserver ce plan aux touches de couronne ou d'humain.

### 6. [birds · 3] Flash « planche » plein écran à chaque touche, même insignifiante

**Constat.** Chaque `diveHit` blanchit tout l'écran pendant 2 images (`requestPlancheFlash`), qu'il s'agisse de +2,5 % sur la couronne ou de +0,1 % à midi à 12 oiseaux. Exemples : `twelve/027-windup-h0-t10_01590_p1.29.jpg` (+0,1 %) et `solo-default/005-windup-h0-t2_01186_p0.89.jpg` (+0,6 %). À 12 oiseaux, on compte 11 flashs par manche, dont un en plein début de Grande Ombre (`sheets/twelve-end.jpg`). Le flash banalise les grands moments et, au moment de l'impact, efface la tache d'encre et la vague de couleur.

**Correction** (runner, sur `diveHit`).

- Flash seulement si la touche vole la couronne, implique un humain, ou vole ≥ 1 % de l'arène (`stolenCells / grid.arenaCells`). Sinon, étoile d'impact et tremblement seulement.
- Au plus un flash toutes les 6 s (la bible dit 2 s).

### 7. [game · 3] Indications de tutoriel à contretemps

**Constat.**

- « **Ombre de tour : sable figé, et tu es invisible.** » apparaît dans les **3 dernières secondes** dans 2 de ses 3 apparitions (solo : 108 s ; 12 oiseaux : 107 s ; 6 oiseaux : 83 s). La bulle se pose à côté du « 3 / 2 / 1 », sur l'oiseau du joueur. Preuves : `solo-default/034-last1_00569_p0.37.jpg` et `twelve/073-last3_00680_p0.48.jpg`, puis `075-last1_*`.
- La bulle « **Au clac : COUP D'AILE !** » se déclenche sur une **feinte éclair** annulée 0,1 s après (`phone-solo/006-A-windup-on-me_*`). L'indication est alors consommée pour la partie, et le joueur ne la reverra pas au premier vrai clac.
- La bulle « Au clac : Maj ! » **reste affichée après la résolution** du piqué : elle chevauche « +2,6 % » et les étiquettes (`solo-default/025-hit-h1-t0-crown_01453_p0.75.jpg`).

**Correction** (`src/director/hints.ts`).

- Dans `update()`, aucune bulle individuelle à partir de `sun.phase === 'greatShadow'` : seul le bandeau général reste.
- `dodge` : mettre en file à la prise d'élan, mais n'afficher qu'au `diveCommit` (le clac) ; ne pas marquer l'indication comme vue si le piqué est annulé.
- Retirer la bulle (côté UI) sur `diveHit`, `diveMiss` et `diveCancel` du piqué concerné.

### 8. [hostui · 3] Bulles identiques en double, bulles sur la bande de sable, étiquettes décollées de leur oiseau (confirmé)

**Constat.**

- Deux bulles « Relâche PLONGER : tu remontes, ombre grande. » au même instant pour deux joueurs (`sheets/phones-pc-0012.jpg`, image source `phones/ov-pc-0012.jpg`).
- La bulle « Ombre de tour… » passe sur la bande de sable et sa couronne (`sheets/phones-pc-0040-top.jpg`).
- À 4 oiseaux, l'étiquette de la victime (« Corail 👑 ») s'empile sous celle du chasseur, à 90 px de son propre oiseau : on ne sait plus qui est qui (`solo-default/025-hit-h1-t0-crown_01453_p0.75.jpg`).
- À 12 oiseaux, « Corail » est caché sous « Safran · Pie » (`twelve/ov-game-r0-0042.jpg`).

**Correction** (`src/host/ui/hud/WorldLayer.tsx`, `hud.css`).

- Même texte à moins d'une seconde d'intervalle : une seule bulle (ou la seconde décalée et raccourcie).
- Borner le haut des bulles à (bas de la bande de sable + 12 px), et retourner la bulle sous l'oiseau si nécessaire.
- Dé-chevaucher les étiquettes par un petit décalage vertical avec un trait de rappel vers l'oiseau, plutôt que par empilement.

### 9. [game · 3] Feintes éclair des bots : fausses alertes et intention illisible

**Constat.** `src/bots/brain.ts:625` programme la feinte 0,05 à 0,13 s après la prise d'élan. Mesures :

- headless : 19 piqués sur 40 chez le Seigneur (48 %) et 4 sur 49 chez le Voyageur sont annulés en moins de 0,2 s (`bot-pressure.ts`) ;
- en jeu : 3 feintes à 0,13 s dans la manche à 12 oiseaux, et **3 piqués sur 3** contre le téléphone solo (`phone-solo.log`).

Côté cible, on reçoit la bordure rouge, le « ! » rouge et une vibration [120]… pour rien. Une feinte aussi courte ne peut pas appâter un humain, dont le réflexe est d'environ 0,25 s. Ce n'est plus un bluff, c'est du bruit.

**Correction.**

- Placer la feinte **pendant la chute guidée** : relâcher 0,35 à 0,55 s après la prise d'élan, juste avant le clac. Le chasseur se redresse visiblement : la feinte se lit et elle fait gaspiller le coup d'aile (GDD §8.3-5).
- Ramener le taux Seigneur à la valeur du GDD (35 %) mesurée **sur les piqués lancés**.

### 10. [birds · 3] L'esquive, geste d'adresse du défenseur, n'a pas de récompense

**Constat.**

- **À l'image** : sur un raté esquivé, le chasseur ne produit que de petites bouffées de sable. L'esquiveur n'a aucun signe et il n'y a pas de ralenti (`solo-default/072-miss-h1-t0-dodged_00779_p0.28.jpg`, `sheets/solo-r3-dodge-me.jpg`).
- **Au son** : l'émergence d'un `diveMiss` dans le mixage réel est de −0,3 dB en médiane, contre +6 dB pour une touche (`audio6`).

Seul le narrateur le relève parfois (« Corail esquive. Les serres attrapent du vent. »).

**Correction.**

- Dans `src/host/render/fx/system.ts`, sur `diveMiss.dodged` : arc d'encre de souffle autour de l'esquiveur, plumes arrachées au chasseur, étoiles au-dessus du chasseur planté.
- Dans le runner, ralenti court à 0,6× pendant 0,2 s, soumis au même écart que le ralenti de touche.
- Dans `sfx.ts`, relever l'esquive de +4 dB (souffle + « ting ») avec un creux de musique de 200 ms.

### 11. [game · 3] Le piqué rapporte peu : le geste le plus spectaculaire est une mauvaise stratégie

**Constat.**

- Hors couronne, une touche vole 0,3 à 1 % de l'arène : +0,6 % à midi à 4 oiseaux, +0,1 à 0,3 % à 12. Seules les couronnes du couchant dépassent 2 % (voir `stolenCells` dans les `events.json`).
- Dans `solo-sweep.ts` (24 manches par case), le profil « **chasseur** » gagne **63 % / 21 % / 8 %** des manches en Oisillon / Voyageur / Seigneur, contre **96 / 75 / 46 %** pour le profil « mixte ». Il enchaîne pourtant 5 à 8 touches par manche.
- Même en jeu : sur les 3 manches de la partie solo, le Faucon réussit 7 touches sans en subir aucune, et finit pourtant 2e (12 soleils, départagé).

Le piqué est un bonus, pas une option de victoire. Cela pèse sur le fun : le verbe le plus excitant ne paie pas.

**Correction.**

- Dans `src/sim/rules.ts`, faire un essai A/B avec `trailStealSeconds` 1,5 → 2,5 (couronne 3 → 4), et éventuellement une tache de piqué de 10 m (ART_BIBLE §4.4) qui compte en fort.
- Mesurer avec `tools/bots-arena.ts` et `solo-sweep.ts` : viser le profil « chasseur » à moins de 10 points du « mixte », sans dépasser la cible de 35 % par caractère à 6 Voyageurs.


### 12. [birds · 3] À 9-12 oiseaux, impossible de retrouver le sien (confirmé et mesuré)

**Constat.**

- Envergure à l'écran, en médiane, **51 px à midi et à l'après-midi, 60 px au doré** (p10 : 43 px). Source : `twelve/reads.json`.
- Les oiseaux sont tous blanc os et la couleur n'est que sur de fines bandes. Les étiquettes n'apparaissent qu'aux événements et se chevauchent (n° 8).
- Sur `twelve/ov-game-r0-0042.jpg`, je ne retrouve pas mon oiseau sans l'étiquette.

**Correction.**

- Au-delà de 6 oiseaux, afficher en permanence, **pour les humains seulement**, le jeton-glyphe de 18 px déjà prévu pour le mode daltonien (ART_BIBLE §3), ou un anneau de sa couleur autour de l'empreinte d'ombre.
- Un appui sur COUP D'AILE hors manche, ou pendant les 5 premières secondes, fait pulser l'étiquette.
- Relever `birdRenderScaleMax` vers 1,5 au-delà de 8 oiseaux.

### 13. [world · 3] Au couchant, le territoire pâle de Corail se confond avec le sol (confirmé et mesuré)

**Constat.** Sur `solo-default/ov-game-r0-0050.jpg` (t ≈ 90 s), le sol vaut srgb(215,163,139). Les zones pâles de Corail mesurées sont à **ΔE OKLab = 0,004 à 0,03** du sol, sous le seuil de perception (environ 0,02). Le fort est à 0,095. Crop : `sheets/sunset-pale-crop.jpg`, bandes saumon autour des zones fortes.

**Correction** (lavis pâle, agent world). Aux keyframes du couchant, garantir ΔE ≥ 0,05 entre le pâle de chaque couleur et `groundFlat` : relever le chroma du pâle de Corail, Rose et Carmin, ou baisser légèrement la luminance du sol dans l'arène. Ajouter une assertion au banc de palette (ART_BIBLE §4.1).

### 14. [phone · 3] iPhone 15 Pro paysage : PIQUER déborde et chevauche COUP D'AILE (confirmé)

**Preuves.**

- État cible avec rayons : les rayons sortent par la droite et par le bas, et couvrent le bouton COUP D'AILE (`phone-solo/002-A-lock-t1_00872_p0.67.jpg`, `003-A-my-windup_00218_m0.08.jpg`).
- Le cartouche « TOUCHÉ ! » se pose sur COUP D'AILE (`003-A-my-windup_01429_p1.13.jpg`).
- Planche : `sheets/phone-solo-dive.jpg`.

**Correction** (`src/phone/phone.css`, `.act--dive.is-target`).

- Dessiner les rayons à l'intérieur du cercle (inset), ou limiter l'échelle pour tenir dans le cadre avec `env(safe-area-inset-*)`.
- Écarter COUP D'AILE, ou le faire passer au-dessus avec un z-index et une marge.
- Placer « TOUCHÉ ! » en haut au centre.

### 15. [phone · 3] Salon : la carte des règles est coincée entre le joystick et les boutons (confirmé)

**Preuves.** Le cercle COUP D'AILE mange le bord droit de la carte (`phones/A-lobby-1.jpg`). Le joystick flottant se dessine par-dessus dès que le pouce se pose (`phones/A-lobby-thumb.jpg`). Planche : `sheets/phones-lobby-s.jpg`.

**Correction.** Remonter la carte sous le bandeau des objectifs, ou la masquer tant qu'un pouce est posé ; lui réserver la colonne centrale entre les deux zones de contrôle.

### 16. [birds · 3] Podium : oiseaux perchés en silhouettes grises, couronne perdue (confirmé)

**Preuves.**

- `solo-default/ov-cinematic-r3-0222.jpg` : trois statues gris-bleu à contre-jour, ailes en V, cavalier invisible.
- `ov-cinematic-r3-0221.jpg` : la couronne flotte loin au-dessus du champion, puis disparaît derrière l'en-tête « Fin de partie ».

**Cause.** `src/host/render/bird/controller.ts:248` place la couronne à `riderTop + crownLift × échelle`, soit 3,5 m × l'échelle vers le haut de l'écran, alors qu'en pose `perch` le cou est dressé bien au-dessus du cavalier.

**Correction.**

- En mode `perch`, ancrer la couronne sur la tête (`head`) avec un décalage d'environ 1,2 m.
- Ajouter un remplissage de face ou un liseré à la couleur du joueur (le soleil de `sunOverride` est derrière les oiseaux).

### 17. [staging · 3] Écran titre : premiers plans encombrés (confirmé et précisé)

**Constat** (48 s regardées, `sheets/title.jpg`) :

- `title/ov-title-0007.jpg` : un oiseau en piqué très proche traverse le tiers droit. Sa **traînée blanche de clac** et des lignes de vitesse barrent l'écran en diagonale sur 700 px. Les **bouffées de sable** vues de près ressemblent à des biscuits beiges festonnés de 150 px.
- `ov-title-0009` : fût de tour en très gros plan à droite.
- `ov-title-0019` et `0021` : oiseau en travers du cadre.

**Correction** (`src/host/camera/cine.ts` et FX).

- Exclure des suivis les oiseaux en piqué engagé à moins de 25 m de la caméra.
- Couper les FX de vitesse et de clac pour les oiseaux trop proches de la caméra (au-delà d'une taille écran).
- Réduire, ou faire disparaître par la trame, les bouffées de sable au-delà de 60 px à l'écran.
- Pour le reste, `CLUTTER_MAX` et la zone du logo, comme noté par qa.

### 18. [audio · 2] Accents trop faibles dans le mixage réel

**Mesure** (`audio6`, capture à la sortie de l'AudioContext, 6 oiseaux, `tools/polish/feel/audio-listen.py`). Émergence médiane = momentané max dans les 0,5 s suivant l'événement, moins la sonie des 1,5 s qui précèdent.

| Événement | Émergence médiane |
|---|---|
| touche | **+6,0 dB** (bien) |
| clac | +4,3 dB |
| prise d'élan | +3,1 dB |
| **changement de couronne** | **−0,7 dB** |
| **gros vol** | −0,3 dB |
| **« dix secondes »** | −0,8 dB |
| **dernières secondes** | **+1,7 dB** |
| **esquive (raté)** | −0,3 dB |

Autres valeurs : crête −1,6 dBFS, aucun écrêtage ; sonie par phase sans la voix de −24,8 (après-midi) à −17,9 LUFS (Grande Ombre).

La couronne change 10 fois par manche à 6 oiseaux et on ne l'entend pas. Les blocs de bois des 5 dernières secondes se noient dans le tutti.

**Correction** (`src/host/audio/sfx.ts`).

- Relever la cloche de couronne, le gros vol et les dernières secondes de +3 à +5 dB.
- Creuser la musique (−3 dB, 250 ms) sur ces trois accents, comme le ducking du narrateur.
- Réserve : mesure objective, pas une écoute. Une écoute humaine reste à faire.

### 19. [hostui · 2] Podium : égalité de soleils sans départage expliqué

**Preuve.** `solo-default/ov-cinematic-r3-0222.jpg` : « CORAIL remporte la partie ☀12 », et Faucon 2e avec ☀12. Le départage au territoire cumulé (83 % contre 77 %) n'est affiché nulle part.

**Correction** (`MatchResults.tsx`). Ajouter une ligne « Départagés au désert cumulé : 83 % contre 77 % » sous l'en-tête quand deux totaux sont égaux.

### 20. [game · 2] Titres : « Le Kamikaze » décerné au meilleur chasseur

**Preuve.** Même capture : le Faucon (7 piqués réussis, 0 subi, meilleur chasseur de la partie) reçoit « Le Kamikaze — 3 piqués dans le sable », alors que « Le Rapace » n'est attribué à personne.

**Correction** (`matchTitles`, `src/sim`). Attribuer d'abord les titres positifs aux meilleurs de chaque domaine : Rapace si les touches valent au moins 2 × la moyenne. Ne pas donner un titre négatif du même domaine (piqué) à celui qui y domine.

### 21. [hostui · 2] Podium : les bots sont nommés par leur caractère, pas par leur couleur

**Constat.** Plaques et cartes de titres affichent « Faucon », « Laboureur », « Nomade », alors que le jeu, les étiquettes, les résultats de manche et le narrateur disent « Lagon », « Indigo », « Safran » (`ov-cinematic-r3-0222.jpg`).

**Correction.** Afficher « Lagon · Faucon » comme aux résultats de manche, ou la couleur en grand avec le caractère en petit.

### 22. [hostui · 2] Résultats de manche : « Indigo · Laboure… » tronqué

**Preuve.** `sheets/results-panel-crop.jpg` : le nom est coupé alors que la colonne des barres est large.

**Correction** (`results.css`). Réduire la colonne des barres ou autoriser deux lignes pour les noms.

### 23. [birds · 2] En jeu, la couronne flotte détachée, très au-dessus de l'oiseau

**Preuves.** Environ 100 px au-dessus de l'oiseau en vue de 4 oiseaux (`solo-default/072-miss-h1-t0-dodged_00779_p0.28.jpg`) ; environ 80 px en duel (`duel/011-phase-sunset_00642_p0.14.jpg`).

**Cause.** `crownLift` vaut 3,5 + 2,2 m en plongée, multiplié par l'échelle cosmétique (jusqu'à 1,3), soit environ 7 m. La bible (§6.7) dit 3 m au-dessus du cavalier.

**Correction** (`src/host/render/bird/anchors.ts`). Ramener à 2,5 + 1,0 × `downness`, puis vérifier que le bec n'est pas masqué quand l'oiseau vole vers le haut de l'écran.

### 24. [hostui · 2] À 12 oiseaux, la bande de sable ne donne le % que des 2-3 premiers

**Preuve.** `twelve/ov-game-r0-0042.jpg`, `twelve/069-ten_01349_p1.15.jpg` : 9 segments d'environ 70 px sans pourcentage, alors que chacun pèse 7 à 10 %. On ne lit pas sa propre part sur la TV (le téléphone l'affiche).

**Correction** (`SandBar.tsx`). Au-delà de 8 oiseaux, afficher le % des humains dans une étiquette sous leur segment, ou utiliser une police condensée dans le segment.

### 25. [other · 2] Petits manques de parcours (confirmés dans le code, non rejoués)

- **Le joueur clavier ne peut pas quitter le salon.** Aucune touche prévue (runner.md §10).
- **Le libellé de COUP D'AILE du J2 affiche « ; » en QWERTY.** Cause : `src/input/labels.ts:32` renvoie `keyLabel('Semicolon')`. Correction : afficher la touche en cartouche (« ; » dans une case), ou proposer `NumpadEnter` comme libellé principal.
- **Réplique qui finit dans l'ancienne langue après un changement de langue.** Non rejoué ici.

## Mesures complémentaires

**Lisibilité** (`read-stats.mjs`, envergure à l'écran en px 1080p, p10 / médiane / p90) :

| Phase | Duel | 6 oiseaux | 12 oiseaux |
|---|---|---|---|
| midi | 160 / 207 / 237 | 56 / 62 / 89 | 43 / 51 / 66 |
| après-midi | 94 / 179 / 255 | 59 / 67 / 89 | 44 / 51 / 63 |
| couchant | 140 / 172 / 203 | 59 / 65 / 88 | 44 / 49 / 60 |
| Grande Ombre | 83 / 142 / 228 | 57 / 63 / 91 | 48 / 61 / 66 |

**Difficulté du solo** (`solo-sweep.ts`, 24 manches par case, % de manches gagnées par l'humain contre Faucon, Laboureur et Nomade) :

| Profil humain | Oisillon | Voyageur | Seigneur |
|---|---|---|---|
| inactif | 8 % | 0 % | 0 % |
| « débutant » (réaction 0,5 s, bruit 25°, 40 % d'oublis) | 92 % | 79 % | 63 % |
| toujours haut | 46 % | 25 % | 4 % |
| toujours bas | 92 % | 25 % | 33 % |
| mixte (appliqué) | 96 % | 75 % | 46 % |
| chasseur | 63 % | 21 % | 8 % |

**Lecture.**

- Celui qui peint bien bat facilement Oisillon et Voyageur.
- Celui qui ne sait pas où voler perd tout : c'est le « Faucon a tout gagné » de qa, contre des pilotes aléatoires.
- Chasser ne paie pas (n° 11).
- En partie réelle, mon pilote clavier a gagné 2 manches sur 3 et la partie au départage contre le Faucon (12-12). Il a aussi gagné le duel contre un Faucon Seigneur avec 53,8 % contre 34,8 %, en esquivant 3 piqués sur 3.
- Le profil « débutant » reste un bon peintre : les chiffres surestiment un vrai débutant.

**Rythme** (partie solo réelle) :

- manche : 3 s de compte à rebours, 110 s de soleil, 2 s de nuit, puis 3 s de montée ;
- entracte : environ 16 s ;
- total : 7 min 40 s jusqu'au podium.

Le seul temps mort est dans la manche elle-même : les 40 premières secondes en solo (n° 1).

## Constats du lead : bilan

| Constat | Verdict |
|---|---|
| Titre (tour au premier plan, oiseau qui traverse) | confirmé et précisé (n° 17) |
| URL qui déborde du QR | non vérifié : domaine local seulement |
| Carte des règles du téléphone | confirmé (n° 15) |
| PIQUER qui déborde | confirmé (n° 14) |
| Oiseaux petits | confirmé et mesuré (n° 12) |
| Corail pâle au couchant | confirmé et mesuré (n° 13) |
| Bulles en double / sur la bande | confirmé (n° 8), avec en plus les indications à contretemps (n° 7) |
| Perf | non mesurée (screencast actif, GPU partagé) |
| Podium | confirmé (n° 16) |
| Équilibrage du Faucon | expliqué (n° 1 et n° 11) |
| Petits manques | confirmés dans le code (n° 25) |
| Mix jamais écouté | mesuré sur le mixage réel (n° 18) ; toujours pas écouté par une oreille |

## Non vérifié (limites)

- **Personnalités lisibles à la TV.** Le Faucon se reconnaît (seul chasseur, cercle puis piqué). Laboureur, Nomade et Guetteur se ressemblent vus de loin. C'est une impression, je n'ai pas mené de protocole.
- Signes « immunité », « coup d'aile prêt » (bouts d'ailes blancs) et « oiseau caché » : non isolés en capture.
- Tilt, manette et vrai iOS : non testés.
