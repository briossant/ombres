# Ombres

> **Ton ombre peint le désert. À la nuit, le plus grand territoire gagne.**

*Ombres* est un party game en multijoueur local, de 1 à 12 joueurs (idéal de 2 à 6). Le jeu tourne sur un PC branché à un écran ; chaque joueur scanne un QR code et pilote avec son téléphone un oiseau géant au-dessus d'un désert parsemé de tours. L'ombre de ton oiseau peint le sable à ta couleur. Pendant la manche, le soleil se couche : les ombres s'allongent, balaient des zones immenses, puis la nuit descend de la falaise et fige tout. Direction artistique inspirée de Moebius (ligne claire, aplats, lavis, désert pastel).

**Jouer maintenant : https://ombres-011e623351e7.deploy.breizhware.com**
(ouvrir sur le PC, de préférence Chrome, Edge ou Firefox ; les téléphones scannent le QR code affiché dans le salon.)

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
5. **Le soleil se couche.** Les ombres s'allongent, puis la nuit descend de la falaise et fige tout, d'ouest en est.

### Commandes

| | Téléphone | Clavier J1 | Clavier J2 | Manette |
|---|---|---|---|---|
| Diriger | joystick (moitié gauche) ; ou inclinaison, ou mode relatif | WASD / ZQSD / flèches | IJKL | stick gauche |
| PLONGER (maintenir) | grand bouton | Espace | AltGr | A / gâchette droite |
| COUP D'AILE | petit bouton | Maj | M (AZERTY) | B / RB |
| Pause | appui long sur ⏸ | Échap | | Start |

`F` : plein écran. Réglages (PC) : volumes séparés, qualité graphique, plein écran, FR/EN, mode daltonien (motifs et glyphes par joueur), narrateur (voix / texte / muet), conseils, réduction des flashs, tremblement de caméra. Sur le téléphone : type de contrôle, aide au vol, vibrations.

---

## Ce que contient le jeu

- Chargement avec progression réelle, écran titre animé (cinématique sur une vraie manche jouée par des bots).
- Salon : QR code, code de salle, slots de joueurs (nom, couleur, glyphe), ajout et retrait de bots (7 personnalités, 3 niveaux), réglages de partie, désert jouable avec micro-objectifs, cartes des règles animées.
- Manette téléphone complète : connexion, profil, salon, manette, entre-manches, fin de partie et revanche, reconnexion automatique, écran toujours allumé, vibrations.
- Un joueur qui se déconnecte est remplacé par un bot (même couleur, même territoire) qui lui rend la main à son retour. Rafraîchir le PC ne casse pas la partie (même salle, même écran, même manche).
- HUD : cadran solaire (le temps se lit dans le soleil), bande de sable triée avec couronne, repères des joueurs hors écran, étiquettes, bannières de phase, sous-titres du narrateur, indications contextuelles.
- Game feel : ralentis de touche, tremblement, traînées, bouffées de sable, étoiles d'impact, plumes, flash « planche », caméra qui cadre oiseaux et ombres et dramatise le piqué et la Grande Ombre.
- Narrateur : 722 répliques pré-générées (français : Qwen3-TTS sur GPU Kaggle ; anglais : Pocket TTS en local), qui désignent les joueurs par leur couleur, rares et hiérarchisées ; sous-titres toujours disponibles.
- Musique générative pilotée par la course du soleil, pistes par écran, ambiance de vent, bruitage de chaque action et de l'interface.
- Podium, titres de fin de partie (attribués par z-score), statistiques, revanche ; pause ; crédits.

---

## Développement

Environnement : NixOS (flake fourni) ou Node 22 + pnpm 10.

```bash
nix develop          # Node 22, pnpm, ffmpeg, sox, imagemagick (même Node que la VM de prod)
pnpm install
pnpm dev             # http://localhost:8787 — serveur + Vite (HMR) sur un seul port
```

