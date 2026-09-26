# Correcteur audio : ce qui a été fait, comment c'est vérifié

Périmètre : `src/host/audio/**`, `public/audio/**`, `tools/tts/**`, `src/shared/strings/{narrator,hints}.ts`, et par délégation `src/director/narrator.ts` et `lines.ts`. Ordres : `docs/polish/ORDERS.md` §8 (A1 à A12). Preuves : `shots/polish/fix-audio/`.

## Méthode de mesure

- **Enregistrement du mix réel**, comme la critique audio : partie complète à vitesse réelle, 2 joueurs clavier pilotés + 10 bots (12 oiseaux), 5 manches, titre → salon → cartes → manches → résultats → podium → crédits. L'enregistreur est dérivé de `tools/polish/audio/rec.mjs`, avec 9 canaux : master, voix, musique, ambiance, bruitages **après ducking**, réverbe, interface **après ducking**, et le **monde traité** (après l'égaliseur de voix). Le « reste » qui masque la voix = monde traité + interface. Le client HMR de Vite est neutralisé dans la page, parce que les six autres correcteurs éditent `src/` en même temps.
- **AVANT** = enregistrement `before`, fait avant toute modification (584 s) ; **APRÈS** = `after2` (859 s), et `after3` (1 manche, pause) pour les derniers réglages. Analyses : `analyze.py`, `bands.py`, `zoom.py`, `transcribe.py` (Whisper small), adaptés au 9ᵉ canal, plus trois scripts de journal (fin de manche, voix coupées, doublons, densité, émergence). Scripts et WAV : scratchpad de la session ; captures et planches : `shots/polish/fix-audio/`.
- **Rendus hors ligne** (`tools/audio-render.mjs --real --birds=12`, vraie simulation, réglages par défaut) : mix, musique seule, bruitages seuls. Ils sont déterministes et échappent à la charge de la machine, d'où leur usage pour les équilibres (A4, A5), l'alignement des coups de bois (A7) et le silence de nuit (A12).
- **Limite** : la machine est partagée et très chargée (charge 25 à 35 sur 12 fils). Dans l'enregistrement AVANT, l'horloge audio est tombée à 0,3-0,66 × le temps réel en fin de manche : les écarts temporels y sont faussés. APRÈS : 0,93.
- **Piège trouvé, contourné** : `rec.mjs` importe `/src/host/audio/index.ts`. Dès qu'un fichier audio a été modifié après le lancement du serveur, Vite sert le jeu avec `?t=…`, et l'import du script crée un **deuxième système audio**. Un premier enregistrement APRÈS (`after1`, 17 min) n'avait ainsi capté que les bruitages, en doublant le coût CPU ; je l'ai jeté. Le jeu expose maintenant son système sous `?debug` (`window.__ombresAudio = { system, subtitleEvents }`, `src/host/audio/index.ts`), et mon enregistreur s'y branche. Il faudra reporter ce branchement dans `tools/polish/audio/rec.mjs`, qui n'est pas dans mon périmètre.

## Ordres

### A1 · Les répliques des résultats et du podium ne sont plus couvertes par leur stinger · FAIT

