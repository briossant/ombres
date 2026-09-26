# Ombres — journal des décisions

Chaque décision : ce qui a été tranché, et pourquoi, en une ou deux lignes. Les décisions de détail vivent dans les documents de référence (`docs/GDD.md` §20, `docs/ART_BIBLE.md` §9, `docs/research/*.md` « Décisions proposées ») ; ce journal garde celles qui structurent le jeu, plus les arbitrages entre ces documents.

## Méthode

- **D1 — Recherche avant code.** Cinq recherches parallèles (style Moebius sur 23 images de référence, NPR temps réel avec prototype mesuré, assets et licences, TTS local, stack et déploiement testés en réel), puis trois game designers indépendants (angles party / profondeur / spectacle) départagés par un directeur de game design, et une bible artistique qui fusionne style et technique. *Pourquoi* : le brief demande de ne pas improviser le rendu, et le game design est ce qui rend le jeu fun.
- **D2 — Un GDD et une bible font foi.** `docs/GDD.md` (règles, chiffres) et `docs/ART_BIBLE.md` (image) l'emportent sur les recherches en cas de conflit. Toutes les constantes vivent dans `src/sim/rules.ts`.

## Game design (détail : GDD §20)

- **D3 — Cinq règles, toutes visibles** : l'ombre peint ; PLONGER maintenu = bas (ombre petite et forte), relâché = haut (grande et pâle), le pâle ne recouvre pas le fort ; piquer d'en haut vole la traînée de la victime ; l'ombre des tours fige le sable et cache ; le soleil se couche et la nuit fige tout d'ouest en est. *Pourquoi* : lisible en 5 s, et chaque règle a un signe à l'écran.
- **D4 — Deux boutons** (PLONGER maintenu, COUP D'AILE) + joystick à cap absolu. Ne rien faire reste jouable (on vole haut et on peint grand).
- **D5 — Peinture binaire fort/pâle, instantanée.** Deux valeurs se comparent d'un coup d'œil ; pas de minuterie invisible.
- **D6 — Ombre d'oiseau = ombre d'une sphère** (décalée de h·cot e, étirée de 1/sin e). Entorse physique assumée : un disque plat ne s'allongerait pas. Rendu et gameplay utilisent la même ellipse.
- **D7 — Fin de manche à 9° d'élévation avec « Grande Ombre » de 12 s** (ombre de la Falaise qui fige le désert d'ouest en est). Climax long qui regroupe tout le monde, ombres encore cadrables.
- **D8 — Arène elliptique à l'écran, 6 tailles selon le nombre d'oiseaux, bord « Simoun »** ; couronne du meneur (le piquer vole double) : ce qui garde les joueurs proches est visible.
- **D9 — Piqué avec préavis** (verrouillage visible, prise d'élan 0,2 s, « clac » 0,65 s avant l'impact) et esquive au COUP D'AILE ; raté = l'attaquant décroche. Validé par micro-simulation : un réflexe de 0,25 s esquive 87 % des piqués.
- **D10 — 3 manches, la dernière compte double, points = oiseaux devancés + 1 au vainqueur.** Partie de ~7 min, reste ouverte jusqu'au bout.

## Direction artistique (détail : ART_BIBLE §9)

- **D11 — High-key Moebius** : désert clair et vide, encre brun-aubergine (jamais de noir), deux tons par objet, aplats, hachures rares en espace objet (jamais en espace écran), pas de bloom ni d'effet photoréaliste.
- **D12 — Le territoire est un lavis d'aquarelle** (pas d'encre, pas de hachures) ; le fort se distingue du pâle par la valeur, le chroma, un liseré de pigment et une granulation. Au coucher, il « s'allume » sur le sol gris-lavande.
- **D13 — L'arène est une toile plate** ; dunes, mesas et Falaise hors arène (les pentes corail se confondaient avec du territoire).
- **D14 — 12 couleurs de joueurs validées au ΔE OKLab**, 6 premières distinctes pour les trois daltonismes ; mode daltonien = motif par joueur + glyphe partout. « Ardoise » remplacée par « Sarcelle » (un gris se confondait avec les ombres).
- **D15 — Oiseau blanc os pour tous** ; la couleur du joueur va sur les bandes d'ailes, la cape, la selle, le fanion et la traînée.
- **D16 — Oiseaux, cavaliers et tours procéduraux.** Aucun modèle libre ne ressemble à l'oiseau-ptérosaure d'Arzach ; des tours « lathe » sont plus fidèles au style et donnent des ombres exactes. Ce ne sont pas des primitives : maillages lissés, profils dessinés, os d'ailes.

