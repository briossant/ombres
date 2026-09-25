# Ombres — architecture et règles de travail

Document de référence technique. Le **quoi** (règles, chiffres) est dans `docs/GDD.md` ; le **à quoi ça ressemble** dans `docs/ART_BIBLE.md`. Ce document fixe le **comment** : modules, contrats, conventions, outillage, et qui possède quoi.

## 1. Vue d'ensemble

```
             ┌──────────────── PC (navigateur, autorité) ─────────────────┐
 téléphones  │  src/net (session hôte) ──► src/input (routeur d'entrées)   │
 (src/phone) │        ▲                        │  BirdInput par slot        │
     │ WS    │        │ vues/vibrations        ▼                           │
     ▼       │  runner (src/host/runner) ─► src/sim (Simulation 30 Hz, pur)│
 serveur ◄──►│        │   ▲ src/bots (pur, même BirdInput)  │ SimEvent[]    │
 (server/)   │        │   └───────────────────────────────  ▼             │
 relais pur  │        ├─► gameView (src/host/view.ts) ─► rendu R3F        │
             │        ├─► bus simEvents ─► audio, narrateur, FX, caméra   │
             │        └─► stores zustand (UI : écrans, HUD)               │
             └─────────────────────────────────────────────────────────────┘
```

- **Le serveur** (`server/`) ne contient aucune logique de jeu : salles, identités, reconnexions, relais JSON. Il sert le jeu (Vite en dev, `dist/` en prod) sur un seul port.
- **La simulation** (`src/sim`) est du TypeScript pur, déterministe, à pas fixe 30 Hz. Elle tourne dans le navigateur du PC et dans Node (tests, parties de bots headless). Contrat : `src/sim/types.ts`. Constantes : `src/sim/rules.ts` (transcription du GDD §19 — **aucun chiffre de gameplay en dur ailleurs**).
- **Une seule couche d'entrée** : tout oiseau reçoit un `BirdInput` par tick, qu'il vienne d'un téléphone, du clavier, d'une manette ou d'un bot. La simulation ne sait pas qui pilote.
- **Le rendu** (R3F) lit l'état à chaque frame via `gameView` (mutable, hors React) et interpole les oiseaux entre deux ticks. Aucune logique de jeu dans les composants React.
- **L'UI** (écrans, HUD) est en DOM/React, alimentée par des stores zustand mis à jour à basse fréquence (≤ 10 Hz), jamais à 60 Hz.

## 2. Arborescence et propriété

| Chemin | Rôle | Propriétaire (phase 2) |
|---|---|---|
| `server/` | relais WebSocket + statique | lead (fait) |
| `src/shared/protocol.ts` | transport WS | lead (fait) |
| `src/shared/messages.ts` | messages PC ↔ téléphone | agent **net-phone** |
| `src/shared/players.ts`, `palette.json` | 12 couleurs joueurs, palette | lead (fait) — lecture seule |
| `src/shared/i18n.ts`, `strings/index.ts` | i18n | lead (fait) |
| `src/shared/strings/<domaine>.ts` | chaînes FR/EN | un fichier par agent (voir §6) |
| `src/sim/types.ts`, `src/sim/rules.ts` | **contrats** | lead ; l'agent **sim** peut les étendre (ajouts compatibles uniquement, notés dans `docs/agent-notes/sim.md`) |
| `src/sim/**` | simulation, cartes, partie, titres | agent **sim** |
| `src/bots/**` | IA des bots | agent **bots** |
| `src/host/render/**` (sauf `bird/`, `fx/`) | pipeline NPR, sol, territoire, ombres, ciel, tours, décor, presets | agent **world** |
| `src/host/render/bird/**`, `src/host/render/fx/**` | oiseau + cavalier procéduraux, animation, traînées, FX encre | agent **birds** |
| `src/host/audio/**` | moteur audio, musique, SFX, vent, lecture du narrateur | agent **audio** |
| `src/director/**` | logique pure : choix des répliques du narrateur, indications contextuelles | agent **director** |
| `src/net/**`, `src/phone/**` | session hôte, client téléphone, app téléphone | agent **net-phone** |
| `src/host/ui/**` | écrans PC, HUD, réglages, crédits | agent **ui** |
| `src/host/runner/**`, `src/input/**`, `src/host/camera/**`, `src/host/App.tsx`, `src/host/main.tsx` | orchestration, caméra, entrées | phase 3 (intégration) |
| `src/host/view.ts`, `src/host/bus.ts`, `src/host/settings.ts` | contrats hôte | lead (fait) — extensions compatibles autorisées |
| `dev/<agent>.html` + `src/dev/<agent>/**` | pages de lookdev / test de chaque agent | chaque agent la sienne |
| `public/<type>/**` | assets finaux servis | voir §7 |
| `tools/**` | scripts | chacun ses fichiers ; `tools/shot.mjs`, `tools/lib/` partagés (lead) |

**Règle d'or : on ne modifie jamais un fichier possédé par un autre agent.** Besoin d'un changement ailleurs ? Écris-le dans `docs/agent-notes/REQUESTS.md` (qui, quoi, pourquoi) et contourne proprement en attendant (adaptateur local). Documente tes décisions et ton API dans `docs/agent-notes/<agent>.md`.

## 3. Conventions

