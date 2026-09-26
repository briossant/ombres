# Critique audio : ce qu'on entend vraiment dans Ombres

Direction son, phase de polish. Personne n'avait écouté le jeu : j'ai donc enregistré le mix réel, en sortie du moteur, pendant des parties complètes jouées à vitesse réelle, puis je l'ai mesuré et fait « écouter » par Whisper. Aucun fichier du jeu n'a été modifié ; les outils sont sous `tools/polish/audio/`, les preuves sous `shots/polish/audio/`.

Le mix est propre (aucune saturation, crête max −1,1 dBFS, transitions sans trou), mais à 12 oiseaux ce sont les bruitages qui mènent : ils couvrent la musique pendant la première moitié de chaque manche et ils masquent le narrateur, que le ducking actuel ne protège pas, puisqu'il baisse la musique et laisse les bruitages en place. Les pires moments de voix tombent précisément sur les répliques qui comptent le plus : le nom du champion au podium, la Grande Ombre, les résultats.

## 1. Méthode

L'enregistreur (`tools/polish/audio/rec.mjs`) branche un AudioWorklet en parallèle de la chaîne de `src/host/audio/engine.ts`, via `?debug` et un `import()` du module audio dans la page. Il capte huit canaux : la sortie master stéréo (après glue, limiteur et saturation), puis, avant le master, la voix, la musique (après ducking et pause), l'ambiance, les bruitages, le retour de réverbe et l'interface. Un journal horodaté sur l'horloge audio accompagne le son : écrans, phases du soleil, sous-titres du narrateur, chaque son demandé au lecteur de bruitages (nom, fichier, joué ou refusé), événements de simulation.