## Technique

- **D17 — Pipeline de rendu** : height shadow map en espace sol (résolution constante même pour des ombres de 270 m), une passe géométrique MRT (couleur + normales/ID), tout le dessin dans les matériaux, une seule passe d'encre en post (contours 1/z + normales + ID, tremblé ancré dans le monde, papier), puis SMAA. 6,7 ms GPU mesurés en 1080p sur Vega 6.
- **D18 — Stack figée** : three 0.186.1, postprocessing 6.39.5 (plafond three < 0.187), R3F 9.8 (React < 19.4), WebGL2 (pas de WebGPU : postprocessing ne le gère pas).
- **D19 — Un seul serveur Node** (relais WS + statique) ; Vite en middleware en dev → un seul port pour PC et téléphones. En prod, bundle esbuild unique, sans node_modules.
- **D20 — Rafraîchir le PC ne casse pas la partie** : le serveur garde la salle 10 min (jeton d'hôte) ; le PC sauvegarde la partie en `sessionStorage` et la reprend.
- **D21 — Keepalive WebSocket toutes les 25 s** : le proxy Magic Deploy coupe les connexions inactives à ~300 s ; un redeploy coupe ~30 s → reconnexion automatique partout.
- **D22 — Narrateur : Kyutai Pocket TTS** (poids CC-BY 4.0, local, CPU), voix `bill_boerst` en FR et EN (même personnage), 4 prises par réplique départagées par UTMOS et vérifiées par transcription Whisper. Répliques générées phrase entière pour chaque couleur (pas de collage) ; jamais un nom de couleur en dernier mot (le modèle FR l'avale parfois).
- **D23 — Musique** : générative pendant la manche, pilotée par la course du soleil (couches ajoutées à chaque phase), écrite en **WebAudio natif** et non en Tone.js (mesuré : 8,6× moins coûteux, et timing à l'échantillon près, compatible avec le rendu hors ligne utilisé pour la vérifier) ; pistes CC0/CC-BY pour titre, lobby, résultats, crédits.

## Arbitrages après la phase d'implémentation des modules

- **D24 — Rayon de touche du piqué 4,0 → 5,5 m.** Dans le jeu, le coup d'aile part dans la direction du joystick fixée à l'appui (la micro-simulation du GDD le réorientait en continu) : l'esquive devenait trop facile (réaction 0,30 s → 2 % de touches). 5,5 m restitue la courbe du GDD (0,20 / 0,30 / 0,40 s → 3 / 45 / 97 %).
- **D25 — Cibles de niveau des bots ramenées à 75 % / 5 %** (Seigneur contre 3 Oisillons / Oisillon contre 3 Seigneurs). Les cibles du GDD (80 % / 10 %) sont mathématiquement quasi incompatibles ; mesuré 67-77 % / 6 %.
- **D26 — Bande de sable du HUD à 38 px** (et non 18) : le pourcentage doit se lire à 3 m d'une TV.
- **D27 — Glyphes des joueurs dans `src/shared/glyphs.ts`**, partagés par la TV et le téléphone : mêmes formes partout.
- **D28 — Audio du PC en OGG** : le PC doit tourner sur Chrome, Edge ou Firefox (les téléphones ne jouent pas de son). Économise ~11 Mo de doublons MP3.
- **D29 — Répliques du narrateur réécrites pour la voix** : celles du GDD duraient 3,5 à 5 s à l'oral ; une trentaine de tournures mal prononcées par le TTS ont été remplacées ; variantes ajoutées pour ne jamais rejouer une réplique dans une partie. 722 clips validés par transcription.