- **Monde** : x = est, y = nord, z = altitude (m). three.js a Y en haut : `three(x, y, z) = (sim.x, sim.z, -sim.y)`. La caméra de jeu regarde le nord (lacet fixe) : le soleil se couche à gauche de l'écran, les ombres filent vers la droite.
- **Cap** : radians, sens trigonométrique depuis l'est. **Azimut solaire** : depuis le nord, sens horaire.
- **Slot** : 0..11, identité stable d'un joueur pendant la partie. Code propriétaire d'une cellule : `slot + 1` (0 = neutre). La couleur d'un slot est portée par `PlayerVisual.colorIndex` (index dans `PLAYER_COLORS`).
- **Temps** : la simulation avance par ticks de `1 / RULES.tickHz`. Le runner applique les ralentis (`timeScale`) en dosant les ticks, jamais en changeant le dt d'un tick.
- **Aléatoire** : uniquement via le PRNG à graine de la simulation / des bots (jamais `Math.random()` dans `src/sim` ni `src/bots`).
- **Chaînes visibles** : toujours via `t('domaine.cle')` (`src/shared/i18n.ts`), FR et EN. Les noms de couleur via `colorName(index, lang)`.
- **TypeScript strict** partout. Pas de `any` implicite, pas de `// @ts-ignore` (sauf justifié en commentaire).
- **Aucun élément de debug visible en jeu** : les outils de debug sont derrière `?debug` dans l'URL ou dans les pages `dev/`.
- Commentaires en français, sobres, là où ils aident. Identifiants en anglais.

## 4. Contrats clés

- `src/sim/types.ts` : `BirdInput`, `SimConfig`, `SimState` (soleil, arène, tours, oiseaux, grille de territoire, nuit, stats), `SimEvent`, `Simulation`. La grille expose des tableaux typés directement utilisables comme `DataTexture` (512 × 352).
- `src/host/view.ts` : `gameView` (état courant, états précédents, alpha d'interpolation, joueurs visibles, mode daltonien).
- `src/host/bus.ts` : `simEvents` (émetteur d'événements de simulation).
- `src/host/settings.ts` : réglages persistés (volumes, qualité, langue, narrateur, daltonien, indications, flashs, tremblement).
- `src/shared/protocol.ts` + `messages.ts` : réseau.
- `src/shared/players.ts` : couleurs, noms FR/EN, glyphes, motifs, paramètres de lavis.

## 5. Outillage

- `nix develop` (ou Node 22 + pnpm), `pnpm install`, **`PORT=<port> pnpm dev`** : serveur + Vite (HMR) sur un seul port. Chaque agent utilise **son propre port** (voir sa mission) pour ne pas gêner les autres.
- Pages de dev : tout fichier `dev/<nom>.html` est servi en dev à `http://localhost:<port>/dev/<nom>.html` (pas besoin de toucher `vite.config.ts`). Elles ne sont pas incluses dans le build de prod.
- Captures : `node tools/shot.mjs <url> <out.jpg> [--ready] [--wait=ms] [--mobile="iPhone 15 Pro"] [--landscape] [--eval="…"]`. Pour des scénarios, écris un script Playwright qui importe `tools/lib/browser.mjs`. **Regarde toujours les captures** (outil Read) : c'est le seul juge. Captures dans `shots/<agent>/` (ignoré par git).
- Le GPU est partagé entre agents : ne conclus rien sur les performances pendant la phase parallèle sans vérifier `/sys/class/drm/card1/device/gpu_busy_percent` ; préfère les timer queries GPU.
- Typecheck : `npx tsc --noEmit -p tsconfig.json`. Pendant la phase parallèle, d'autres agents ont du code en cours : filtre sur tes chemins (`… | grep -E '^src/(sim|bots)/'`) et ne corrige jamais les fichiers des autres.
- `pnpm check:boundaries` : `src/sim` et `src/bots` n'importent ni React, ni three, ni le DOM ; `src/phone` n'importe pas three.
- Tests : `vitest` (`*.test.ts` à côté du code).
- **Dépendances** : ne modifie pas `package.json` toi-même. Déjà installés : react 19.3, three 0.186.1, R3F 9.8, drei 10.7, postprocessing 6.39.5 + @react-three/postprocessing 3.1.2, zustand 5, tone 15, qrcode, ws, playwright-core, vitest, tsx, esbuild. Besoin d'autre chose : `docs/agent-notes/REQUESTS.md`.
- **Git** : ne commite pas (le lead commite entre les phases).
- Nix : jamais d'installation impérative (`nix profile install`, `nix-env -i`) ; `nix-shell -p …` / `nix run nixpkgs#…` pour un outil ponctuel.

## 6. Chaînes (i18n)

Un fichier par domaine dans `src/shared/strings/`, clés préfixées par le domaine :
`common` (lead), `phone` (net-phone), `host` (ui), `titles` (ui), `hints` (director), `narrator` (director).

## 7. Assets

- Matière première téléchargée et licences : `assets-staging/` + `assets-staging/LICENSES.md` (ne pas servir directement).
- Assets servis : `public/audio/{sfx,music,narrator}/`, `public/fonts/`, `public/textures/`, `public/models/`. Chaque agent qui copie un asset dans `public/` ajoute sa ligne (fichier, source, auteur, licence, attribution) dans `docs/CREDITS-sources.md` (section de l'agent).
- Poids total visé du jeu : < 40 Mo. Chargement avec progression réelle (le manifeste des assets à précharger est construit en phase 3).

## 8. Performance

60 fps stables en 1080p sur iGPU de classe Vega 6 (ART_BIBLE §7.5) : ≤ 10 ms GPU en High, ≤ 6 ms CPU par frame. Pas d'allocation par frame dans les boucles chaudes (sim, rendu), instanciation pour tout ce qui est répété, < 150 draw calls.
