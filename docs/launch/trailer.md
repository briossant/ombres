# Bande-annonce — note de réalisation

Agent **bande-annonce**. Tout ce qu'on voit vient du jeu : la vraie page du jeu (`/`), tournée image par image en temps virtuel, une vraie manche jouée de bout en bout, les vrais écrans (titre, salon, cartes des règles, résultats, podium), la vraie manette sur des téléphones émulés. Tout ce qu'on entend vient aussi du jeu : sa partition générative rendue par son propre moteur audio pour la manche filmée, ses bruitages, son narrateur anglais, une de ses pistes (résultats). Les seuls éléments ajoutés sont les cartons, dessinés avec les polices, le papier, l'encre et les cases de BD du jeu.

## 1. Livrables

| Fichier | Contenu | Format | Taille |
|---|---|---|---|
| `marketing/trailer-1080p.mp4` | **version A** : carton final sans mention d'IA | 1920 × 1080, 60 i/s, H.264 High 4.2, yuv420p (BT.709, plage limitée), AAC LC 192 kb/s 48 kHz stéréo, +faststart, 1 min 10,9 s | 86,6 Mo (10 Mb/s) |
| `marketing/trailer-1080p-ai-credit.mp4` | **version B** : carton final avec « Designed, coded and directed by Claude Opus 5.5 (Anthropic) · supervised by Brieuc Crosson » | idem | 86,6 Mo |
| `public/media/trailer-720.mp4` | version A pour la page mobile | 1280 × 720, 30 i/s, H.264 High, AAC 112 kb/s, deux passes, +faststart | 9,4 Mo (sous les 10 Mo des envois Discord sans abonnement) |
| `public/media/trailer-poster.jpg` | affiche : le carton final (logo, promesse, adresse) sur le crépuscule | 1280 × 720 JPEG | 140 Ko |
| `marketing/trailer-vertical.mp4` | version verticale de 25 s (X, Reels, Shorts, TikTok) : page de BD, le jeu dans une case 4:3, la manette dans un téléphone, légendes, adresse | 1080 × 1920, 60 i/s, mêmes codecs | 14,2 Mo |

Tous compatibles X (H.264 High, AAC, ≤ 60 i/s, ≤ 2 min 20, ≤ 512 Mo, débit ≤ 25 Mb/s).

`marketing/*.mp4` et `marketing/work/` sont ignorés par git (lourds, reproductibles). `public/media/` est servi par le site : la page mobile `/m` lit `trailer-720.mp4` en boucle, muette (agent landing, `docs/launch/landing.md`) ; `index.html` porte un `TODO(bande-annonce)` pour les balises `og:video`, à compléter par son propriétaire.

## 2. Intention

- **Un seul après-midi, de midi à la nuit.** Le montage suit la course du soleil : midi calme, heure dorée, couchant, Grande Ombre, nuit, résultats. La musique fait la même chose, parce que c'est la partition du jeu, qui s'épaissit à chaque phase.
- **Une histoire vraie.** La manche filmée a été choisie parmi 300 (graine de partie 227) : Léa (Lagoon), le téléphone qu'on voit rejoindre, pique Sam au couchant et lui vole la couronne, ils se la disputent pendant la Grande Ombre, Léa la reprend 1,3 s avant la nuit et gagne 21,9 % contre 20,2 %. Ce qu'on voit au podium est le résultat réel.
- **Lisible sans le son** (X, Reddit et la page mobile démarrent muets) : chaque réplique du narrateur est sous-titrée en récitatif, comme dans le jeu, et les règles passent par des légendes en case.
- **Des images du jeu, pas une vitrine abstraite** : sept plans sur quinze montrent la partie réelle avec son HUD, cinq la cinématique du titre (vraie manche de bots, caméra du jeu, qui sert aussi de fond au carton final), trois des écrans du jeu (résultats, podium, salon). Les cartons se posent par-dessus ; seule la planche « comment jouer » est une page de papier, percée de deux cases où passent le salon et la manette.

