# Critique « premier joueur » : Ombres découvert sans explication

Rôle joué : un débutant qui n'a jamais vu le jeu, avec des amis dans un salon, sans personne pour lui expliquer. J'ai tout fait en français puis en anglais : ouvrir le jeu sur le PC, scanner le QR avec un iPhone et un Pixel (d'abord en portrait, comme dans la vraie vie), choisir un nom et une couleur, le salon, les cartes des règles, trois manches à vitesse réelle, les résultats, le podium, la revanche. J'ai aussi joué seul avec un téléphone contre les bots, et à 100 % au clavier.

Date : 2026-09-26. Serveur de dev sur le port 8823. Aucun fichier du jeu n'a été modifié. Les scripts sont dans `tools/polish/firsttime/`. Les captures sont dans `shots/polish/firsttime/` : `fr-group/`, `en-group/`, `fr-keyboard/`, `fr-solo/`, `phone-gallery/`, `swatches/`, `credits/`, `audio/` et `crops/`. Chaque dossier contient un `_log.txt` horodaté qui relève les textes visibles, les répliques, les bulles et les chevauchements mesurés.

**Limite importante.** Pendant toute la session, le GPU était à 98-100 % et la charge machine à 28, à cause des autres agents. Les images tombaient à environ 10 i/s pendant les parties. Je n'ai donc rien conclu sur les performances : le constat « High à 12 oiseaux = 10-11 ms » reste à vérifier sur une machine au calme.

## Verdict en une phrase

Le jeu est beau et le parcours tient debout sans aide : QR, profil, manette, cartes, manche, résultats et revanche s'enchaînent, et tout se pilote depuis un seul téléphone. Mais trois moments font décrocher un débutant :

- au salon, il ne trouve pas **son** oiseau ni le mannequin ;
- en manche, les bulles d'aide s'empilent et deviennent illisibles au moment même où elles servent ;
- l'anglais emploie « Dive » pour deux choses différentes.

---

## Problèmes, du plus grave au plus léger

Sévérité : 5 = bloquant, 4 = majeur, 3 = notable, 2 = mineur, 1 = détail.

### 4 · Bulles d'indication empilées et illisibles, étiquettes par-dessus (hostui)

- **Constat.** Au moment où l'on apprend, trois bulles se superposent et deux étiquettes de nom se posent sur le texte. On lit « Relâche P[Lou][Corail]tu remontes ».
- **Mesures** (sonde toutes les 150 ms sur trois manches, fr-group) :
  - bulle sur bulle : 30 échantillons ;
  - deux bulles **identiques** en même temps : 20 échantillons, toujours « Relâche PLONGER : tu remontes, ombre grande. » ;
  - étiquette sur étiquette : 552 ;
  - étiquette sur bannière de phase : 58 ;
  - étiquette sur bande de sable : 107 ;
  - bulle sur bande de sable : 18 ;
  - bulle ou étiquette sur le cadran : 37.
- **Preuves** : `fr-group/051-r1-t12.jpg`, `fr-group/_log.txt` (« chevauchements HUD »).
- **Correction** (`src/host/ui/hud/WorldLayer.tsx`, `hud.css`) :
  - une passe d'évitement par image : les bulles se trient en y, et la suivante se décale sous la précédente, ou de l'autre côté de l'oiseau ;
  - bande haute (sable, bannière, cadran) interdite, avec la bulle ramenée sous la zone ;
  - étiquettes masquées tant qu'une bulle couvre leur ancre ;
  - une indication identique pour deux joueurs dans la même seconde ne crée qu'une bulle, avec les deux jetons de couleur (`src/director/hints.ts` ou `showHint`).

### 4 · Au salon, impossible de savoir quel oiseau est le sien, et le « mannequin » n'est désigné nulle part (hostui, game)

- **Constat.**
  - Le téléphone dit « Bouge le joystick : ton oiseau vole sur l'écran » puis « plonge sur le mannequin ».
  - Sur la TV, 4 ou 5 oiseaux blancs d'environ 50 px volent sans étiquette. Le mannequin est un oiseau parmi d'autres.
  - Aucun des trois joueurs pilotés n'a coché « Pique » en plus d'une minute.
- **Preuves** : `fr-group/025-lobby-1phone.jpg`, `fr-group/031-lobby-flying.jpg`, `crops/lobby-birds.png`, `fr-keyboard/005-lobby-joined.jpg`.
- **Correction** (`runner.ts` pour l'état du salon, `WorldLayer.tsx`) :
  - au salon, étiquettes de nom permanentes (ou `showTag` au premier mouvement du stick, puis 5 s après chaque entrée) ;
  - une étiquette « Mannequin / Dummy » avec une cible au sol sous le mannequin ;
  - un halo de la couleur du joueur tant que son objectif « Vole » n'est pas coché.

### 4 · Au couchant, le territoire pâle des couleurs chaudes disparaît dans le sol rosé (world)

- **Test contrôlé.** Dans la vraie manche, la grille est remplacée par 12 bandes (une par couleur : fort en haut, pâle au milieu, neutre en bas), puis capturée à chaque heure.
- **Résultat.**
  - À midi, tous les pâles se lisent.
  - Au couchant, le **pâle Corail** est indiscernable du sable rosé : on devine à peine le bord.
  - Pâle Carmin et pâle Rose sont très proches du sol (écart OKLab ΔE ≈ 4-5 mesuré, contre environ 10 pour Lagon et Lilas).
- **Preuves** : `swatches/004-swatch-couchant.jpg`, `crops/sw-couchant-left.png` et `crops/sw-couchant-mid.png`, à comparer avec `swatches/001-swatch-midi.jpg`. Scripts : `tools/polish/firsttime/swatches.mjs` et `de.py` (scratchpad).
- **Correction** (shader de territoire et palette, `src/host/render/world/*`, `palette.json`) :
  - planchers de contraste du pâle calculés **par keyframe** (ΔE OKLab minimal par rapport à `groundFlat` de l'heure) ;
  - au couchant, décaler le pâle chaud vers plus de chroma ou moins de luminance ;
  - ou renforcer le liseré de pigment du pâle quand l'écart au sol passe sous 8.

### 4 · À 9-12 oiseaux, on perd son oiseau (birds, hostui)

- **Constat confirmé.** Oiseaux d'environ 40-50 px de large, tous blancs. Les étiquettes n'apparaissent qu'aux événements. À 3 m d'une TV, on ne se retrouve que par déduction.
- **Preuves** : `swatches/001-swatch-midi.jpg` (12 oiseaux, étiquettes du départ), `swatches/004-swatch-couchant.jpg` et `swatches/005-swatch-grande-ombre.jpg` (peu d'étiquettes).
- **Correction** : au-delà de 6 oiseaux, un jeton-glyphe permanent de 18 px sous chaque oiseau humain (`WorldLayer`, le mécanisme du jeton daltonien existe déjà), et `birdRenderScaleMax` relevé. Voir aussi la piste qa.md §8.3.

### 3 · Écran titre : tour en très gros plan couverte d'une trame serrée, plans vides (staging, world)

- **Constat.**
  - Plusieurs plans de la boucle ont une tour au premier plan qui occupe le tiers ou la moitié gauche, juste derrière le logo (`fr-group/009`, `010`, `011`, `013`, `fr-keyboard/007`).
  - De près, sa surface porte une trame régulière d'environ 5 px sur toute la face visible, avec des anneaux concentriques sur les ornements (`crops/title-tower-hatch.png`). On lit du velours côtelé, pas un hachurage Moebius rare (bible §519 et §656 : hachures sur le flanc à l'ombre, pas de 6 px, et « rares »).
  - Un plan vide sans oiseau (`fr-group/008-title-1.jpg`, 2,5 s après l'ouverture).
  - Un œil barré (icône « caché ») flotte dans une cinématique (`fr-group/012-title-5.jpg`).
- **Correction** :
  - `src/host/camera/cine.ts` : rejeter un plan si une tour occupe plus de 25 % de l'écran ou coupe la zone du logo (le rectangle `title__logo` est connu), et exiger au moins un oiseau dans le cadre ;
  - shader des tours : faire décroître la densité de hachures avec la taille écran (pas en pixels au moins 10-12), ou les réserver à la face à l'ombre ;
  - masquer les jetons HUD (œil barré, chevrons) en mode démo.

### 3 · Salon PC : l'URL « ou ouvre … » déborde du cadre avec un domaine réel (hostui)

- **Constat.** Avec `https://ombres-011e623351e7.deploy.breizhware.com/play`, le texte colle aux deux bords du panneau et « ou » est coupé (le bloc mesure 430 px, soit toute la largeur du panneau). Cela arrivera **en production**.
- **Preuves** : `fr-group/017-lobby-longurl.jpg`, `en-group/019-lobby-longurl.jpg`.
- **Correction** (`Lobby.tsx`, `lobby.css`) :
  - retirer le préfixe de sous-domaine technique ou n'afficher que l'hôte court ;
  - sinon `font-size: clamp(...)`, césure après les points (`overflow-wrap:anywhere` avec `<wbr>` après chaque « . ») et marge intérieure garantie.

### 3 · Téléphone au salon : la carte des règles est coincée entre joystick et boutons ; sur petit écran, tout se chevauche (phone)

- **Constat.**
  - iPhone 15 Pro paysage : le socle du joystick déborde sur la carte (920 px² de recouvrement mesurés) et la carte touche COUP D'AILE (2 px d'écart). Voir `fr-group/030-A-lobby-thumb.jpg`, `021-A-lobby-0.jpg`.
  - Hauteur 320 px (iPhone SE, mais aussi un iPhone en paysage sous Safari avec ses barres) :
    - le bouton COUP D'AILE couvre la fin de l'objectif (« …qui peint fort ») ;
    - « Pouce ici » est coupé ;
    - le bouton **Compris !** des cartes sort de l'écran (bas à 332 px sur 320).
  - Preuves : `phone-gallery/015-fr-iPhoneSE-lobby.jpg`, `016-fr-iPhoneSE-intro.jpg`, `063-en-iPhoneSE-intro.jpg`.
- **Correction** (`src/phone/phone.css`, `GameScreens.tsx`) :
  - carte des règles en bandeau fin sous les objectifs, ou masquée tant qu'un pouce est posé ;
  - `@media (max-height: 360px)` : boutons à 30 % de la hauteur, cartes des règles en une colonne défilante et bouton « Compris » fixé en bas ;
  - tester à 667×340.

### 3 · Téléphone en manche : le bouton PIQUER et ses rayons sortent de l'écran et mordent sur COUP D'AILE (phone)

- **Constat.**
  - iPhone 15 Pro : l'étoile de rayons fait 237 px pour un bord droit à 679 px sur 659, et un bas à 419 px sur 393.
  - Pixel 7 : bord droit à 859 sur 839. iPhone SE : 587 sur 568.
  - Un rayon passe sur le bouton COUP D'AILE.
- **Preuves** : `phone-gallery/004-fr-iPhone15Pro-play-target.jpg`, `018`, `032`, `045`, `051`, `065`, `077` ; mesures dans `phone-gallery/_log.txt`.
- **Correction** (`Controller.tsx`, `.act__star`, `phone.css`) : dessiner les rayons dans le cercle du bouton (rayon limité à `min(viewport) - bouton`), ou ramener les rayons à un arc côté intérieur de l'écran ; `overflow:hidden` sur le conteneur des actions.

### 3 · Au scan, la TV annonce « Corail rejoint le désert » pour quelqu'un qui s'appellera Brieuc, en Safran (game)

- **Constat.** Le toast part à la connexion, avant le profil, avec la couleur provisoire. Quand plusieurs personnes scannent, la TV dit « Corail rejoint » deux ou trois fois pour des gens qui ne sont pas Corail.
- **Preuves** :
  - `fr-group/_log.txt` : « 44.0 toast « Corail rejoint le désert » » alors que le joueur est Brieuc/Safran ;
  - `en-group/_log.txt` : « Coral joins the desert » pour Sam ;
  - `fr-keyboard/_log.txt` : « Lagon rejoint le désert » pour Saguaro.
- **Correction** (`runner.ts` `addPhonePlayer`) : différer `host.toast.joined` à l'événement `profile` (profil validé) pour un téléphone nouveau ; à la connexion, au plus un toast neutre (« Un oiseau arrive… »).

### 3 · « Trois règles, pas une de plus » promet trop, et l'esquive n'est jamais expliquée (hostui, game)

- **Constat.**
  - Les cartes ne parlent ni de COUP D'AILE (esquive au « clac »), ni des tours (sable figé, invisibilité), ni de la couronne, ni de la Grande Ombre. Le joueur les découvre en jeu.
  - La seule aide pour l'esquive est la bulle « Au clac : COUP D'AILE ! » (EN « On the snap: WINGBEAT! »). « Clac » est un mot interne qu'un débutant n'a jamais entendu nommer.
  - « Pique d'en haut » ne dit pas ce que ça rapporte (voler la traînée).
  - « Le fort gagne » ne dit pas quoi.
- **Preuves** : `fr-group/037-rules-0.jpg`, `038-A-intro.jpg`, `_log.txt` (bulle « Au clac » à 146,2 s).
- **Correction** (`strings/host.ts`, `strings/phone.ts`, `strings/hints.ts`) :
  - titre des cartes : « Les règles » ou « Trois règles pour commencer » ;
  - carte 3 : « Pique d'en haut : sa traînée devient la tienne. » ;
  - carte 2 : « …Le fort recouvre le pâle. » ;
  - bulle d'esquive : « Il plonge sur toi : COUP D'AILE ! » (EN « Incoming dive: WINGBEAT! ») ;
  - si possible, une 4e vignette qui tourne au salon (COUP D'AILE / tours).

### 3 · Anglais : « Dive » désigne deux choses opposées (hostui, phone)

- **Constat.**
  - DIVE est le bouton qu'on maintient pour voler bas (PLONGER).
  - Mais « Dive from above » (carte 3), « Easier dives » (aide au vol), « diving on it steals double » (couronne), les stats « Dives 7 », « dives landed », « Successful dives » et « dodged {n} dives » parlent de l'attaque (PIQUER = « Strike »).
  - Au podium EN, Sam a « Dives 0 » et « Low 100 % » : contradictoire pour un lecteur.
- **Preuves** : `en-group/134-podium-5.jpg`, `en-group/_log.txt`, `strings/*.ts`.
- **Correction** : partout pour l'attaque, « strike » : « Strike from above », « Easier strikes », « striking it steals double », « Strikes », « strikes landed », « dodged {n} strikes », « Strike streak » (`host.ts`, `phone.ts`, `hints.ts`, `titles.ts`).

### 3 · On ne comprend pas pourquoi on gagne des « soleils » (hostui, phone)

- **Constat.**
  - Les résultats affichent « +4 », « +2 », « +0 » soleils, avec un total. La règle (oiseaux devancés + 1 au vainqueur, dernière manche ×2) n'est écrite nulle part.
  - Le débutant voit « 18,1 % » et « 2e », puis « +2 » sans savoir d'où ça vient.
  - Le brief demande qu'on comprenne pourquoi on gagne ou perd.
- **Preuves** : `fr-group/103-r1-night-2.jpg`, `phone-gallery/008-fr-iPhone15Pro-roundEnd.jpg`.
- **Correction** (`RoundResults.tsx`, `GameScreens.tsx`, chaînes) : sous l'en-tête Soleils, une ligne « 1 soleil par oiseau devancé, +1 au vainqueur » (« ×2 » à la dernière manche) ; au premier affichage, animer le calcul sur la ligne du joueur (« devance 2 oiseaux → +2 »).

### 3 · L'indication de l'heure dorée est ambiguë, et la flèche prévue n'existe pas (hostui, phone, game)

- **Constat.**
  - « Vole en travers des ombres pour balayer large. » se lit comme « vole à travers les ombres des tours », ce qui est l'inverse du conseil puisque ces ombres figent le sable.
  - Le GDD prévoit une flèche nord-sud dans la bannière (`effect: 'arrowNorthSouth'`, `src/director/hints.ts`), mais personne ne consomme cet effet : ni bannière TV, ni téléphone.
- **Preuves** : `fr-group/068-r1-golden.jpg`, `069-A-r1-golden.jpg`, grep de `arrowNorthSouth` (déclaration seulement).
- **Correction** : texte « Vole nord-sud, en travers de ton ombre : elle balaie large. » avec une flèche ↕ dans la bannière et sur le téléphone (`Announce.tsx`, et le toast du téléphone) ; même traitement pour `arrowEast`.

### 3 · Joueur au clavier : aucune aide sur les touches une fois entré (hostui)

- **Constat.** Après Espace, la ligne « Corail · Clavier 1 » apparaît avec trois ronds Vole / Plonge / Pique. Aucun texte ne dit « ZQSD pour voler, Espace maintenu = PLONGER, Maj = COUP D'AILE ». Il faut ouvrir Réglages, puis Touches. Le téléphone, lui, a ses objectifs expliqués.
- **Preuve** : `fr-keyboard/005-lobby-joined.jpg`.
- **Correction** (`Lobby.tsx`, `KeyboardJoinHint`) : une fois un groupe entré, remplacer le rappel par une carte de touches du groupe (`localButtonLabels` et les libellés de direction existent déjà), avec l'objectif suivant, comme sur le téléphone.

### 3 · Le passage au podium produit un pic sonore (audio)

- **Écoute instrumentée.** Enregistrement du vrai mixage du navigateur (titre → salon → manche → résultats → podium), `audio/fr-mix.webm`.
- **Constat.** Au passage au podium (stinger `gameWin` : harpe -16, gong -15, cri -20 et 4 notes, empilés), le niveau monte de -27 à -9/-10 dBFS RMS pendant environ 2,5 s. C'est 8 dB au-dessus du climax de la Grande Ombre (-17), avec une crête décodée à +1,6 dBFS. On sursaute ensuite à la chute vers la musique du podium (-23).
- **Preuves** : `tools/polish/firsttime/audiorec.mjs` et `audio_analyze.py` (sortie : niveaux par segment).
- **Correction** (`src/host/audio/sounds.ts`, `sfx.ts`) : `st_game_win_*` à environ -6 dB, étalés dans le temps, et le gong sous la harpe ; une écoute humaine reste nécessaire.

### 3 · Équilibrage solo : le Faucon écrase, mais la mesure du QA est biaisée (game)

- **Constat.**
  - Faucon Voyageur 1er partout : 3 manches sur 3 en groupe, 3 sur 3 en solo, où le joueur finit 4e avec 0 soleil, et en 1 manche EN (48 %).
  - Mais les pilotes téléphone restent **bloqués en PLONGER** : « En bas 100 % » (fr-group, podium) et « Au ras du sable 99 / 98 / 85 % » (solo), alors que le pilote alterne haut et bas. Le relâchement d'un seul doigt en CDP n'est pas pris. Des oiseaux toujours bas sont les proies idéales du Faucon, qui chasse les oiseaux bas.
  - Or c'est aussi le réflexe probable d'un débutant, qui garde le gros bouton enfoncé.
- **Preuves** : `fr-solo/_log.txt`, `fr-group/_log.txt` (podium), `tools/e2e/qa/pilot.mjs`.
- **Correction** :
  - réparer le relâchement dans `pilot.mjs` (touchEnd explicite du point 2) avant toute conclusion ;
  - côté jeu, en solo (1 humain), démarrer les bots à Oisillon à la première partie, ou remplacer le Faucon par la Pie dans `defaultBots(1)` (bots.md §8) ;
  - dans tous les cas, un playtest humain.

### 3 · Podium : oiseaux gris et raides, couronne invisible (birds, staging)

- **Constat.** Dernier plan de la partie. Les trois oiseaux perchés sont des silhouettes grises, ailes levées, cou tendu comme une pique. Aucune couronne n'est visible dans nos captures : elle est hors cadre ou sous le bandeau du titre.
- **Preuves** : `fr-group/191-podium-0.jpg`, `196-podium-5.jpg`, `en-group/134-podium-5.jpg`.
- **Correction** : rim-light de la couleur du joueur et remplissage de face (matériau oiseau, podium), couronne posée sur la tête du vainqueur et cadrage qui la laisse sous le bandeau (`camera/podium.ts`).

### 2 · Statistiques et titres : libellés trompeurs ou contradictoires (hostui)

- **« Volé 45 % »** : fraction cumulée de cellules reprises, qui peut dépasser le territoire final. Corail a « Volé 45 % » et 17 piqués mais finit 4e. Le mot « Volé » se lit aussi « a volé (en l'air) ».
- **Le Bâtisseur** : « …acquis **dès l'après-midi** » contre « Tout était déjà construit **à midi** » (EN : « since the afternoon » contre « by noon »).
- **Césure** « APRÈS- / MIDI » en fin de ligne.
- **« 14,8 % d'avance »** : ce sont des points, pas des pourcentages.
- Preuves : `fr-group/192-podium-1.jpg`, `103-r1-night-2.jpg`.
- **Correction** (`strings/host.ts`, `titles.ts`) : « Repris aux autres » avec une note « cumulé » ou en m² ; aligner le Bâtisseur (« Tout était construit avant l'heure dorée ») ; `hyphens: manual` avec espace insécable dans « après-midi » ; « 14,8 pts d'avance ».

### 2 · Réglages : tableau des touches mal aligné (hostui)

- **Constat.** « ou ← ↑ ↓ → » déborde sous l'en-tête Joueur 2, qui semble alors diriger avec les flèches et IJKL. « Plein écran F » est rangé dans la colonne Joueur 2 de la ligne Pause. La touche J2 s'affiche « ; » et « AltGr » (clavier QWERTY sans AltGr).
- **Preuve** : `fr-keyboard/002-settings-from-title.jpg`.
- **Correction** (`Settings.tsx`) : ligne dédiée « ou flèches (seul) », ligne Plein écran séparée, touches du J2 en cartouche avec nom lisible (« Point-virgule », « Alt droit ») via `keys.ts`.

### 2 · Salon : clavier et touche Échap (hostui, game)

- **Constat.**
  - Un joueur clavier ne peut pas quitter le salon.
  - Une fois entré, les flèches pilotent l'oiseau, donc on ne peut plus régler la partie au clavier.
  - Échap **et Retour arrière** ramènent au titre alors que des téléphones restent sur « Lancer la partie ». Leur oiseau n'est plus à l'écran et l'état devient incohérent.
- **Preuve** : `fr-keyboard/_log.txt` (« après Backspace : écran title », « téléphone après Échap PC : … Lancer la partie … »), `fr-keyboard/008-phone-after-pc-esc.jpg`.
- **Correction** (`nav.ts`, `runner.ts` `back`) :
  - au salon avec des joueurs présents, Échap demande confirmation, et Retour arrière ne fait rien ;
  - sortie clavier : maintenir Échap ou la touche Plonger 2 s ;
  - Tab pour rendre les flèches à l'UI.

### 2 · Titre : pas de QR ni de code avant d'appuyer sur une touche (hostui)

- **Constat.** Le runner sait ouvrir le salon quand un téléphone arrive au titre, mais le titre n'affiche ni QR ni code. Un groupe sans clavier ni souris à portée ne peut pas commencer.
- **Preuve** : `fr-group/007-title-0.jpg`.
- **Correction** (`Title.tsx`) : petit QR avec le code dans le pied de page du titre (la salle existe déjà), texte « Scanne pour jouer ».

### 2 · Téléphone : détails de mise en page (phone)

- En portrait, « Prendre mon envol » est **avant** le choix de couleur : on valide avant d'avoir choisi. Preuve : `fr-group/018-A-portrait-first.jpg`.
- Les cartes des règles du téléphone coupent mal (« 3. Pique d'en haut. À la / nuit… », « Le / fort gagne »). Preuves : `038-A-intro.jpg`, `023-A-lobby-2.jpg`. Il faut réutiliser `sentenceLines`.
- Les illustrations restent Corail et Lagon quelle que soit la couleur du joueur (Brieuc est Safran).
- Les oiseaux des cartes de la TV ressemblent à de petits avions, ceux du téléphone à des chevrons : iconographie incohérente. Preuve : `fr-group/037-rules-0.jpg`.
- Fin de partie : « 0 soleils » (FR : « 0 soleil »), et chiffres de titre et de votes dans une autre police (« 4 piqués réussis », « 0 sur 2 »). Preuves : `fr-solo/011-phone-podium.jpg`, `phone-gallery/010`.
- « 18,7 % du désert · sur 5 » : le « sur 5 » (le rang) est collé à la part.

### 2 · Salon PC : descriptions de bots tronquées (hostui)

- **Constat.** « Indigo · laboure au ras du s… », « balaie en longues li… ».
- **Preuve** : `fr-group/025-lobby-1phone.jpg`.
- **Correction** : `text-overflow` remplacé par un retour à la ligne, ou descriptions de 3 mots au plus (`host.botDesc.*`).

### 2 · Crédits anglais en partie en français (hostui)

- **Constat.** « Voix du narrateur synthétisée avec Pocket TTS de Kyutai », « poids du modèle », « Voix d'origine » en EN. « CC BY 4.0 » et « CC-BY 4.0 » mélangés.
- **Preuve** : `credits/007-en-credits-1.jpg`.
- **Correction** : chaînes `host.credits.voice.*` dans `credits.ts` plutôt que le texte brut du Markdown.

### 2 · Mixage : le titre est bien plus bas que le salon ; noms de couleur à faire écouter (audio)

- **Niveaux.** Titre -29,5 dBFS RMS contre salon -21,9 : la première impression sonore est environ 8 dB sous le reste, puis le son saute à « Jouer ».
- **Narrateur, bonne nouvelle.** Il reste intelligible dans le mixage : Whisper y reconnaît les répliques aussi bien que les clips seuls, fenêtre -1,5 s (`audio_control.py`). Le ducking fait son travail.
- **À écouter en priorité.** Même sur les clips **propres**, Whisper entend « La gomme » pour « Lagon », « Saffron » ou « Le franc » pour « Safran », « Leur doré » pour « L'heure dorée » et « elle fiche tout » pour « elle fige tout ».
- **Correction** : relever la musique du titre d'environ 6 dB (`music/`) ; écoute humaine des clips `firstCrown.1`, `lastRay.3`, `matchWin.3`, `golden1` et `greatShadow1` ; régénérer si besoin.

### 1 · Textes : maladresses FR (hostui, phone, audio)

- « La couronne : la piquer vole deux fois plus. » : « vole » est ambigu dans un jeu d'oiseaux (le salon dit « Vole » pour « voler en l'air »). Mieux : « La couronne : piquer son porteur rapporte double. »
- « Lagon a tout pris. Le désert s'incline. » est dit pour 33 % : réserver « landslide » aux écarts énormes ou nuancer.
- « Brieuc lance la partie » (téléphone des invités) se lit au présent. Mieux : « C'est Brieuc qui lance la partie ».
- « Le désert retient son souffle » sert à la fois pour la pause et pour « Dix secondes ».
- « Dernier couchant ×2 » : jargon au salon. Mieux : « Dernière manche ×2 ».

### 1 · Textes : maladresses EN (hostui, phone)

- « Drops from the sky, never for nothing » → « …and never in vain ».
- « Comes back from nowhere » → « Out of nowhere, at the very end ».
- Le titre dit « knocked down 5 times » (minuscule, alors que les autres statistiques commencent par le chiffre), le téléphone « Knocked out! ».
- « Change temper » → « Change personality ».
- Orthographe mêlée : colour / color, favourite, License.
- Noms tirés au hasard : « Alizé » garde son accent, « Sandy » détonne.

### 1 · Réplique commencée avant un changement de langue : elle finit dans l'ancienne

- Constat QA (qa.md §7), non rejoué ici.
- Le texte du sous-titre est figé à l'affichage (`narratorTextParts(cue, lang)`). À recalculer au changement de langue (`subtitleEvents` → `Announce.tsx`).

---

## Ce qui marche bien (à ne pas casser)

- **Parcours du téléphone.** Le profil en portrait est propre ; le paysage aussi.
- **Salon.** Les objectifs Vole / Plonge cochent tout seuls.
- **Solo complet depuis un seul téléphone** : lancer, Compris, Prêt, revanche, sans toucher au PC. L'appui court sur Pause affiche bien « Maintiens pour la pause ».
- **HUD.**
  - Cadran et bande de sable sont lisibles à 1080p.
  - Les bannières de phase sont sobres.
  - Le « 5 4 3 2 1 » est lisible.
  - La Grande Ombre est spectaculaire : front orange, ombres en bandes. Voir `fr-group/087-r1-t95.jpg`, `092-r1-t105.jpg`.
- **Résultats de manche.** La carte illuminée et le classement sont clairs. La suite est automatique en environ 18 s, ou immédiate quand tous les téléphones sont prêts.
- **Console propre** (PC et téléphones) sur toutes les passes. **Aucune clé brute** à l'écran, en FR comme en EN.