- `runner.ts` (edits ciblés) : `showMatchPanel()` joue le stinger, puis la réplique du champion **2,2 s** plus tard. `showRoundResults()` joue le stinger au dévoilement, puis la réplique **1,5 s** plus tard. Deux constantes : `RESULTS_LINE_DELAY_S`, `PODIUM_LINE_DELAY_S`.
- `engine.ts` : `duck()` baisse aussi le **bus interface de −6 dB**, avec les mêmes rampes (80/400 ms).
- `sounds.ts` / `sfx.ts` : `st_game_win_*` à **−6 dB** (harpe −22, gong −21, cri −26, notes −10), entrées étalées (gong à 0 s, harpe à 0,3 s, notes de 0,75 à 1,23 s, cri à 1,1 s). Tout est retombé quand le nom est dit. Harpe des résultats : on joue la fin du glissando (`align: { peakAt: 1.2 }`, fondu d'entrée 0,3 s), qui culmine avant la réplique au lieu de 5 s après.
- En plus, les **soleils des résultats** (câblés par hostui, H11) arrivaient par dizaines pendant la réplique : 37 notes et verres sous `roundWin3`, soit 99 % du masque entre 2 et 4 kHz. Désormais une note au plus toutes les 0,12 s, l'arpège qui monte puis repart, le verre une fois sur trois, et −4 dB sans verre tant que la voix parle.
- **Vérifié** (AVANT → APRÈS, enregistrement à 12 oiseaux) :
  - réplique du champion : parole/reste en bande parole **4,0 → 22,9 dB**, pire fenêtre de 400 ms **−2,4 → +12,5 dB** ;
  - Whisper sur le mix : « Sarcelle, le Déserve retiendra cette couleur. », nom du champion juste, et même transcription que la voix seule (« Déserve » est un défaut du clip) ;
  - niveau au passage au podium : court terme max **−15,0 LUFS**, contre −14,2 à −15,1 pour la Grande Ombre, donc sous le climax (critère : Grande Ombre + 2 LU). AVANT : −11,1 LUFS en 2 s ;
  - répliques de résultats : parole/reste 5,9-8,5 dB AVANT ; 7,1-9,9 dB dans `after2`, où les soleils couvraient encore la voix ; **11,5 dB** (pire fenêtre +4,1) dans `after3`, soleils limités. Dans la bande 2-4 kHz des résultats, le rapport médian passe de −1,8/+2,4 dB (`after2`) à **+12,2/+15,1 dB** (`after3`).
  - Planches : `A1_podium_before.png` / `A1_podium_after.png` (l'interface, en orange, passait à −17 LUFS sous la voix ; elle culmine maintenant avant elle puis tombe à −45), `A1_results_after.png`.

### A2 · Le ducking baisse ce qui masque vraiment la voix · PARTIEL (fait tel quel ; un critère sur deux atteint)

- `engine.ts` : `sfxDuck` et `sfxSendDuck` à **−5 dB** (80/400 ms) ; cloche `voiceEq` sur le monde, 2,5 kHz, Q 0,8, **0 → −4 dB** pendant la voix ; voix **−2 dB** (`VOICE_TRIM_DB`). La règle du GDD (musique et ambiance −6 dB) est inchangée.
- **Vérifié** (répliques en manche, 12 oiseaux) :
  - parole/reste en bande parole : médiane **5,7 → 9,9 dB**, minimum −0,1 → 6,3 dB ; pire fenêtre de 400 ms : médiane −1,3 → +2,3 dB, négative pour 24 répliques sur 37 → 7 sur 33 ;
  - Whisper small, 40 répliques de `after2` : CER moyen **6,1 % sur le mix contre 6,0 % sur la voix seule** (critère ≤ 1,5×, atteint) ; médianes 4,2 % et 0,0 %. Le mix est nettement pire que la voix sur 8 répliques sur 40 (la critique en comptait 14 sur 40). Les 16 noms de couleur sont retrouvés dans le mix ;
  - `bands.py`, par octave, répliques de manche : 1 / 2 / 4 kHz = −1,7 / −1,4 / −2,8 dB AVANT, **+1,4 / +3,8 / +0,1** (`after2`), −0,3 / +7,8 / +3,7 (`after3`, une manche). **Critère « médiane ≥ +6 dB entre 1 et 4 kHz » non atteint** à 12 oiseaux : il faudrait baisser encore les bruitages (−8 dB) ou ne plus baisser la voix. Je ne l'ai pas fait : un monde creusé de 8 dB pendant 22 % de la manche (8 répliques de 3 s) sonne vide, et le critère perceptif (Whisper) est déjà tenu. À trancher par une écoute humaine.

### A3 · Narrateur : une fin de manche qui respire, des ouvertures dégagées · FAIT (un critère tenu 3 fois sur 5)

- `src/director/narrator.ts` : « Dix secondes » se tait si la Grande Ombre a fini de parler il y a moins de 4 s (ou attend encore son tour) ; photo-finish décidé à **101,5 s** × T/110 ; **aucune réplique de manche** ne démarre si elle ne finit pas 0,2 s avant les coups de bois (T − 5) ; ouverture à **1,5 s** × T/110, et silence des événements jusque-là (une touche du compte à rebours ne passe plus sur la conque). `announceLastRound()` (nouvelle API).
- `runner.ts` (edit ciblé) : `continueResults()` fait dire « Le dernier soleil vaut double » sur l'écran des résultats, puis lance la manche après le clip (`nextRoundAt` empêche un double lancement). `sounds.ts` : `st_last_round` avec `align: { peakAt: RULES.countdownSeconds }` (l'impact tombe sur « Envol ») ; `count_conch` coupé à 2,5 s, relâche 1 s.
- Tests : `npx vitest run src/director` vert (75 tests, dont 6 nouveaux ou réécrits : ouverture à 1,5 s, Dix secondes, photo-finish qui ne tient pas, dernier soleil annoncé, graine, 5 manches ; les invariants des manches synthétiques vérifient qu'aucune réplique ne touche les 5 dernières secondes).
- **Vérifié** (5 manches, journal) :
  - répliques posées sur les coups de bois : **5 manches sur 5 → 0 sur 5** ;
  - ouverture sur la conque : 4 manches sur 4 → aucune avant 1,5 s (ouvertures à +1,50 à +1,53 s d'« Envol » ; l'outil en compte une, partie à 1,50 s pile, en limite de fenêtre) ; la conque décroît dès 1,5 s et se tait à 2,5 s ;
  - parole dans les 13 dernières secondes : 6,7 / 9,3 / 5,5 / 3,1 / 4,9 s → **5,3 / 3,1 / 5,4 / 2,4 / 2,8 s**. Critère « ≤ 3 s » tenu quand la Grande Ombre parle seule (3 manches sur 5). Avec un photo-finish, on entend deux répliques (≈ 5,3 s), toutes deux avant les coups de bois. C'est ce qu'autorise l'ordre (photo-finish vers 101-102 s) ;
  - « Le dernier soleil » passe des bâtons « 3, 2, 1 » à l'écran des résultats : parole/reste **8,6 → 14,6 dB** ;
  - planches `A3_climax_before/after.png`, `A3_opening_before/after.png`, `A3_lastround_after.png`.

### A4 · À 12 oiseaux, des bruitages hiérarchisés · FAIT

- `sfx.ts` : sons de lit (`flap_strong`, `flap_whoosh`, `flap_climb`, `dive_down`, `tsk`, `tower_*`, `hidden_in`) à **−5 dB pour un bot**, et **−10·log10(n/6) dB** au-delà de 6 oiseaux (−3 dB à 12) ; « tsk » plafonné à **3 par seconde**, tous oiseaux confondus.
- Assets : 3 souffles de plus pour `flap_whoosh` (4 variantes, calées pour culminer 0,15 s après le battement), `dive_down` et `hidden_in` sur des fichiers à eux. Les cinq fichiers sont tirés d'assets CC0 déjà présents dans `assets-staging` (freakinbehemoth 243400, crackles04 369698, EcoDTR 27281), construits par `tools/audio-build.py` et crédités dans `docs/CREDITS-sources.md`.
- **Vérifié** : `flap_strong` passe de **1ᵉʳ contributeur (11,5 %) à hors du top 8** ; les coups de poing, piqués et cris mènent (le lit ne couvre plus les événements). Rendu hors ligne à 12 oiseaux : `flap_strong` 3,8 %. Densité en manche : **16,9 → 10,0 sons/s** ; « tsk » 5,2 → 2,45/s. `whoosh_pass_02` : 1 136 → 257 lectures. Équilibre avec la musique : voir A5.

### A5 · Musique : audible à midi, un titre qui démarre, moins de redites · FAIT

- `score.ts` / `instruments.ts` : relief **+4 dB** du son direct de la partition à midi et l'après-midi (nœud `lift`), qui retombe sur les deux premières mesures de l'heure dorée, quand percussions, oud et duduk entrent.
- `tracks.ts` : titre à **13 s** et **+2 dB** ; résultats de manche repartant de **0 / 43,95 / 90,4 / 21,85 / 67,3 s**, des débuts de section mesurés (nouveauté spectrale, attaques ; sections toutes les ~23 s) ; salon : un passage sur deux plus sourd (passe-bas 1,9 kHz, −2,5 dB, fondus de 3 s), ce qui fait un cycle de 49 s au lieu de 24,5 s. Avec le carillon généré (A11), le salon ne tourne plus en rond.
- **Vérifié** :
  - midi, musique − bruitages (12 oiseaux, enregistrement) : −9,4 / −10,8 / −9,3 / −7,8 / −6,7 LU → **−2,2 / −1,7 / −0,5 / −2,9 / −1,0 LU** ; après-midi −4 à −6 → −1,8 à +0,2. Rendu hors ligne : midi 0,1 LU d'écart, après-midi 0,6, heure dorée 0,9 ;
  - titre vs salon : 7,0 → **2,6 LU** (`after2`) et 2,1 LU (`after3`) ;
  - résultats successifs : corrélation spectro-temporelle des 8 premières secondes de musique **0,58-0,68 → −0,12 à 0,19** (ils ne commencent plus pareil).

### A6 · Salon et cartes plus calmes · FAIT (salon à −10 dB, pas −8)

- `sfx.ts` : profil salon **−10 dB** (à −8 dB, les bruitages restaient 2,2 LU seulement sous la musique, mesuré) ; cartes des règles (`intro`) **−8 dB** de plus ; au salon, `dive_boom`, `victim_cry`, `stun_tumble` seulement si un humain est en cause, et le gros vol (sub + sable) seulement quand un humain vole un autre oiseau (peindre du sable neuf n'est pas un vol).
- **Vérifié** (`after3`) : bruitages − musique au salon **+3,9 → −4,2 LU** ; cartes **+6,5 → −9,4 LU** (critère ≤ −3). Sub-drops au salon : 19 en 30 s (critique) ; restent 7 en 40 s, **tous déclenchés par un joueur humain**, aucun entre bots.

### A7 · Accents · PARTIEL (alignement fait ; émergence de la couronne et de l'esquive sous +3 dB à 12 oiseaux)

- `sounds.ts` / `sfx.ts` : cloche de couronne **+4 dB** (panoramique sans atténuation hors cadre), gros vol +3/+4 dB, dix secondes +3 dB, chacun avec un **creux de musique de −3 dB, 250 ms** (`engine.dipMusic`, sans pompage) ; esquive **+4 dB**, creux de 200 ms si un humain est en cause ; `count` à −6 dB en gamme de do majeur montante ; `sun` en arpège pentatonique montant, à −8 dB (voir A1).
- **Dernières secondes jouées par la partition** : `Score` place chaque coup de bois sur le battement de cœur le plus proche de T − n (`RoundMusic` → `sfx.lastSecond`) ; l'événement de simulation ne les rejoue plus.
- **Vérifié** :
  - écart |bois − cœur| : **médiane 15 ms, max 35 ms** sur 25 coups (enregistrement) ; 16 à 24 ms (rendu hors ligne), contre 150 à 290 ms mesurés par la critique. Contrepartie : le bois est à ±0,26 s de la seconde affichée, et deux coups peuvent tomber à 0,6 s d'écart (T = 110 : « 4 » et « 3 »). C'est inévitable avec un cœur à 1,6-1,9 Hz ; les caler sur un temps sur deux ferait dériver le « 1 » de 0,5 s ;
  - émergence (même mesure que `tools/polish/feel/audio-listen.py`, 12 oiseaux) : couronne +1,3 → **+1,9 dB**, esquive +1,9 → **+2,4 / +3,0 dB**, gros vol −0,8 → +1,5 dB. **Critère ≥ +3 dB non atteint pour la couronne** : à +5 dB, elle devenait le premier bruitage en énergie (14 changements de meneur par manche), donc je suis resté à +4. La mesure compte aussi le fond des 1,5 s précédentes, où tombe presque toujours la touche qui a fait changer la couronne. Rendu hors ligne : couronne +2,7 dB. « Dix secondes » : le bol tombe sous la réplique de la Grande Ombre, donc sous le ducking (émergence négative) ; c'est l'attaque qui porte le signal.

### A8 · La voix n'est jamais coupée · FAIT (sans gain CPU mesurable)

- `narrator.ts` (lecteur) : une voix à qui il reste moins de 0,8 s n'est pas coupée ; la réplique suivante attend sa fin (vérifié en temps audio, au plus 2 s réelles). `hide` à la fin réelle de la voix. `sfx.ts` : pas de battements de montée pour un bot hors cadre ; `maxTotalVoices` 48 → **24 dans la Grande Ombre** ; les signaux `essential` (compte à rebours, phases, dix secondes, dernières secondes, nuit, couronne) et l'interface ne sont jamais refusés.
- **Vérifié** : répliques coupées **7 sur 43 → 0 sur 40** (`after2`) et 0 sur 11 (`after3`). Réserve : l'horloge audio de `after2` a tenu 0,93 × le temps réel, contre 0,3-0,66 pour AVANT : l'épreuve était moins dure.
- CPU (`audio-cpu --probe=round:99`, 12 oiseaux, simulation factice, A/B `--legacy` sur le même binaire, deux passes) : Grande Ombre **58 / 76 % contre 58 / 71 %**, puis **54 / 70 % contre 53 / 69 %** d'un cœur, nœuds reliés 415 contre 412. **Aucun gain mesurable** : la simulation factice ne dépasse pas 19 voix de bruitages (plafond non atteint), et la partition domine le coût (41-53 oscillateurs). La simulation réelle à 12 oiseaux n'a pas été sondée.

### A9 · Répliques de soleil aux manches 4 et 5, et graine variable · FAIT

- `lines.ts` : `reuse: true` sur `golden` et `sunset`. `narrator.ts` : `MatchInfo.seed` (tirage des variantes), repris par `importMemory` ; `runner.ts` (edit ciblé) : `startMatch({ …, seed: this.matchSeed })`.
- **Vérifié** : heure dorée et couchant dits aux manches 4 et 5 (golden1/sunset2, golden3/sunset1), qui étaient muettes 80 s AVANT. Tests : 5 manches avec chacune sa réplique d'heure dorée et de couchant (la moins récente revient) ; six graines de partie donnent des tirages différents, la même graine le même.

### A10 · Des indications sans jargon · FAIT

- `hints.ts` : « Il plonge sur toi : COUP D'AILE ! » / « Incoming strike: WINGBEAT! » ; « Vole nord-sud, en travers de ton ombre : elle balaie large. » / « Fly north–south, across your shadow: it sweeps wide. » ; « Piquer le porteur de la couronne rapporte double. » / « Strike the crown bearer: double steal. » (glossaire EN). Les répliques voisées ne changent pas. `src/director/hints.test.ts` (hors périmètre) : 2 lignes, le texte attendu de `hints.dodge`.
- **Vérifié** : `npx vitest run src/director` vert ; captures FR/EN `A10_hints_fr.jpg`, `A10_hints2_en.jpg` (bulle d'esquive, heure dorée), `A10_hints3_fr.jpg` / `_en.jpg`. **Reste** : la bannière TV de l'heure dorée (`host.phaseHint.golden`, host.ts, périmètre hostui) garde l'ancienne phrase ; demande dans `REQUESTS.md`.

### A11 · Accords faux · FAIT

- `amb_chimes_loop` (fa −24 c) **retiré** (build et fichier), remplacé par un **carillon généré** au salon : lames FM en sol majeur pentatonique, 1 à 3 toutes les 3-8 s, trois positions stéréo. Écran titre : `ui_pluck` et les notes de joueur montent d'un demi-ton (la → si♭, dominante de mi♭ mineur).
- **Vérifié** : raies tonales du stem ambiance au salon, AVANT : sol♯6 −46 c, fa7 −25 c, la♯6 +33 c, ré6 +30 c ; APRÈS : sol6 +1 c, mi6 +1 c (le carillon), et deux raies faibles (mi5 +49 c, la♯5 −17 c, ×5) présentes aussi en manche, donc les boucles de vent. Pluck du titre : chroma **la♯ 44 %, fa 37 %** (si♭ et sa quinte, dans mi♭ mineur).

### A12 · Doublons et silence de nuit · FAIT (sans toucher au rattrapage des compresseurs)

- `index.ts` : `setAudioPaused()` ne joue plus la harpe ; le runner la joue une fois. `runner.ts` (edit ciblé) : `continueResults(byPlayer)` ; clic de confirmation seulement sur un geste (téléphones tous prêts, action PC). Nuit : `engine.silenceWorld(1,4 s)` (le monde entier en 120 ms), ambiance à zéro pendant 1,3 s, puis retour du vent, gong à 1,5 s, grillons.
- **Vérifié** : `st_pause` 1 fois, `st_resume` 1 fois (`after3`) ; `ui_confirm` pendant les résultats enchaînés seuls : 5 → **0** ; nuit : master de +0,25 s au gong **−48 à −82 dBFS au pire, médiane silence numérique**, sur 6 nuits (AVANT : médiane −38,5 dBFS) ; rendu hors ligne : −240 dB pendant 1,2 s.
- **Non fait** : la compensation du rattrapage automatique des deux compresseurs (+8,9 dB). Baisser le master d'autant déplacerait tout le mixage de 9 dB : le jeu passerait de −17 à −26 LUFS, trop bas pour une télé. Le silence de nuit n'en a plus besoin, et les niveaux calibrés sont relatifs.

## Ce qui a été touché

- Périmètre : `src/host/audio/{engine,index,narrator,sfx,sounds,voices,ambience,manifest.gen}.ts`, `src/host/audio/music/{director,tracks,round,score,instruments}.ts`, `public/audio/sfx/` (+5 fichiers, −`amb_chimes_loop.ogg`), `tools/audio-build.py`, `src/director/{narrator,lines,narrator.test}.ts`, `src/shared/strings/hints.ts`.
- Hors périmètre, par edits ciblés : `src/host/runner/runner.ts` (2 constantes, `showRoundResults`, `continueResults(byPlayer)` + `nextRoundAt`, `showMatchPanel`, graine de `startMatch`, 2 appels `continueResults(true)`), `src/director/hints.test.ts` (texte attendu de `hints.dodge`), `docs/CREDITS-sources.md`, `docs/agent-notes/REQUESTS.md`.
- Notes mises à jour : `docs/agent-notes/audio.md` (§1, §2, nouveau §7) et `director.md` (API, règles).
- Tests : `npx vitest run src/director src/host/audio src/host/ui src/shared` vert (107) ; `tsc` propre sur ces fichiers.

## Pour la suite

- Écoute humaine : la cloche de couronne (+4 dB, 14 fois par manche à 12 oiseaux), le carillon généré du salon, le ducking des bruitages pendant la voix (−5 dB, à pousser à −8 si l'intelligibilité reste juste dans un vrai salon).
- `tools/polish/audio/rec.mjs` : se brancher sur `window.__ombresAudio` (voir Méthode).
- Runner : écouter `subtitleEvents` `hide` (demande dans `REQUESTS.md`).