## 3. Découpage plan par plan

| # | Début | Durée | Image | Texte à l'écran |
|---|---|---|---|---|
| 1 | 0:00.0 | 4.32 s | ouverture — oiseau au ras du désert (démo du titre) | « Noon. The sand is still nobody’s. » |
| 2 | 0:04.3 | 2.88 s | compte à rebours, « Take off! » (manche, HUD) | — |
| 3 | 0:07.2 | 4.33 s | l’ombre peint : plongée (démo) puis la manche | « Your shadow » « paints the desert. » |
| 4 | 0:11.5 | 4.32 s | la manette : Léa joue, son oiseau vole (manche, HUD) | « Your phone » « is the controller. » |
| 5 | 0:15.8 | 4.55 s | le soleil baisse, les ombres s’allongent (accéléré × 8) | « The sun leans. Your shadows grow. » |
| 6 | 0:20.4 | 2.67 s | heure dorée, plongée sur un oiseau (démo) | — |
| 7 | 0:23.1 | 9.40 s | le piqué de Léa sur Sam, ralenti × 4 (manche, HUD) | « Dive on a rival. » « Steal their trail. » |
| 8 | 0:32.5 | 2.12 s | contre-jour du couchant (démo) | — |
| 9 | 0:34.6 | 4.67 s | la Grande Ombre (manche, HUD) | « Night spills off the cliff. Everything stops. » |
| 10 | 0:39.3 | 1.67 s | la nuit avance sur un oiseau (démo) | — |
| 11 | 0:40.9 | 6.65 s | compte à rebours, la nuit fige tout (manche, HUD) | — |
| 12 | 0:47.6 | 6.17 s | nuit, montée à la verticale, la carte | « Night falls. Lagoon keeps the desert. » |
| 13 | 0:53.7 | 4.00 s | podium et titres | — |
| 14 | 0:57.7 | 7.00 s | planche « comment jouer » : salon (QR) + manette | « Grab your phones » · « Scan the QR code » · « Join in seconds » · « Your phone is the controller » · « 1–12 players » · « No app, no install » · « Free in your browser » |
| 15 | 1:04.7 | 6.13 s | carton final (A) | logo OMBRES · « A party game for 1–12 players · your phone is the controller » · « Play free in your browser » · ombres.deploy.breizhware.com |

Durée totale : 70.87 s. Sections musicales (s) : midi 0 · heure dorée 11.53 · couchant 23.06 · Grande Ombre 34.59 · nuit 47.57.

**Sons** (repères de la version A) : 0,25 s cri de buse lointain ; 4,3-7,2 s bâtons du compte à rebours, conque et cloche d'« Envol » (bruitages de la manche, synchrones) ; 7,2 s bâton de pluie (peinture) ; 11,5 s bruitages et vent de la manche (synchrones) ; 15,8 s souffle (accéléré) ; 24,9-31 s bruitages du piqué ralentis × 4 (clac, boum de plumes, touche), choc, sub, plumes et cloche de couronne à la touche (27,7 s) ; 34,6 s « boum » et trémor de la Grande Ombre, cœur, bois des 5 dernières secondes, coupure de la nuit (47,6 s), silence, gong (~49 s), grillons (bruitages et ambiance de la manche, synchrones) ; 55,2 s gong de victoire (couleur de Léa) ; 57,7 s page qu'on tourne ; 60-62 s notes des quatre joueurs (tongue drum) ; 64,9 s harpe et cloche du lancement.

## 4. Bande-son

