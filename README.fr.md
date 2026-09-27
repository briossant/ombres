# Ombres

*English version: [README.md](README.md)*

> **Ton ombre peint le désert. À la nuit, le plus grand territoire gagne.**

*Ombres* est un party game en multijoueur local, de 1 à 12 joueurs (idéal de 2 à 6). Le jeu tourne sur un PC branché à un écran ; chaque joueur scanne un QR code et pilote avec son téléphone un oiseau géant au-dessus d'un désert parsemé de tours. L'ombre de ton oiseau peint le sable à ta couleur. Pendant la manche, le soleil se couche : les ombres s'allongent, balaient des zones immenses, puis la nuit descend de la falaise et fige tout. Direction artistique inspirée de la ligne claire de Moebius (contours à l'encre, aplats, lavis, désert pastel).

**Jouer maintenant : https://ombres.deploy.breizhware.com**
(ouvrir sur le PC, de préférence Chrome, Edge ou Firefox ; les téléphones scannent le QR code affiché dans le salon. Un seul téléphone suffit : des bots complètent la partie.)

Le jeu a été conçu et réalisé par Claude Opus 5.5 (Anthropic) à partir d'un brief unique, sous la supervision de Brieuc Crosson. Aucune ligne de code n'a été écrite par un humain : la méthode et la liste complète des interventions humaines sont dans [Comment le jeu a été fait](#comment-le-jeu-a-été-fait).

| | |
|---|---|
| ![Écran titre : un oiseau et son cavalier au-dessus du désert](docs/screenshots/1-titre.jpg)<br>*Écran titre* | ![Salon : QR code, code de salle, joueurs, bots et réglages](docs/screenshots/2-salon.jpg)<br>*Salon : on scanne, on choisit sa couleur, on s'entraîne sur le sable* |
| ![Heure dorée : les ombres des tours rayent la mosaïque](docs/screenshots/3-heure-doree.jpg)<br>*Heure dorée : les ombres des tours rayent la mosaïque* | ![La Grande Ombre : la nuit fige le désert d'ouest en est](docs/screenshots/4-grande-ombre.jpg)<br>*La Grande Ombre : la nuit fige le désert d'ouest en est* |
| ![Résultats de manche en vue carte](docs/screenshots/5-resultats.jpg)<br>*Résultats de manche, vue carte* | ![Podium et titres de fin de partie](docs/screenshots/6-podium.jpg)<br>*Podium et titres* |

![La manette sur le téléphone : joystick, COUP D'AILE et PLONGER](docs/screenshots/7-manette.jpg)
*La manette sur le téléphone*

---

## Comment on joue

- **Sur le PC** : ouvre le jeu, appuie sur une touche. Le salon affiche un QR code et un code de salle à 4 lettres.
- **Sur chaque téléphone** : scanne le QR code (ou ouvre l'adresse affichée et tape le code), choisis ton nom et ta couleur. Ton oiseau vole aussitôt dans le désert du salon : trois micro-objectifs (Vole, Plonge, Pique) t'apprennent les commandes.
- **Seul** : un seul téléphone suffit, des bots complètent la partie. **Au clavier** : Espace dans le salon pour rejoindre sans téléphone (un second joueur peut rejoindre avec AltGr).
- Le premier joueur lance la partie depuis son téléphone (ou Entrée sur le PC). Une partie = 3 manches d'environ 2 minutes, la dernière compte double, puis podium, titres et revanche.

### Les cinq règles (toutes visibles à l'écran)

1. **Ton ombre peint le sable à ta couleur.** À la nuit, celui qui possède le plus de sable gagne la manche.
2. **Maintiens PLONGER pour raser le sable : petite ombre forte. Relâche pour remonter : grande ombre pâle.** Une ombre pâle ne recouvre pas du sable fort.
3. **PLONGER au-dessus d'un oiseau plus bas, c'est le piquer.** Touché, il décroche et sa traînée passe à ta couleur. Raté, c'est toi qui décroches. Au « clac », la cible peut esquiver d'un COUP D'AILE.
4. **L'ombre des tours fige le sable.** Un oiseau dont l'ombre y disparaît est caché.
5. **Le soleil se couche.** Les ombres s'allongent, puis, pendant les 12 dernières secondes (la Grande Ombre), la nuit descend de la falaise et fige tout, d'ouest en est.

### Commandes

| | Téléphone | Clavier J1 | Clavier J2 | Manette |
|---|---|---|---|---|
| Diriger | joystick (moitié gauche) ; ou inclinaison, ou mode relatif | WASD / ZQSD / flèches | IJKL | stick gauche |
| PLONGER (maintenir) | grand bouton | Espace | AltGr | A / gâchette droite |
| COUP D'AILE | petit bouton | Maj gauche | M (AZERTY) | B / RB |
| Pause | appui long sur ⏸ | Échap | | Start |

`F` : plein écran. Réglages (PC) : volumes séparés, qualité graphique, plein écran, FR/EN, mode daltonien (motifs et glyphes par joueur), narrateur (voix / texte / muet), conseils, réduction des flashs, tremblement de caméra. Sur le téléphone : type de contrôle (absolu, relatif, inclinaison), aide au vol, vibrations.

---

## Ce que contient le jeu

- Chargement avec progression réelle, écran titre animé (cinématique sur une vraie manche jouée par des bots).
- Salon : QR code, code de salle, slots de joueurs (nom, couleur, glyphe), ajout et retrait de bots (7 personnalités, du Faucon à l'Horloger, et 3 niveaux, d'Oisillon à Seigneur des sables), réglages de partie, désert jouable avec micro-objectifs, cartes des règles animées.
- Quatre cartes (les Parasols, les Aiguilles, les Géantes, le Cadran), et une arène dont la taille suit le nombre d'oiseaux.
- Manette téléphone complète : connexion, profil, salon, manette, entre-manches, fin de partie et revanche, reconnexion automatique, écran toujours allumé, vibrations.
- Un joueur qui se déconnecte est remplacé par un bot (même couleur, même territoire) qui lui rend la main à son retour. Rafraîchir le PC ne casse pas la partie (même salle, même écran, même manche).
- HUD : cadran solaire (le temps se lit dans le soleil), bande de sable triée avec couronne, repères des joueurs hors écran, étiquettes, bannières de phase, sous-titres du narrateur, indications contextuelles.
- Game feel : ralentis de touche, tremblement, traînées, bouffées de sable, étoiles d'impact, plumes, flash « planche », caméra qui cadre oiseaux et ombres et dramatise le piqué et la Grande Ombre.
- Narrateur : 722 répliques pré-générées (361 par langue ; français : Qwen3-TTS sur GPU Kaggle ; anglais : Pocket TTS en local), qui désignent les joueurs par leur couleur, rares et hiérarchisées ; sous-titres toujours disponibles.
- Musique générative pilotée par la course du soleil, pistes par écran, ambiance de vent, bruitage de chaque action et de l'interface.
- Podium, titres de fin de partie (attribués par z-score), statistiques, revanche ; pause ; crédits.

---

## Comment le jeu a été fait

*Ombres* a été conçu et réalisé par Claude Opus 5.5 (Anthropic), sous la supervision de Brieuc Crosson. Tout part d'un brief unique, conservé mot pour mot dans [docs/BRIEF.md](docs/BRIEF.md) : un party game local, des oiseaux géants dont l'ombre peint un désert, un soleil qui se couche, un style inspiré de Moebius, et la consigne de ne pas s'arrêter avant un jeu complet, poli et déployé.

Le travail a représenté environ 35 heures d'agents autonomes, orchestrés en workflows multi-agents dans Claude Code. L'historique git va du premier commit, le 25 septembre 2026, au déploiement final, le 27 septembre.

1. Recherche ([docs/research/](docs/research/)). Cinq recherches en parallèle : le style de Moebius étudié sur 23 images de référence, les techniques de rendu non photoréaliste temps réel avec un prototype mesuré, les assets gratuits et leurs licences, la synthèse vocale locale, la stack et le déploiement testés en réel. Puis trois game designers indépendants (angles party, profondeur, spectacle), départagés par un directeur de game design.
2. Conception. [docs/GDD.md](docs/GDD.md) fixe les règles et tous les chiffres, validés par simulation ; [docs/ART_BIBLE.md](docs/ART_BIBLE.md) fixe l'image (palettes, 12 couleurs de joueurs, pipeline de rendu) ; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) fixe les modules, les contrats typés et qui possède quel dossier.
3. Modules en parallèle. Huit agents, un par domaine (simulation, bots, rendu du monde, oiseaux et effets, réseau et manette, audio, narrateur, interface du PC). Chacun n'écrit que dans ses dossiers et passe par [docs/agent-notes/](docs/agent-notes/) pour demander un changement ailleurs.
4. Intégration et premier déploiement : boucle de jeu, entrées, caméra, chargement, persistance, tests de bout en bout avec téléphones émulés.
5. Trois vagues de polish ([docs/polish/](docs/polish/)). Des critiques indépendants (direction artistique, game feel, premier contact, technique, audio) jouent au jeu et rendent un rapport ; leurs constats deviennent des ordres de travail répartis par périmètre de fichiers, corrigés en parallèle, puis vérifiés à l'image et par non-régression.
6. Déploiement final sur une machine virtuelle NixOS, via le serveur MCP de Magic Deploy.

Les décisions qui ont façonné le jeu sont consignées, avec leurs raisons, dans [DECISIONS.md](DECISIONS.md). Le rendu a été jugé sur des captures d'écran que les agents prenaient en Chrome headless puis regardaient, et l'équilibrage sur des milliers de manches jouées par les bots.

Aucune ligne de code n'a été écrite par un humain. Les interventions humaines, au complet :

- l'écriture du brief ;
- pendant le développement, un message : suggérer un meilleur modèle de synthèse vocale via l'API Gemini ou des GPU Kaggle (la voix française a été régénérée avec Qwen3-TTS sur Kaggle ; aucune clé Gemini n'était disponible), prévenir que l'espace disque était limité, et demander d'ajouter « sous la supervision de Brieuc Crosson » aux crédits ;
- une fois le jeu déployé : demander ce dépôt GitHub (branche `master`, sa convention), demander si l'absence d'anti-aliasing était voulue (ce qui a conduit à une correction), et ajouter à Magic Deploy les noms d'hôte personnalisés, pour donner au jeu une adresse propre ;
- demander cette publication (README anglais, licence).

Aucun modèle de génération d'images n'a servi. Tout ce qu'on voit à l'écran est du code : shaders, maillages procéduraux des oiseaux, des cavaliers et des tours, ciel et sol générés, glyphes de l'interface dessinés en code. Les seuls fichiers visuels venus de l'extérieur sont trois polices OFL. Bruitages et musiques sont des fichiers CC0 et CC-BY (Freesound, Kenney, OpenGameArt), crédités fichier par fichier, ou sont synthétisés par le code (une couche de vent, le « clac » du piqué) ; la musique des manches est composée en direct à partir d'échantillons d'instruments CC0. Seules les voix du narrateur sont synthétiques : elles viennent de modèles de synthèse vocale à poids ouverts, crédités plus bas, et leurs textes ont été écrits par Claude.

---

## Développement

Environnement : NixOS (flake fourni) ou Node 22 + pnpm 10.

```bash
nix develop          # Node 22, pnpm, ffmpeg, sox, imagemagick (même Node que la VM de prod)
pnpm install
pnpm dev             # http://localhost:8787 : serveur + Vite (HMR) sur un seul port
```

Le PC ouvre `http://localhost:8787`. Les téléphones du même réseau scannent le QR code (il pointe vers l'IP locale du PC). En HTTP local, l'inclinaison iOS et le Wake Lock ne sont pas disponibles (ils demandent HTTPS) : la version déployée les a.

| Commande | Rôle |
|---|---|
| `pnpm typecheck` | TypeScript strict (TS 7) |
| `pnpm test` | 380 tests unitaires (vitest) : simulation, bots, rendu, caméra, UI, entrées, réseau, téléphone, audio, narrateur |
| `pnpm check:boundaries` | la simulation et les bots n'importent ni React, ni three.js, ni le DOM ; la manette n'importe pas three.js |
| `npx tsx tools/sim-run.ts` | manches complètes headless (métriques d'équilibrage du GDD §18) |
| `npx tsx tools/bots-arena.ts` | parties de bots en masse, équilibrage des personnalités et des niveaux |
| `node tools/e2e/solo.mjs`, `phones.mjs`, `resilience.mjs`, `flows.mjs` | parties de bout en bout (Playwright + Chrome, téléphones émulés), contre un serveur de dev lancé par `PORT=8811 pnpm dev` |
| `node tools/shot.mjs <url> <out.jpg>` | capture d'écran WebGL (Chrome headless, GPU) |

Les scripts Playwright utilisent le Chrome désigné par `CHROME_PATH` ; `nix develop .#full` fournit Chromium (et Python pour régénérer les voix).

Pages de dev (en `pnpm dev` seulement) : `/dev/world.html`, `/dev/birds.html`, `/dev/camera.html`, `/dev/ui.html`, `/dev/audio.html`, `/dev/narrator.html`, `/dev/phone.html`, `/dev/sim.html`, `/dev/bots.html`. Options de test du jeu uniquement derrière `?debug` (`?debug=fast`, `?debug=perf`…) : rien de debug n'est visible sans.

### Architecture en bref

Stack : TypeScript strict, React 19, three.js 0.186 avec React Three Fiber 9 et postprocessing, zustand, Vite 8 ; serveur Node 22 avec `ws` ; audio en WebAudio natif.

- [`server/`](server/) : relais WebSocket (salles, reconnexions) + fichiers statiques. **Aucune logique de jeu** : le PC fait autorité.
- [`src/sim/`](src/sim/) : simulation pure et déterministe à 30 Hz (soleil, ombres analytiques, peinture, piqué, tours, Grande Ombre, partie, titres). Contrat : `src/sim/types.ts` ; toutes les constantes : `src/sim/rules.ts`.
- [`src/bots/`](src/bots/) : IA pure, qui passe par la même entrée (`BirdInput`) que les humains.
- [`src/input/`](src/input/) : couche d'entrée unique (téléphone, clavier, manette, bot).
- [`src/host/`](src/host/) : le jeu sur le PC : `runner/` (orchestration), `render/` (React Three Fiber, pipeline NPR : height shadow map en espace sol, passe MRT, encre en post-process), `camera/`, `ui/`, `audio/`.
- [`src/director/`](src/director/) : narrateur et indications (logique pure).
- [`src/net/`](src/net/), [`src/phone/`](src/phone/) : session réseau et app manette (sans three.js : ~115 ko de JS gzippé).

Détails : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Déploiement (Magic Deploy)

La version publique tourne sur Magic Deploy, un hébergeur qui exécute une configuration NixOS dans une machine virtuelle derrière un proxy HTTPS et se pilote par un serveur MCP. La VM ([deploy/configuration.nix](deploy/configuration.nix)) fait tourner un service Node unique sur le port 80. Le proxy limite une requête à ~1 Mio alors que le jeu pèse ~25 Mo : la VM ne reçoit que sa configuration et le serveur, et le site est téléversé dans un volume persistant par un point d'accès authentifié (secret `UPLOAD_TOKEN`, jamais versionné), par morceaux vérifiés au SHA-256, avec bascule atomique.

```bash
pnpm deploy:prepare                                   # build + deploy/server.mjs + jeton dans .secrets/
# 1re fois : déployer deploy/ avec le MCP magic-deploy (hostname « ombres », volume /var/lib/ombres,
#            secret UPLOAD_TOKEN = .secrets/upload-token) ; ensuite, redeploy seulement si le serveur change
node tools/deploy-upload.mjs https://ombres.deploy.breizhware.com        # n'envoie que les fichiers modifiés
node tools/e2e/deploy/remote-smoke.mjs https://ombres.deploy.breizhware.com   # PC + téléphone émulé
node tools/e2e/deploy/remote-round.mjs https://ombres.deploy.breizhware.com   # une manche complète en ligne
```

Ailleurs, `pnpm build && PORT=8080 pnpm start` sert le jeu et le relais depuis un seul processus Node 22 (un bundle esbuild, sans node_modules). Les téléphones doivent joindre la même machine ; `PUBLIC_URL` fixe l'adresse encodée dans le QR code. L'inclinaison sur iOS et le Wake Lock demandent HTTPS.

---

## Documentation

| Document | Contenu |
|---|---|
| [docs/BRIEF.md](docs/BRIEF.md) | le brief d'origine, mot pour mot |
| [DECISIONS.md](DECISIONS.md) | journal des décisions (ce qui a été tranché, et pourquoi) |
| [docs/GDD.md](docs/GDD.md) | game design complet, chiffré et validé par simulation |
| [docs/ART_BIBLE.md](docs/ART_BIBLE.md) | bible artistique et technique de rendu (palettes, 12 couleurs validées, pipeline) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | modules, contrats, conventions, propriété des fichiers |
| [docs/research/](docs/research/) | recherches : style Moebius, NPR temps réel, assets et licences, TTS (local puis GPU Kaggle), stack et déploiement, trois propositions de game design, équilibrage |
| [docs/agent-notes/](docs/agent-notes/) | notes de chaque module (API, décisions, limites) |
| [docs/polish/](docs/polish/) | critiques, ordres de travail et vérifications des trois vagues de polish |
| [docs/CREDITS-sources.md](docs/CREDITS-sources.md), [assets-staging/LICENSES.md](assets-staging/LICENSES.md) | provenance et licence de chaque asset |

## Crédits et licences

Code, textes, direction artistique et game design : conçus et réalisés par Claude Opus 5.5 (Anthropic), sous la supervision de Brieuc Crosson.
Musiques : Alexandr Zhelanov (« Futuristic ambient 1 », CC-BY 4.0), Tri-Tachyon (« Soundscape – Dust – Ambient Guitar », CC-BY 4.0), cynicmusic et isaiah658 (CC0). Bruitages : Freesound (CC0) et Kenney (CC0). Voix du narrateur : en français, Qwen3-TTS d'Alibaba (Apache 2.0), voix de synthèse conçue avec Qwen3-TTS VoiceDesign (aucune personne réelle clonée) ; en anglais, Pocket TTS de Kyutai (CC BY 4.0), voix d'origine Bill Boerst (LibriVox, CC0). Polices : Julius Sans One, Patrick Hand SC, Averia Sans Libre (SIL OFL 1.1). Oiseaux, cavaliers, tours, ciel et sol sont générés procéduralement. Liste complète, fichier par fichier : [docs/CREDITS-sources.md](docs/CREDITS-sources.md) et l'écran Crédits du jeu.

### Licence

*Ombres* est **publié en source disponible, sous licence non commerciale** : la [PolyForm Noncommercial License 1.0.0](LICENSE.md), © 2026 Brieuc Crosson. Tu peux y jouer, lire et étudier le code, le modifier et le partager, pour tout usage non commercial (usage personnel, enseignement, recherche, projets de loisir, associations). **Vendre le jeu ou l'exploiter commercialement — y compris l'héberger comme service payant ou l'intégrer à un produit payant — demande une autorisation écrite** : ouvre une issue ou contacte Brieuc Crosson via GitHub. Garde la ligne `Required Notice` de [LICENSE.md](LICENSE.md) dans toute copie.

Ce n'est volontairement pas une licence « open source » au sens de l'OSI : le but est que le projet reste libre d'accès pour tous, sans que quelqu'un d'autre puisse le vendre.

Les assets tiers gardent leur propre licence, détaillée fichier par fichier dans [docs/CREDITS-sources.md](docs/CREDITS-sources.md) :

- musiques : CC-BY 4.0 (attribution ci-dessus) et CC0 ;
- bruitages : CC0 ;
- polices : SIL Open Font License 1.1 (textes de licence dans [public/fonts/](public/fonts/)) ;
- voix du narrateur : générées avec Pocket TTS (poids sous CC BY 4.0) et Qwen3-TTS (Apache 2.0).

## Limites connues

- PC hôte : Chrome, Edge ou Firefox (audio en OGG). Téléphones : tout navigateur mobile récent (iOS Safari, Chrome Android).
- Les agents ont vérifié le jeu en émulation (Playwright : iPhone 15 Pro, Pixel 7, clavier, manette simulée) et sur l'URL déployée, pas sur de vrais téléphones. Ils n'entendent pas : la qualité du son et des voix a été validée par des mesures (loudness, spectre, transcription automatique).
- L'équilibrage vient de milliers de manches de bots, pas encore de parties entre humains.