| Enregistrement | Contenu | Durée |
|---|---|---|
| A | titre 40 s, salon, 2 joueurs clavier pilotés + 10 bots (12 oiseaux), partie de 5 manches (le salon était réglé sur 5), podium, retour salon, titre, crédits | 15 min 39 s |
| B | 2 téléphones (iPhone 15 Pro, Pixel 7) + 1 clavier + 1 bot, 1 manche, pause PC à t = 30 s, podium, crédits | 4 min 11 s |
| T | 1 téléphone + 1 clavier + 2 bots, 1 manche (essai de l'outil) | 4 min 19 s |

Analyse : sonie BS.1770 (`lufs.py`, momentanée, court terme, intégrée, LRA) par écran et par phase, pour le master et chaque stem (`analyze.py`) ; rapport voix / reste pleine bande, dans la bande de la parole (300-4000 Hz) et par octave (`bands.py`) ; réduction de gain du master (`gainred.py`) ; tonalité et justesse (`keys.py`, `tools/audio-analyze.py pitch`) ; planches zoomées (`zoom.py`). Chaque réplique a été extraite deux fois, mix complet et voix seule, puis transcrite par faster-whisper small avec les 12 noms de couleur en amorce (`transcribe.py`). Whisper est un auditeur plus tolérant qu'un humain dans un salon bruyant : quand il se trompe sur le mix et pas sur la voix seule, le masquage est réel.

Réglages par défaut partout (général 0,9, musique 0,7, effets 0,8, voix 0,9, narrateur « voix », FR). Qualité graphique basse pour limiter la charge ; elle ne touche pas l'audio.

Limites. Chrome headless, machine partagée avec d'autres agents : l'horloge audio a pris du retard par moments (voir P10), ce qui peut fausser quelques écarts temporels de l'ordre de la seconde. Les enregistrements A et T ont été faits avec une première version de l'enregistreur qui perdait 94 trames sur 22 144 ; l'analyse recale chaque événement sur l'axe réel du fichier (`timemap.py`), et le bug est corrigé pour B. Le narrateur anglais n'a pas été enregistré.

## 2. Les chiffres

Sonie intégrée du master, enregistrement A (12 oiseaux), réglages par défaut :

| Écran / phase | LUFS intégrés | Musique (stem) | Bruitages (stem) | Remarque |
|---|---|---|---|---|
| Titre (40 s) | −24,6 | −32,7 | −42,5 | 6 à 8 LU sous tout le reste |
| Salon (12 oiseaux) | −18,5 | −28,9 | −26,5 | bruitages plus forts que la musique |
| Cartes des règles | −18,0 | −33,7 | −26,4 | idem, 14,5 sons/s |
| Manche entière (compte à rebours → nuit) | −16,5 à −17,6 | −26,7 à −27,4 | −24,4 à −25,6 | sans la voix : −22,5 |
| Midi | −15,8 à −19,4 | −32,5 à −33,2 | −24,0 à −25,5 | musique 8 à 9 LU sous les bruitages |
| Après-midi | −17,5 à −20,5 | −30,1 à −31,1 | −25,1 à −27,9 | |
| Heure dorée | −15,9 à −18,4 | −26,2 à −27,0 | −23,1 à −25,3 | |
| Couchant | −16,0 à −17,9 | −24,5 à −26,2 | −23,6 à −27,1 | |
| Grande Ombre | −13,3 à −14,1 | −22,5 à −23,4 | −22,4 à −23,7 | la musique rattrape enfin les bruitages |
| Nuit (1,5 s) | −26,8 à −31,2 | coupée | coupés | −37 dBFS RMS, pas un silence |
| Résultats de manche | −18,3 à −19,2 | −34,5 à −35,1 | | la musique entre en fondu |
| Podium | −19,1 | −28,7 | | |
| Crédits | −23,1 | −28,9 | | |

Crête maximale −1,1 dBFS, LRA de la session 10,6 LU, aucune saturation. La chaîne master ajoute un gain statique de +5,2 dB par rapport à la somme des stems, alors que les gains nominaux donnent −3,7 dB : ce sont les +8,9 dB de gain de rattrapage automatique des deux `DynamicsCompressorNode` (spécification Web Audio). Réduction de gain médiane 1,1 dB, 2,1 dB pendant la voix, 5 dB au pire (`A_master_gain_reduction.txt`).

Narrateur, enregistrement A : 40 répliques ; 9, 8, 8, 5 et 4 répliques en manche (ouverture comprise) plus une aux résultats ; la voix occupe 16 %, 13 %, 12 %, 8 % et 7 % du temps de manche. Rapport voix / reste dans la bande de la parole : médiane 7,5 dB, minimum 2,9 dB ; sur 18 répliques sur 40, la pire fenêtre de 400 ms passe sous 0 dB. Dans les 34 répliques de manche, le masque dominant est toujours le bus des bruitages, en médiane 9,3 dB au-dessus de la musique déjà baissée. Whisper transcrit la voix seule avec 2,6 % d'erreurs par caractère (médiane) et le mix avec 7,4 % ; le mix est nettement pire sur 14 répliques sur 40.

## 3. Problèmes, du plus grave au plus léger

### P1. Le nom du champion est couvert par le stinger du podium (sévérité 4, audio)

La réplique du vainqueur de la partie démarre au même instant que `playStinger('gameWin')` : harpe (crête à +1,1 s), gong court à +0,25 s, arpège de tongue drum de 0,3 à 0,7 s, cri de buse à +0,9 s. Le nom de couleur, premier mot de la réplique, tombe entre 0,1 et 0,6 s, en plein dans l'attaque. Le bus interface n'est pas baissé sous la voix. C'est la réplique la plus masquée de chaque partie enregistrée : rapport voix / reste en bande parole 2,9 dB (A), 3,9 dB (B), 3,9 dB (T), pire fenêtre −6,6 dB, −8,5 dB, −2,2 dB. Whisper sur le mix de A : « Anis, le désert riche en racette couleur ». Même collision, moins forte, aux résultats de manche (`RESULTS_REVEAL_S` : réplique et `roundWin` au même instant, la harpe `harp_gliss_up_01` culmine 5 s après son départ, donc sous toute la réplique) : rapport 6,6 à 9,3 dB, pire fenêtre de −1,8 à +4,7 dB.

Preuves : `shots/polish/audio/A_zoom_podium.png`, `A_listen_08_podium.ogg`, `A_transcripts_whisper_small.txt` (ligne 859,4), `A_analysis.txt` section RÉPLIQUES. Reproduire : n'importe quelle partie jusqu'au podium.

Correction. Séquencer au lieu d'empiler, dans `runner.ts` : `showMatchPanel()` lance le stinger, puis la réplique 2,2 s plus tard (après le cri) ; `showRoundResults()` lance le stinger au dévoilement et la réplique 1,5 s après. En complément, faire entrer le bus `ui` dans le ducking (−6 dB, mêmes rampes) dans `engine.duck()`.

### P2. Le ducking baisse la musique, mais ce sont les bruitages qui masquent la voix (sévérité 4, audio)

`AudioEngine.duck()` (`engine.ts:187`) ne touche que la musique, son envoi de réverbe et l'ambiance. Or en manche la musique est déjà basse (−30 à −40 LUFS pendant les répliques de midi et d'après-midi) et les bruitages sont à −19 à −28. Par octave, sur les répliques de A (`A_bands_voice_vs_rest.txt`) : le rapport voix / reste vaut 12 à 15 dB sous 500 Hz, mais tombe à 0 dB en médiane à 1, 2 et 4 kHz, et à −16 à −18 dB pour 10 % des blocs ; dans ces bandes, les bruitages font 68 à 84 % de l'énergie qui masque, la musique 3 à 7 %. Or c'est à 1-4 kHz que se jouent les consonnes. Whisper le montre : « Le soleil va être » pour « Le soleil baisse », « les ondes » pour « les ombres », « Le touchant » pour « Le couchant ». À 4 oiseaux (B), la médiane remonte à +4 à +5 dB : le problème grandit avec le nombre d'oiseaux. La voix, elle, saute de 6 à 9 LU au-dessus du fond à chaque réplique (voix −15,5 LUFS avant master, fond −21 à −25), ce qui compense en force brute sans régler le masquage.