Le PC ouvre `http://localhost:8787`. Les téléphones du même réseau scannent le QR code (il pointe vers l'IP locale du PC). En HTTP local, l'inclinaison iOS et le Wake Lock ne sont pas disponibles (ils demandent HTTPS) : la version déployée les a.

| Commande | Rôle |
|---|---|
| `pnpm typecheck` | TypeScript strict (TS 7) |
| `pnpm test` | tests unitaires (vitest, ~350 tests : simulation, bots, rendu, caméra, UI, réseau, audio, narrateur) |
| `pnpm check:boundaries` | la simulation et les bots n'importent ni React, ni three.js, ni le DOM |
| `npx tsx tools/sim-run.ts` | manches complètes headless (métriques d'équilibrage du GDD §18) |
| `npx tsx tools/bots-arena.ts` | parties de bots en masse, équilibrage des personnalités et des niveaux |
| `node tools/e2e/solo.mjs`, `phones.mjs`, `resilience.mjs`, `flows.mjs` | parties de bout en bout (Playwright + Chrome, téléphones émulés) |
| `node tools/shot.mjs <url> <out.jpg>` | capture d'écran WebGL (Chrome headless, GPU) |

Pages de dev (en `pnpm dev` seulement) : `/dev/world.html`, `/dev/birds.html`, `/dev/camera.html`, `/dev/ui.html`, `/dev/audio.html`, `/dev/narrator.html`, `/dev/phone.html`, `/dev/sim.html`, `/dev/bots.html`. Options de test du jeu uniquement derrière `?debug` (`?debug=fast`, `?debug=perf`…) : rien de debug n'est visible sans.

### Architecture en bref

- `server/` — relais WebSocket (salles, reconnexions) + fichiers statiques. **Aucune logique de jeu** : le PC fait autorité.
- `src/sim/` — simulation pure et déterministe à 30 Hz (soleil, ombres analytiques, peinture, piqué, tours, Grande Ombre, partie, titres). Contrat : `src/sim/types.ts` ; toutes les constantes : `src/sim/rules.ts`.
- `src/bots/` — IA pure, qui passe par la même entrée (`BirdInput`) que les humains.
- `src/input/` — couche d'entrée unique (téléphone, clavier, manette, bot).
- `src/host/` — le jeu sur le PC : `runner/` (orchestration), `render/` (React Three Fiber, pipeline NPR : height shadow map en espace sol, passe MRT, encre en post-process), `camera/`, `ui/`, `audio/`.
- `src/director/` — narrateur et indications (logique pure).
- `src/net/`, `src/phone/` — session réseau et app manette (sans three.js : 42 ko gzip).

Détails : `docs/ARCHITECTURE.md`.

---

## Déploiement (Magic Deploy)

La VM est une machine NixOS (`deploy/configuration.nix`) : un service Node unique sur le port 80. Le proxy de Magic Deploy limite une requête à ~1 Mio alors que le jeu pèse ~20 Mo : la VM ne reçoit que sa configuration et le serveur, et le site est **téléversé** dans un volume persistant par un point d'accès authentifié (secret `UPLOAD_TOKEN`, jamais versionné).

```bash
pnpm deploy:prepare                                   # build + deploy/server.mjs + jeton dans .secrets/
# 1re fois : déployer deploy/ avec le MCP magic-deploy (volume /var/lib/ombres, secret UPLOAD_TOKEN = .secrets/upload-token)
node tools/deploy-upload.mjs https://<machine>.deploy.breizhware.com   # n'envoie que les fichiers modifiés
node tools/e2e/deploy/remote-smoke.mjs https://<machine>…             # PC + téléphone émulé sur l'URL publique
```

---

## Documentation

| Document | Contenu |
|---|---|
| `docs/BRIEF.md` | le brief d'origine |
| `DECISIONS.md` | journal des décisions (ce qui a été tranché, et pourquoi) |
| `docs/GDD.md` | game design complet, chiffré et validé par simulation |
| `docs/ART_BIBLE.md` | bible artistique et technique de rendu (palettes, 12 couleurs validées, pipeline) |
| `docs/research/` | recherches : style Moebius, NPR temps réel, assets et licences, TTS (local puis GPU Kaggle), stack et déploiement, trois propositions de game design, équilibrage |
| `docs/agent-notes/` | notes de chaque module (API, décisions, limites) |
| `docs/polish/` | critiques, ordres de travail et vérifications des deux vagues de polish |
| `docs/CREDITS-sources.md`, `assets-staging/LICENSES.md` | provenance et licence de chaque asset |

## Crédits et licences

Code, textes, direction artistique et game design : conçus et réalisés par Claude (Anthropic), sous la supervision de Brieuc Crosson.
Musiques : Alexandr Zhelanov (« Futuristic ambient 1 », CC-BY 4.0), Tri-Tachyon (« Dust », CC-BY 4.0), cynicmusic et isaiah658 (CC0). Bruitages : Freesound (CC0) et Kenney (CC0). Voix du narrateur : en français, **Qwen3-TTS d'Alibaba (Apache 2.0)**, voix de synthèse conçue avec Qwen3-TTS VoiceDesign ; en anglais, **Pocket TTS de Kyutai (CC BY 4.0)**, voix d'origine Bill Boerst (LibriVox, CC0). Polices : Julius Sans One, Patrick Hand SC, Averia Sans Libre (SIL OFL 1.1). Oiseaux, cavaliers, tours, ciel et sol sont générés procéduralement. Liste complète, fichier par fichier : `docs/CREDITS-sources.md` et l'écran Crédits du jeu.

## Limites connues

- PC hôte : Chrome, Edge ou Firefox (audio en OGG). Téléphones : tout navigateur mobile récent (iOS Safari, Chrome Android).
- Le jeu a été vérifié en émulation (Playwright : iPhone 15 Pro, Pixel 7, clavier, manette simulée) et sur l'URL déployée, mais pas sur de vrais téléphones, et personne n'a encore écouté le mixage : la qualité sonore et vocale est validée par des mesures (loudness, spectre, transcription automatique).
- L'équilibrage vient de milliers de manches de bots, pas encore de parties entre humains.
