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
- **D22 — Narrateur pré-généré par TTS local, phrase entière pour chaque couleur** (pas de collage), 4 prises par réplique départagées par des scores de qualité et vérifiées par transcription Whisper ; jamais un nom de couleur en dernier mot. D'abord Kyutai Pocket TTS (CPU) pour les deux langues ; le français est ensuite passé à Qwen3-TTS (voir D36).
- **D23 — Musique** : générative pendant la manche, pilotée par la course du soleil (couches ajoutées à chaque phase), écrite en **WebAudio natif** et non en Tone.js (mesuré : 8,6× moins coûteux, et timing à l'échantillon près, compatible avec le rendu hors ligne utilisé pour la vérifier) ; pistes CC0/CC-BY pour titre, lobby, résultats, crédits.

## Arbitrages après la phase d'implémentation des modules

- **D24 — Rayon de touche du piqué 4,0 → 5,5 m.** Dans le jeu, le coup d'aile part dans la direction du joystick fixée à l'appui (la micro-simulation du GDD le réorientait en continu) : l'esquive devenait trop facile (réaction 0,30 s → 2 % de touches). 5,5 m restitue la courbe du GDD (0,20 / 0,30 / 0,40 s → 3 / 45 / 97 %).
- **D25 — Cibles de niveau des bots ramenées à 75 % / 5 %** (Seigneur contre 3 Oisillons / Oisillon contre 3 Seigneurs). Les cibles du GDD (80 % / 10 %) sont mathématiquement quasi incompatibles ; mesuré 67-77 % / 6 %.
- **D26 — Bande de sable du HUD à 38 px** (et non 18) : le pourcentage doit se lire à 3 m d'une TV.
- **D27 — Glyphes des joueurs dans `src/shared/glyphs.ts`**, partagés par la TV et le téléphone : mêmes formes partout.
- **D28 — Audio du PC en OGG** : le PC doit tourner sur Chrome, Edge ou Firefox (les téléphones ne jouent pas de son). Économise ~11 Mo de doublons MP3.
- **D29 — Répliques du narrateur réécrites pour la voix** : celles du GDD duraient 3,5 à 5 s à l'oral ; une trentaine de tournures mal prononcées par le TTS ont été remplacées ; variantes ajoutées pour ne jamais rejouer une réplique dans une partie. 722 clips validés par transcription.

## Arbitrages des phases d'intégration, de polish et de déploiement

- **D30 — Déploiement par téléversement dans un volume.** Le proxy de Magic Deploy refuse toute requête de plus de ~1 Mio ; le jeu pèse ~25 Mo. La VM ne reçoit que sa configuration et le serveur (143 Kio) ; le site est téléversé dans un volume persistant par un point d'accès authentifié (secret `UPLOAD_TOKEN`, jamais versionné, jamais dans le store Nix), par morceaux vérifiés au SHA-256 et avec bascule atomique. Seuls les fichiers modifiés repartent à chaque mise à jour.
- **D31 — Serveur statique avec ETag/304 et requêtes partielles** : rafraîchir le PC ne retélécharge rien qui n'ait changé ; la musique se lit en continu.
- **D32 — Trois vagues de polish pilotées par des critiques indépendants** (direction artistique, game feel, premier contact, technique, audio), triées en ordres de travail par périmètre de fichiers, corrigées en parallèle puis vérifiées à l'image et par non-régression.
- **D33 — Cinématique du titre validée sur l'avenir exact de la démo** : une simulation jumelle, déterministe, joue la démo jusqu'à 8 s en avance ; chaque plan est jugé sur toute sa durée avant la coupe (0 image ratée sur 12 500 mesurées).
- **D34 — Grande Ombre cadrée serré** (humains, front de nuit, meneur couronné si possible), tours qui s'effacent franchement quand elles masquent un oiseau ou la caméra ; à 12 oiseaux, l'arène entière reste à l'écran.
- **D35 — Couleurs du couchant à 12 joueurs gardées denses** : les calmer imposait d'assouplir le seuil de distinction entre territoires gelés (ΔE 0,059). La lisibilité passe avant le calme ; de 2 à 6 joueurs, cœur du brief, la toile reste aérée. Ombres portées sur la peinture refroidies vers le violet (plus de rouille).
- **D36 — Narrateur français régénéré avec Qwen3-TTS 1.7B (Apache-2.0) sur GPU Kaggle.** Banc de 20 systèmes (Kyutai 1.6B, Qwen3, CosyVoice3, VoxCPM2, Chatterbox…) mesurés par Whisper large-v3, UTMOS22/UTMOSv2/DNSMOS et similarité de locuteur : en français, Qwen3 avec une voix de synthèse conçue par description (aucune personne réelle clonée), accélérée de 20 %, est la plus intelligible (erreur 0,007 contre 0,032) et la mieux notée. L'anglais reste sur Pocket TTS, déjà intelligible à 100 %. Pas de Gemini : aucune clé disponible.
- **D37 — Qualité automatique** : un banc de 2 s sur l'écran titre choisit le preset (Medium sur la machine de dev, iGPU Vega) ; High tient 60 i/s à 12 oiseaux avec ~9,2-9,5 ms GPU au 90e centile ; rétrogradation seulement entre deux manches.
- **D38 — Crédits** : « Conçu et réalisé par Claude (Anthropic), sous la supervision de Brieuc Crosson ».

## Publication

- **D39 — Licence non commerciale : PolyForm Noncommercial 1.0.0** (titulaire : Brieuc Crosson), dépôt public en source disponible ; les assets tiers gardent leur licence (musiques CC-BY 4.0 / CC0, sons CC0, polices OFL 1.1, voix Pocket TTS CC-BY 4.0 et Qwen3-TTS Apache-2.0 : `docs/CREDITS-sources.md`). *Pourquoi* : le jeu reste libre d'accès, d'étude et de partage, mais personne ne peut le vendre ou l'exploiter commercialement sans accord ; licence rédigée par des juristes pour du logiciel, qui laisse au titulaire la possibilité d'accorder des licences commerciales.