Preuves : `A_timeline.png` (bande du milieu : rapport par réplique), `A_bands_voice_vs_rest.txt`, `B_bands_voice_vs_rest.txt`, `A_listen_04_round2_golden_density.ogg`.

Correction, dans `engine.ts` : un gain de ducking sur `buses.sfx` et sur `sfxSendVol` (−5 dB, attaque 80 ms, relâche 400 ms) ; un filtre en cloche sur `world`, 2,5 kHz, Q 0,8, qui passe de 0 à −4 dB pendant la voix. Puis baisser la voix de 2 dB (le gain d'intelligibilité compense) pour réduire les sauts de sonie. La règle GDD « musique et ambiance à −6 dB » reste respectée ; c'est un ajout de présentation.

### P3. La fin de manche devient un monologue, collé au compte à rebours (sévérité 3, audio)

La réplique de la Grande Ombre (98 s) et « Dix secondes » (100 s) sont toutes deux de priorité 1 et durent 2,4 à 3,0 s : elles s'enchaînent dans 100 % des manches, 2,4 à 3,3 s d'écart. Quand le photo-finish s'ajoute (104 s, 2,6-2,8 s), trois répliques tombent en 6,4 s et la dernière recouvre les coups de bloc de bois « 5, 4 » des dernières secondes (−13 LUFS). Enregistrement A, manche 4 : voix de 680,1 à 689,2 s, bois à 687,3 et 688,2 s, pire fenêtre −3,9 dB. Le narrateur parle pendant 5,4 à 8,3 s des 13 dernières secondes, là où le GDD veut le battement de cœur au premier plan et où la bible sonore promet des répliques rares.

Preuves : `A_zoom_round4_climax.png`, `A_listen_06_round4_climax_3lines.ogg`, `A_zoom_round1_end.png`.

Correction, dans `src/director/narrator.ts` et `lines.ts` : ne pas dire « Dix secondes » si la réplique de la Grande Ombre a fini il y a moins de 4 s (le bol à 100 s et le cadran portent déjà l'information), ou fusionner les deux en une seule réplique courte. Photo-finish : ne la lancer que si elle finit avant `lastSecondsAt × T/110 − 0,2 s`, donc la vérifier à 101-102 s au lieu de 104 s.

### P4. Répliques posées sur le compte à rebours et la conque (sévérité 3, audio)

Dernière manche : la réplique « Le dernier soleil vaut double » part au lancement de la manche, donc sur les bâtons « 3, 2, 1 » et sur le riser `st_last_round`, alors que le GDD (§16.4 n° 3, §16.3) la veut avant le compte à rebours et exige le silence pendant celui-ci. Le riser culmine 4,03 s après son départ (`peakTime` du fichier) : son impact tombe 1 s après « Envol », sur rien. Ouvertures de manche : elles partent à « Envol », en même temps que la conque (`horn_conch`, 6,9 s, crête à +4 s) et la cloche ; la conque tient pendant toute la réplique, pire fenêtre de −0,9 à −3,4 dB ; Whisper entend « Le sable a tout oublié, c'est pas bon » (manche 4) et « Le désert et neuf, aux hommes, non » (manche 3).

Preuves : `A_zoom_lastround_intro.png`, `A_listen_07_lastround_intro.ogg`, `A_zoom_round1_start.png`, `A_listen_03_round1_start_noon.ogg`.

Correction. Dernière manche : dire la réplique pendant les résultats précédents, au moment où `continueResults()` lance la manche (retarder le compte à rebours de la durée du clip), ou tenir la bannière « Dernière manche » 3 s de plus avant le compte. Riser : `align: { peakAt: RULES.countdownSeconds }` dans `sounds.ts` pour que l'impact tombe sur « Envol ». Ouvertures : décaler la réplique à t ≈ 1,5 s × T/110 dans `opening()`, et couper la conque à 2,5 s (`duration: 2.5, release: 1`) dans `count_conch`.

### P5. À midi et l'après-midi, la musique est enterrée sous les bruitages (sévérité 3, audio)

La partition générative, la meilleure pièce du module son, ne s'entend vraiment qu'à partir de l'heure dorée. À 12 oiseaux, stem musique −32,5 à −33,2 LUFS à midi et −30 à −31 l'après-midi, contre −24 à −28 pour les bruitages : 5 à 9 LU d'écart pendant 55 s, la moitié de la manche. Même à 4 oiseaux (B), midi : musique −34,5, bruitages −24,6. Les notes du module annoncent « musique de −26 (midi) à −18 (Grande Ombre) » ; on mesure −33 à −23, soit 6 à 7 dB de moins, exactement le curseur musique par défaut (0,7² = −6,2 dB). Le mix a vraisemblablement été calé curseurs à 1.

Preuves : tableau du §2, `A_analysis.txt`, `B_analysis.txt`.

Correction. Recaler avec les réglages par défaut : +4 dB sur les couches de midi et d'après-midi de la partition (`music/score.ts`, `instruments.ts`) ou `volMusic` par défaut à 0,85 (`settings.ts`), puis le correctif de densité de P6 pour les bruitages. Viser, hors voix, bruitages et musique à ±2 LU l'un de l'autre à midi.

### P6. À 12 oiseaux, les bruitages deviennent une nappe où l'on ne reconnaît plus rien (sévérité 3, audio)

En manche : 8 à 13 sons par seconde en moyenne, jusqu'à 33/s. Les bots sonnent exactement comme les humains : le COUP D'AILE (`flap_strong`) est le premier contributeur d'énergie des bruitages (11,7 %, 0,62 par seconde, surtout des bots), devant la touche (9 %). On n'entend plus son propre coup d'aile. Le même fichier `whoosh_pass_02` sert à cinq sons différents (`flap_whoosh`, `dive_down`, `tower_scrape`, `hidden_in`, `feint`) : 1,6 lecture par seconde en manche, 1 218 sur la session. Le « tsk » : 3,9 lectures/s et 70 % de refus par le temps de garde, discret en énergie (2,5 %) mais un grésillement permanent.

Preuves : `A_analysis.txt` (BRUITAGES PAR SEGMENT, fichiers les plus joués), `A_timeline.png` (bande du bas), `A_listen_04_round2_golden_density.ogg`.

Correction, dans `sfx.ts` : règle de priorité par joueur, bots à −5 dB sur les sons de « lit » (`flap_strong`, `flap_whoosh`, `flap_climb`, `dive_down`, `tsk`, `tower_*`) ; atténuation globale de ces sons en −10·log10(n/6) dB au-delà de 6 oiseaux ; plafond de 3 « tsk » par seconde tous oiseaux confondus. Dans `sounds.ts`, 3 ou 4 variantes de souffle pour `flap_whoosh` et des fichiers distincts pour `dive_down` et `hidden_in`.

### P7. Le salon et les cartes des règles sonnent comme une manche (sévérité 3, audio)

La simulation du salon joue les sons de combat avec le profil `lobby` à −2 dB seulement (`sfx.ts:508`). À 12 oiseaux : bruitages −26,5 LUFS, plus forts que la musique du salon (−28,9), 11 sons/s, pointes à 31/s. Les « gros vols » déclenchent un sub-drop (`steal_sub`) toutes les 1,5 à 2,5 s (19 en 30 s ; encore 10 en 24 s à 4 oiseaux), avec des coups de poing, des cris de victime et des « boums » de piqué entre bots. Même chose derrière les cartes des règles (14,5 sons/s, musique à −33,7), au moment où le groupe lit.

Preuves : `A_zoom_title_lobby.png`, `B_zoom_lobby_joins.png`, `A_listen_02_lobby12_rules.ogg`.

Correction : profil `lobby` à −8 dB ; au salon, ne jouer `bigSteal`, `victim_cry`, `stun_tumble` et `dive_boom` que si un humain est en cause (le son de touche reste un retour pour l'objectif « Pique ») ; −8 dB de plus sur les bruitages quand l'écran audio vaut `intro` (`AudioSystem.setScreen`).

### P8. L'écran des résultats est muet pendant ses deux animations (sévérité 3, hostui)

`RoundResults.tsx` anime un décompte des parts de 3 s puis des soleils qui volent vers chaque nom (240 ms d'écart, jusqu'à 7,4 s). L'API audio prévoit exactement ces sons (`playUi('count', { value })`, `playUi('sun', { value: rang })`, une gamme qui monte), mais rien ne les appelle : sur les 5 écrans de résultats de A, on n'entend que l'arpège, la harpe, la cloche et le clic de confirmation. Le brief demande des retours sonores ; c'est l'écran vu cinq fois par partie.

Preuves : `A_analysis.txt` (segments `roundResults` : `ui_note` ×3, `st_round_win_*`, rien d'autre) ; `grep "playUi('sun'" src` ne trouve rien.

Correction : étendre `NavSound` (`nav.ts`) avec `count` et `sun`, appeler `count` à 10-12 Hz pendant `COUNT_MS`, et `sun` à l'arrivée de chaque `FlyingSun` (fin de son animation). Garder ces sons à −6 dB et les faire démarrer après la réplique de résultats (voir P1) pour ne pas la couvrir.

### P9. En partie de 5 manches, le narrateur ne commente plus le soleil aux manches 4 et 5 (sévérité 3, audio)

`golden` et `sunset` ont trois variantes et pas de `reuse` (`lines.ts:135-136`) : une fois les trois dites, les manches 4 et 5 n'ont plus ni heure dorée ni couchant. Enregistrement A : manche 4 muette de 599,5 à 680,1 s (80 s), manche 5 de 716 à 796 s ; 5 et 4 répliques contre 8-9 aux premières manches. Le brief cite le « soleil qui descend » parmi les moments à ponctuer. L'option 5 manches est proposée dans le salon.

Preuves : `A_analysis.txt` (RÉPLIQUES), `A_timeline.png`.

Correction : `reuse: true` sur `golden` et `sunset` (la moins récente revient), ou deux variantes de plus par langue (8 clips neutres à générer avec `tools/tts/narrator.sh`).

### P10. L'horloge audio décroche au climax, et une réplique est coupée en plein mot (sévérité 3, audio)

Mesuré sur les repères d'une seconde du journal : l'horloge audio avance à 0,94-0,97 fois le temps réel en moyenne pendant l'heure dorée, le couchant et la Grande Ombre à 12 oiseaux (10 % des secondes sous 0,75-0,84), contre environ 1,0 aux menus et aux résultats. Dans la Grande Ombre de la manche 2, elle descend à 0,57-0,87. Le directeur du narrateur compte en `performance.now()`, la voix joue en temps audio : « Dix secondes » est parti 2,41 s après « La falaise lâche son ombre. Dépêchez-vous. » (clip de 2,84 s) et `NarratorPlayer.play()` a coupé la première réplique ; Whisper entend « Dépêche… 10 secondes ». Le sous-titre a disparu 1 s trop tôt. Réserve : Chrome headless sur une machine chargée par d'autres agents. Mais les retards se concentrent dans les phases les plus denses, ce qui désigne la charge du thread audio (le module annonce déjà 58 % d'un cœur dans la Grande Ombre). Sur un vrai PC, un thread qui décroche craque.

Preuves : `A_listen_09_gs_line_cut.ogg`, `A_transcripts_whisper_small.txt` (358,6 s), rapports par phase dans ce document.

Correction : mesurer sur la machine cible avec `tools/audio-cpu.mjs --probe=round:99` à 12 oiseaux ; réduire la création de nœuds (bots hors cadre sans `flap_climb`, `maxTotalVoices` de 48 à 24 dans la Grande Ombre, P6 réduit déjà le débit). Côté narrateur : donner au directeur l'horloge audio (`ctx.currentTime`) plutôt que `performance.now()`, et dans `NarratorPlayer.play()` attendre la fin d'une voix à qui il reste moins de 0,8 s au lieu de l'interrompre.

### P11. Le narrateur rejoue les mêmes répliques d'horloge à chaque session (sévérité 2, audio)

`NarratorDirector` tire ses variantes avec une graine fixe (`prng(options.seed ?? 0x0b5e)`, `narrator.ts:206`) et le runner n'en passe pas. Les trois enregistrements, lancés séparément, ont tous dit `golden3` puis `sunset3` à la première manche, et deux sur trois `greatShadow2` puis `tenSeconds2`. Un groupe qui relance le jeu le soir suivant réentend les mêmes phrases aux mêmes instants.

Correction : `new NarratorDirector({ seed: … })` avec la graine de partie, ou un `reseed(matchSeed)` dans `startMatch()`.

### P12. Musiques d'entracte répétitives (sévérité 2, audio)

La boucle du salon dure 24,5 s. Un salon réel dure 1 à 3 minutes le temps que chacun scanne le QR, choisisse sa couleur et fasse ses objectifs, et on y revient après chaque partie : 3 à 7 passages de la même boucle. Les résultats de manche repartent toujours de 0 s (`START_AT` ne vaut que pour le podium) : on entend cinq fois par partie les mêmes 15 premières secondes de « Synthwave 4k », dont les 10 premières à −24,8 LUFS dans le fichier.

Correction (`music/tracks.ts`, `music/director.ts`) : départ des résultats décalé selon l'index de manche (par exemple 0, 32, 64 s, calés sur des débuts de phrase) ; au salon, une piste plus longue, ou l'alternance de deux boucles, ou une variante de la partition générative en sol.

### P13. L'écran titre est 6 à 8 LU sous le reste du jeu (sévérité 2, audio)

Titre : −24,6 LUFS sur 40 s (−28 sur les 14 premières secondes de B), contre −18,5 au salon et −16,5 à −17,6 en manche. La piste du titre ouvre sur 13 s à −33/−38 LUFS momentanés dans le fichier même, sous un fondu de 3 s : au premier clic, on entend presque rien pendant plus de 10 s, puis le salon arrive 6 LU plus fort. Le calme étrange est voulu, le quasi-silence de premier contact ne l'est probablement pas.

Correction : `START_AT.title_zhelanov_ambient_1 = 13` dans `tracks.ts` (là où la nappe entre, −27 puis −16 à −22), et +2 dB sur cette seule piste.

### P14. Deux couches tonales hors tonalité (sévérité 2, audio)

Le carillon d'ambiance du salon (`amb_chimes_loop`, joué en continu à −31 LUFS) a pour fondamentale fa5 −24 cents et des partiels en ré, fa, sol♯, la♯ à ±30-45 cents. La boucle du salon est en sol majeur (+1 c). Fa naturel contre fa♯, la♯ et sol♯ hors gamme, le tout un quart de ton faux : c'est le seul fichier tonal qui n'a pas été réaccordé au build. Le chroma du stem ambiance au salon sort en fa mineur, celui de la musique en sol majeur. Plus léger : la musique du titre est en mi♭ mineur alors que les sons d'interface tonals sont en la (`ui_pluck` la4 au « Jouer », notes de tongue drum quand un téléphone rejoint sur le titre) ; la contre mi♭, c'est le triton.

Preuves : `shots/polish/audio/keys.txt`.

Correction : réaccorder ou remplacer le carillon par des lames en sol pentatonique (sol, la, si, ré, mi) dans `tools/audio-build.py`, ou le retirer sous la boucle du salon. Pour le titre, transposer `ui_pluck` d'un triton quand l'écran audio vaut `title`, ou choisir une piste de titre en la mineur.

### P15. Les coups de bois « 5, 4, 3, 2, 1 » tombent à côté du battement de cœur (sévérité 2, audio)

Le cœur de la Grande Ombre accélère de 1 à 2 Hz sur la grille de la partition ; les coups de bois (`last_tick`, −13 LUFS, les plus forts de la manche avec la conque) partent des secondes entières de la simulation. Mesuré sur les cinq manches de A : 150 à 290 ms d'écart avec le battement le plus proche pour les coups « 4 » et « 3 », des doubles frappes au moment le plus tendu.

Correction : faire jouer les dernières secondes par la partition (`RoundMusic.onEvent('lastSeconds')`) sur le temps le plus proche, ou remplacer le bois par un accent sur le battement concerné.

### P16. Stinger de pause et de reprise joué deux fois (sévérité 1, audio)

`runner.setPaused()` appelle `setAudioPaused()`, qui joue déjà `stinger('pause' | 'resume')` (`audio/index.ts:111`), puis `playStinger()` à nouveau (`runner.ts:1040`). Journal de B : deux `st_pause` à 79,319 s, deux `st_resume` à 85,441 et 85,444 s. La polyphonie de 1 coupe la première voix après 50 ms : une attaque doublée, et du travail inutile.

Correction : supprimer l'un des deux appels, par exemple celui de `runner.ts:1040`.

### P17. Clic de confirmation sans geste à la fin des résultats (sévérité 1, audio)

`continueResults()` joue `playUi('confirm')` même quand c'est le délai de 15 s qui enchaîne : cinq clics fantômes dans A, dont un collé au riser et à la réplique de la dernière manche.

Correction : ne jouer `confirm` que sur une action de joueur (paramètre de `continueResults()`).

### P18. Le « silence » de la nuit est un creux à −37 dBFS (sévérité 1, audio)

Pendant les 1,5 s de gel, la musique et les bruitages sont bien coupés en 40 à 160 ms, mais le master reste à −36 à −38 dBFS RMS : hurlement et vent de nuit (−41 dB avant master) relevés par les +8,9 dB de rattrapage des compresseurs. Le GDD annonce « 1,5 s de silence » ; on entend une chute de 18 à 20 dB, pas le vide. Le gong arrive bien à +1,5 s.

Correction : dans `ambience.ts`, à la nuit, toutes les couches à `OFF` pendant 1,3 s avant les grillons ; en profiter pour compenser le rattrapage automatique (gain `master` réduit d'autant, ou `knee` et `threshold` revus) afin que les niveaux calibrés soient ceux qu'on entend.

### P19. Voix plafonnée à 9 kHz (sévérité 1, audio)

Les clips du narrateur sont en MP3 24 kHz à 32 kb/s : plus rien au-dessus de 9 kHz (−104 dB). À côté de bruitages en 44,1 kHz, la voix sonne un peu étouffée, et ses sifflantes sont les premières masquées (P2).

Correction : ré-encoder depuis le cache à 48 kb/s (`tools/tts/narrator.sh`, quelques minutes, environ +4 Mo) et poser un plateau de présence (+2,5 dB au-dessus de 3 kHz) sur le bus voix.

## 4. Ce qui tient

Aucune saturation, crête max −1,1 dBFS. Aucun trou aux transitions : le seul passage sous −50 LUFS pendant plus de 0,5 s est le chargement. La coupure de la nuit tombe à ±60 ms de l'événement, le gong à 1,5 s. La montée de manche existe et s'entend : sans la voix, −22,5 LUFS en moyenne, de −24 à midi à −19,5 dans la Grande Ombre, avec la musique qui passe de −33 à −23. Chaque ligne de la table des signes du GDD qui prévoit un son en a un. La partition tourne autour de la mineur et de ses relatifs (do majeur, fa lydien au couchant) à −3/+1 cent du la 440 ; les résultats et le podium sont en do majeur, et les stingers et notes de joueur qui s'y posent sont justes. Isolée, la voix passe : Whisper en retrouve le texte à 2,6 % d'erreurs et les noms de couleur 15 fois sur 16.

Non re-vérifié ici : le changement de langue pendant une réplique (relevé par la QA). Le narrateur anglais n'a pas été enregistré.

## 5. Fichiers

Outils : `tools/polish/audio/rec.mjs` (enregistreur), `record-game.mjs` (scénario complet, options `--kb --phones --birds --rounds --pause`), `analyze.py`, `bands.py`, `gainred.py`, `keys.py`, `zoom.py`, `transcribe.py`, `timemap.py`, `lufs.py`. Relancer : `PORT=8825 pnpm dev`, puis `SCRATCH=<dossier> PORT=8825 node tools/polish/audio/record-game.mjs --name=A --kb=2 --birds=12`, puis `nix-shell -p 'python3.withPackages(p:[p.numpy p.scipy p.soundfile p.matplotlib])' --run "python3 tools/polish/audio/analyze.py <dossier>/rec/A A --plot A.png --clips clips"`.

Preuves dans `shots/polish/audio/` : frises complètes `A_timeline.png`, `B_timeline.png`, `T_timeline.png` ; planches `A_zoom_*.png`, `B_zoom_*.png` ; extraits à écouter `A_listen_01` à `09` et `B_listen_pause.ogg` (OGG stéréo, sortie master) ; mesures `A_analysis.txt`, `B_analysis.txt`, `*.analysis.json`, `A_bands_voice_vs_rest.txt`, `B_bands_voice_vs_rest.txt`, `A_master_gain_reduction.txt`, `keys.txt` ; transcriptions `A_transcripts_whisper_small.{txt,json}`. Les enregistrements complets 8 canaux (A : 670 Mo) sont restés dans le scratchpad de la session.