- **Musique.** La partition générative du jeu (WebAudio natif, `src/host/audio/music/`), rendue hors ligne par le moteur audio du jeu (`tools/trailer/audio-entry.ts`) en rejouant exactement la manche filmée (même simulation, mêmes bots, mêmes graines), **sans les ralentis de touche** pour garder un tempo régulier (83,3 BPM, mesure de 2,88 s ; la Grande Ombre tombe sur la 34ᵉ mesure). Coupée sur les mesures : midi (mesures 0-3), heure dorée (20-23, entrée des percussions et de l'oud), couchant (30-33, séquenceur de cordes), puis d'un seul tenant la Grande Ombre (cœur qui accélère, braam), la coupure de la nuit, le silence et le gong. Pendant le ralenti du piqué, la musique passe dans un passe-bas (700 Hz, −3 dB), comme le jeu étouffe le monde pendant ses ralentis. Après la nuit : « Calm Ambient 1 (Synthwave 4k) » de cynicmusic (piste des résultats du jeu, CC0), depuis sa section de 43,95 s, fondu d'entrée de 3 s, jusqu'au carton final.
- **Voix.** Quatre répliques du narrateur anglais du jeu (`public/audio/narrator/en/`) : `matchOpen` « Noon. The sand is still nobody's. », `golden2` « The sun leans. Your shadows grow. », `greatShadow1` « Night spills off the cliff. Everything stops. », `roundWin1.1` « Night falls. Lagoon keeps the desert. » Ducking comme le jeu (musique −6 dB, bruitages −5 dB ; −8,5 / −7,5 dB sur la Grande Ombre, le passage le plus dense). Mesuré (fenêtres de 2,4 s) : la voix passe 11 à 13 LU au-dessus du reste, 8,8 LU dans la Grande Ombre. Le ducking est appliqué clip par clip : posé après `amix`, il n'était lu qu'une fois par trame et amix sort des trames de plusieurs secondes (défaut trouvé à la mesure, corrigé).
- **Bruitages et ambiance.** Les pistes « bruitages » et « ambiance » du même rendu, synchrones avec l'image partout où l'image est la manche à vitesse normale (compte à rebours et « Take off! », peinture, manette, Grande Ombre, nuit, gong, grillons). Le piqué : bruitages de la manche ralentis × 4 (une octave plus bas), plus un choc, un sub, des plumes et la cloche de la couronne ralentis. Ponctuations du jeu rendues par son moteur (`renderCues`) : gong de victoire au podium, notes des joueurs (tongue drum) quand les arguments apparaissent, harpe et cloche du lancement sur le carton final ; une page qui tourne à l'arrivée de la planche. Vent et cri de buse sur l'ouverture.
- **Mixage.** Tout est mixé en 32 bits flottants, puis gain vers −14 LUFS et limiteur (crête vraie ≤ −1 dBTP). Mesuré sur `marketing/trailer-1080p.mp4` (EBU R128) : **−14,2 LUFS intégrés, crête vraie −1,8 dBTP, LRA 4,9 LU**. Par plan : de −16,6 (plongée dorée) à −11,9 LUFS (compte à rebours de la nuit), la Grande Ombre culmine, puis la nuit tombe à −60 (1,4 s de silence) et le gong. Six transitoires signalés par le détecteur de clics, tous voulus (conque d'« Envol », clac, bois des dernières secondes, page, ouverture, harpe). Spectrogramme et courbe : `marketing/work/edit/master-report.png`.

## 5. Comment c'est tourné

- **Temps virtuel** (`tools/trailer/lib/vclock.mjs`, injecté avant le chargement de la page) : `performance.now`, `Date`, `requestAnimationFrame`, `setTimeout`/`setInterval` et les animations CSS (Web Animations mises en pause et pilotées par `currentTime`) n'avancent que quand le script le décide. Chaque image est un pas fixe de 1/60 s (ou 1/240 s pour le ralenti × 4), rendue puis capturée (JPEG qualité 92, CDP) quel que soit le temps réel qu'elle a pris : aucune saccade, aucune image perdue. Les images partent directement dans ffmpeg (mezzanine H.264 4:4:4 CRF 10), sans fichier intermédiaire.
- **Qualité graphique Ultra** (preset du correcteur antialiasing : rendu 2160p réduit en 1080p, SSAA 4×, SMAA HIGH). Le piqué (soleil 79,4 → 85,0 s) est tourné en 3840 × 2160 (clip `round-4k.mp4`) : le monteur y recadre jusqu'à × 1,75 sans perte.
- **La manche est déterministe** : `session.mjs --seed=227` impose la graine de partie (Math.random rend une constante pendant `startMatch`), les quatre joueurs « téléphone » sont pilotés pendant la partie par des bots à graine (`cast.json` : Faucon et Pie de niveau 3, Nomade, Faucon), sans remplaçant ni grâce de latence. `seeds-chrome.mjs` rejoue la même manche dans Chrome pour noter des centaines de graines (vainqueur humain, piqué entre humains au couchant, couronnes, écart final) ; `round.ts` reproduit le dosage du temps du runner pour caler le son. Attention : Node (V8 12) et Chrome n'arrondissent pas toutes les fonctions `Math` pareil, une manche rejouée dans Node diverge au bout d'une minute ; la graine se choisit dans Chrome.
- **Les téléphones** : quatre pages `/play` émulées (iPhone 15 Pro, Pixel 7) rejoignent la salle `DUNE` pendant qu'on filme le salon ; le QR code et l'adresse affichés sont ceux du site public (`PUBLIC_URL=https://ombres.deploy.breizhware.com`). La manette de Léa est filmée à part pendant la manche : son joystick et PLONGER suivent l'entrée de son oiseau, image par image. L'arrivée d'un joueur (nom tapé lettre à lettre, couleur, décollage, joystick, PLONGER) est une prise séparée.
- **Caméra du monteur** : pendant le piqué, un recadrage suit le milieu de Léa et Sam (positions écran journalisées par le HUD, lissées), zoom qui monte jusqu'à la touche puis redescend quand la caméra du jeu fait son propre punch-in.

## 6. Reproduire

```bash
PORT=8902 PUBLIC_URL=https://ombres.deploy.breizhware.com npx tsx server/index.ts &   # serveur de dev (arrêter par son PID)
nix shell nixpkgs#ffmpeg-full   # ou FFMPEG=/chemin/vers/ffmpeg
node tools/trailer/seeds-chrome.mjs --n=300                  # (facultatif) choisir la manche ; --seed=227 pour le journal
node tools/trailer/session.mjs --seed=227 --quality=ultra --titleSeconds=92 --slow=81.3:84.8 --hires=79.4:85.0 --ph=14:26,79:86
node tools/trailer/session.mjs --takes=phonejoin --quality=ultra
node tools/trailer/audio-render.mjs --seed=227 --noslow      # musique, bruitages, ambiance de la manche (48 kHz)
node tools/trailer/cards.mjs                                 # cartons (dev/trailer.html, src/dev/trailer/)
node tools/trailer/cards.mjs --only=vertical
node tools/trailer/shots.mjs                                 # coupes de la démo du titre → choisir tools/trailer/title-shots.json
node tools/trailer/edit.mjs                                  # plans, bande-son, livrables A et B, 720p, affiche
node tools/trailer/edit.mjs --only=vertical                  # version verticale
node tools/trailer/check.mjs                                 # formats, sonie, planches, lecture dans Chrome
```

Le découpage est dans `tools/trailer/edl.mjs` (plans et sons, calés sur les journaux des prises), les textes des cartons dans `src/dev/trailer/cards.ts`. Un plan n'est recalculé que si sa description ou une de ses sources change. La démo du titre n'est pas image pour image identique d'un tournage à l'autre (elle tourne avant que la capture commence) : après chaque tournage, relancer `shots.mjs` et ajuster `title-shots.json` (le montage signale tout morceau qui déborde d'un plan).

**Rushes gardés** : `marketing/work/clips/` (1,7 Go : manche 1080p et fenêtre 4K du piqué, démo du titre, salon, résultats, manettes, journaux) et `marketing/work/audio/` (pistes de la manche, 72 Mo) permettent de remonter sans retourner (33 min de tournage). Tout le reste (plans, cartons, mixages) a été supprimé et se refait en une dizaine de minutes. Pour libérer la place : `rm -r marketing/work`.

## 7. Sources et licences

| Élément | Source | Licence |
|---|---|---|
| Images | le jeu (code, rendu, UI, logo : projet) | projet |
| Partition générative | code du jeu ; échantillons tongue drum (tosha73), oud (hammondman), duduk (blood_of_a_pomegranate), tanpura (iluppai), Freesound | CC0 |
| « Calm Ambient 1 (Synthwave 4k) » | cynicmusic (The Cynic Project), OpenGameArt | CC0 |
| Bruitages | Freesound (auteurs listés dans `docs/CREDITS-sources.md`) et Kenney | CC0 |
| Voix du narrateur (anglais) | synthèse Kyutai Pocket TTS, voix d'origine `bill_boerst` (Bill Boerst, LibriVox) | poids CC BY 4.0 ; voix CC0 |
| Polices des cartons | Julius Sans One, Patrick Hand SC, Averia Sans Libre | SIL OFL 1.1 |

La musique du titre (Zhelanov, CC BY) et celle des crédits (Tri-Tachyon, CC BY) ne sont **pas** utilisées : la seule attribution obligatoire est celle de Pocket TTS.

## 8. Crédits à mettre dans les posts

Texte prêt à coller (anglais) :

> Music: Ombres' own generative score, rendered from the round shown, and "Calm Ambient 1 (Synthwave 4k)" by cynicmusic (CC0). English narrator voice synthesized with Kyutai's Pocket TTS (CC BY 4.0), original voice by Bill Boerst (LibriVox, CC0). Sound effects from Freesound and Kenney (CC0).

Variante B (carton final avec le crédit IA) : ajouter si besoin « Designed, coded and directed by Claude Opus 5.5 (Anthropic), supervised by Brieuc Crosson. »

## 9. Vérifications

`tools/trailer/check.mjs` (rapport : `marketing/work/check/report.json`) :

| Fichier | Durée | Vidéo | Sonie | Lecture dans Chrome |
|---|---|---|---|---|
| trailer-1080p.mp4 | 70,87 s | h264 High yuv420p 1920×1080 60 i/s, 10,0 Mb/s | −14,2 LUFS, −1,8 dBTP | lue, 4 seeks (7, 32, 50, 67 s), images non vides, 0 image perdue |
| trailer-1080p-ai-credit.mp4 | 70,87 s | idem | idem | idem |
| trailer-720.mp4 | 70,87 s | h264 High yuv420p 1280×720 30 i/s, 0,99 Mb/s | −14,2 LUFS, −1,4 dBTP | idem |
| trailer-vertical.mp4 | 25,40 s | h264 High yuv420p 1080×1920 60 i/s, 4,5 Mb/s | −14,2 LUFS, −1,8 dBTP | idem |

Faststart vérifié (atome `moov` avant `mdat`) sur les quatre. Planches d'une image par seconde, regardées : `marketing/work/check/*-sheet.jpg`. Images regardées en pleine définition : la touche du piqué (recadrée dans la prise 4K), la manette incrustée, la planche « comment jouer », le carton final A et B, l'affiche. Voix contre le reste (fenêtres de 2,4 s, avant mastering) : +13,3 / +11,3 / +8,8 / +13,1 LU.

## 10. Limites

- Personne n'a écouté le mixage : il est vérifié par la mesure (sonie par plan, voix contre le reste, crêtes, spectrogramme `marketing/work/edit/master-report.png`).
- La démo du titre se re-choisit à chaque tournage (voir §6).
- Dans ce Chrome sans écran lancé avec le GPU forcé, le décodeur vidéo matériel échoue au hasard sur tout H.264 (même une mire ffmpeg) : la lecture est vérifiée avec le décodeur logiciel.
