# Stack technique & déploiement — vérifié par tests réels

> Agent `stack`, 2026-09-25. Tout ce qui est marqué ✅ a été exécuté sur cette machine (NixOS, Ryzen APU AMD Renoir `1002:1636`, Mesa 25.2.6, Chrome 150.0.7871.46, Node 22.22.0, pnpm 10.28.0, Determinate Nix 3.15.2) ou sur une VM Magic Deploy de test (détruite depuis).
> Scripts de test : `/tmp/claude-1001/-home-bcr-session-vibe-2026-09-05/5edd7b3f-1d22-4bd7-beef-3301f2b3bcd4/scratchpad/stack/` (`shot.mjs`, `probe-webgl.mjs`, `ws-client.mjs`, `ws-load.mjs`, `downtime.mjs`, `app-test/`, `flake-test/`).

## TL;DR

- **Versions** : la matrice ci-dessous s'installe sans aucun warning de peer dep (pnpm 10), passe `tsc` (TS 7.0.2 natif), `vite build` (Vite 8 / Rolldown, 1 s), `vitest run` (Vitest 5) et tourne dans Chrome. **Épingler exactement** `react@19.3.x` (R3F 9.8 exige `<19.4`) et `three@0.186.x` (postprocessing 6.39 exige `<0.187`).
- **three r186** : `PCFSoftShadowMap` **supprimé** (fallback PCF + warning) et `THREE.Clock` déprécié → utiliser `<Canvas shadows="percentage">` (ou `"variance"`) et `THREE.Timer` pour notre propre horloge.
- **Rendu couleur NPR** : `<Canvas flat>` (= `NoToneMapping`), sinon R3F applique ACES Filmic par défaut et délave les pastels.
- **WebGL2 accéléré en headless** : `--enable-gpu --ignore-gpu-blocklist --use-gl=angle --use-angle=gl-egl` → `ANGLE (AMD, AMD Radeon Graphics (radeonsi renoir ACO), OpenGL ES 3.2)`, aucune fenêtre visible, marche **avec ou sans DISPLAY**. Sans flags : SwiftShader (10× plus lent, pertes de contexte).
- **fps headless** : plafonné à ~60 (vsync). `--disable-gpu-vsync --disable-frame-rate-limit` pour mesurer la marge réelle. Machine **partagée** avec les autres agents : les mesures fps sont bruitées dès qu'un autre Chrome rend (vu 0,5 → 59 fps sur la même scène).
- **Magic Deploy** : recette `dir` + `configuration.nix` (systemd, `pkgs.nodejs_22`, bundle esbuild) validée. Build ~30 s. Hôte NixOS **26.05**, Node **22.23.2**. Proxy **nginx**, HTTP/2, TLS OK, gzip ajouté par le proxy.
- **WebSocket via le proxy** : wss OK (Node et Chrome). RTT moyen **17,7–19,1 ms** sur 100 pings (= ping ICMP ~18,7 ms : le proxy n'ajoute rien de mesurable). 13 clients × 60 Hz : p50 17,5–19,9 ms, 0 perte, 11 % d'un cœur serveur.
- **Timeout d'inactivité du proxy : ~300 s** (coupure 1006 à 300,2 s ; OK à 290 s). Un ping WS toutes les 25 s (client ou serveur) maintient la connexion (testé 330 s). Pas de limite de taille de message constatée (60 MiB OK). `permessage-deflate` traverse le proxy (÷3,7 sur du JSON d'état) mais coûte ~1–2 ms de latence.
- **Redeploy = ~31 s d'indisponibilité** (502/503), WS coupées en 1006 → reconnexion automatique obligatoire et état de salle reconstructible par le PC.
- **Mémoire serveur** : Node 67 Mo RSS au repos, 72 Mo avec 200 connexions ; conteneur complet ~108 Mo. 512 Mo par défaut = large.

---

## 1. Matrice de versions (npm view, 2026-09-25)

| Paquet | Version à épingler | Rôle / contrainte vérifiée |
|---|---|---|
| react / react-dom | **19.3.0** | R3F 9.8.1 : `react >=19 <19.4` → ne pas passer à 19.4 sans nouveau R3F |
| @types/react / @types/react-dom | 19.3.0 | |
| three | **0.186.1** | postprocessing 6.39.5 : `three >=0.168 <0.187` → pas de r187 avant maj postprocessing |
| @types/three | 0.186.0 | aligné sur la mineure three |
| @react-three/fiber | **9.8.1** | React 19 only ; three >=0.156 |
| @react-three/drei | 10.7.9 | R3F ^9, three >=0.159 |
| @react-three/postprocessing | 3.1.2 | exige R3F >=9.7, postprocessing ^6.36 |
| postprocessing | 6.39.5 | (v7 encore en beta : ne pas prendre) |
| zustand | 5.0.15 | |
| vite | **8.3.1** | Rolldown 1.2 + Oxc + LightningCSS ; Node ^20.19 ‖ >=22.12 |
| @vitejs/plugin-react | 6.1.1 | exige vite ^8 ; plus de Babel par défaut |
| typescript | **7.0.2** | compilateur natif (Go). `tsc --noEmit` OK sur notre config strict. Repli possible : 6.0.3 |
| vitest | 5.0.2 | Node ^22.12 ; vite ^6.4‖^7‖^8 |
| tsx | 4.23.15 | dev serveur (`tsx watch server/index.ts`) ✅ |
| esbuild | 0.28.2 | bundle du serveur (ws inclus) ✅ ; peer optionnel de vite 8 |
| ws / @types/ws | 8.21.3 / 8.18.1 | ✅ |
| qrcode / @types/qrcode | 1.5.4 / 1.5.6 | ✅ (9,6 Ko gz côté client). Alternative `uqr@0.1.3` : 4,2 Ko gz, SVG, zéro dépendance ✅ |
| playwright-core | 1.63.0 | pilote Chrome 150 système ✅ (pas de téléchargement de navigateur) |
| tone | 15.1.22 | ✅ build + chargement (+58 Ko gz). AudioContext `suspended` jusqu'au premier geste |
| howler / @types/howler | 2.2.4 / 2.2.13 | optionnel ; paquet non maintenu depuis 2023 — préférer WebAudio direct ou Tone |
| @types/node | **^22** | le runtime est Node 22 (dev et VM) : `@types/node@26` expose des API absentes de Node 22 |
| (optionnels) three-mesh-bvh 0.9.15, stats-gl 4.2.3, detect-gpu 5.0.70, maath 0.10.8, leva 0.10.1, r3f-perf 7.2.3 | | r3f-perf non mis à jour depuis 2024 → préférer `stats-gl` (dev only) |

Résultat de l'install ✅ : `pnpm install` = 152 paquets, 2,1 s, **aucun warning de peer**. Seul avertissement : scripts de build ignorés pour esbuild → ajouter dans `package.json` :

```json
"pnpm": { "onlyBuiltDependencies": ["esbuild"] }
```

(Le `package.json` actuel à la racine du projet est déjà aligné sur cette matrice, sauf `@types/node ^26.6.2` → passer à `^22.19.0`.)

`tsconfig.json` testé avec TS 7.0.2 (0 erreur, R3F JSX typé correctement) :

```json
{
  "compilerOptions": {
    "target": "ES2023", "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext", "moduleResolution": "bundler", "jsx": "react-jsx",
    "strict": true, "noUncheckedIndexedAccess": true, "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true, "verbatimModuleSyntax": true, "isolatedModules": true,
    "skipLibCheck": true, "noEmit": true, "types": ["vite/client", "node"]
  },
  "include": ["src", "server", "vite.config.ts"]
}
```

## 2. Breaking changes et changements de comportement notables

### three.js (r152 → r186)
- **r186 : `PCFSoftShadowMap` supprimé** ✅ constaté : `THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.` Or `<Canvas shadows>` (booléen) de R3F 9.8.1 demande encore PCFSoft → warning. Écrire `shadows="percentage"` (PCF), `"variance"` (VSM, ombres floutables) ou `"basic"` (dur, pixelisé — intéressant pour un rendu graphique net).
- **`THREE.Clock` déprécié → `THREE.Timer`** ✅ (warning émis par R3F lui-même via `state.clock`, sans effet). Dans la simulation, utiliser notre propre pas de temps fixe, pas `state.clock`.
- **Color management (depuis r152)** : `ColorManagement.enabled = true`, sortie `SRGBColorSpace`. Les couleurs hex/CSS sont en sRGB et converties en linéaire. Les textures de **couleur** doivent avoir `tex.colorSpace = THREE.SRGBColorSpace` ; les textures de **données** (masque de territoire, bruit, hachures utilisées comme seuil, normales) restent en `NoColorSpace`. Dans un `ShaderMaterial` qui veut rester cohérent : finir par `#include <tonemapping_fragment>` puis `#include <colorspace_fragment>` (ex-`encodings_fragment`). Un `RawShaderMaterial` n'a aucune conversion automatique.
- **R3F ajoute ACES Filmic par défaut** (`gl.toneMapping = flat ? NoToneMapping : ACESFilmicToneMapping`, lu dans la source 9.8.1) : pour une palette pastel/aplats Moebius, **`<Canvas flat>`**, et gérer la « lumière » nous-mêmes dans les shaders toon. Avec `postprocessing`, le tone mapping éventuel se fait par un `ToneMappingEffect` en fin de chaîne.
- **Lumières physiques par défaut (r155)**, `useLegacyLights` supprimé (r165) : les intensités « à l'ancienne » doivent être multipliées par ~π. Peu important si l'éclairage est dans nos shaders toon.
- **WebGL1 supprimé (r163)** : WebGL2 obligatoire (dispo partout, ✅ en headless).
- **WebGPURenderer** (`three/webgpu`, TSL via `three/tsl`) : fonctionnel, mais (a) `postprocessing` v6 et `@react-three/postprocessing` sont **WebGL uniquement**, (b) une partie de drei suppose `ShaderMaterial` GLSL, (c) ✅ en headless sur cette machine `navigator.gpu.requestAdapter()` renvoie **null** → impossible de vérifier visuellement. **Rester sur WebGLRenderer.**
- Capacités WebGL2 mesurées en headless ✅ : `EXT_disjoint_timer_query_webgl2` (timing GPU), `EXT_color_buffer_float` (RT float), `MAX_SAMPLES` 8, `MAX_TEXTURE_SIZE` 16384, `MAX_DRAW_BUFFERS` 8 (MRT possible pour un G-buffer normal/depth/id).

### React Three Fiber 9 / drei 10
- R3F 9 = React 19 uniquement ; l'augmentation JSX passe par `ThreeElements` :
  ```ts
  declare module '@react-three/fiber' { interface ThreeElements { sandMaterial: ThreeElement<typeof SandMaterial> } }
  extend({ SandMaterial });
  ```
- `gl` de `<Canvas>` accepte une fonction (éventuellement async) qui retourne le renderer ; `StrictMode` est hérité du parent (double montage en dev : les effets de bord doivent être idempotents).
- ✅ piège vu : `<Outlines screenspace thickness={2}>` (drei) sur un cylindre à normales non lissées produit des coques noires énormes ; en mode monde (`thickness={0.06}`) le contour est quasi invisible. L'inverted hull exige des normales lissées ; pour la ligne claire, préférer un post-process de détection de contours (profondeur/normales/ID) — à trancher par l'étude NPR.
- Game loop : ne pas passer l'état de la simulation par React ; lire `useGame.getState()` dans `useFrame`. zustand 5 : `create<T>()(...)` (currying), sélecteurs qui construisent un objet → `useShallow`, comparateur custom → `createWithEqualityFn` de `zustand/traditional`.

### Vite 8 / plugin-react 6
- Bundler **Rolldown** (Rust) + transform **Oxc** : build complet test (580 modules) en 0,8–1,4 s ✅.
- `build.rollupOptions` → **`build.rolldownOptions`** (l'ancien nom marche mais est déprécié, message vu dans la source) ; `optimizeDeps.esbuildOptions` → `optimizeDeps.rolldownOptions`.
- esbuild n'est plus une dépendance de Vite (peer optionnel) : on l'ajoute nous-mêmes pour bundler le serveur.
- plugin-react 6 : Fast Refresh via Oxc, pas de Babel. React Compiler uniquement via `@rolldown/plugin-babel` + `babel-plugin-react-compiler` (inutile ici).
- Avertissement « chunk > 500 kB » (three = 737 kB min / 187 kB gz) : normal ; découper via `build.rolldownOptions.output.codeSplitting` ou `import()` dynamique pour l'UI téléphone (qui ne doit **pas** charger three).

### TypeScript 7
- `typescript@7.0.2` = compilateur natif (binaire par plateforme). `tsc --noEmit` ✅ sur client + serveur + vite.config. Les outils qui utilisent l'API JS du compilateur (typescript-eslint en mode typé, ts-morph, vite-plugin-checker) peuvent ne pas le supporter : si besoin, installer `typescript@6.0.3` à côté pour eux. Ne pas utiliser `baseUrl` ni `moduleResolution: node` (retirés/dépréciés depuis 6.0) — non testé ici, simplement éviter.

## 3. Capture WebGL headless (Playwright + Chrome système)

### 3.1 Résultats par combinaison de flags ✅

Scène de test `bench.html` : sol 200×200 segments + N TorusKnot instanciés (4 096 tris chacun), 1 DirectionalLight avec shadow map 2048, MeshStandardMaterial. `n=400` = 3,36 M triangles/frame (passe d'ombre incluse). 1280×720, rAF compté sur 3 s.

| Flags (`headless: true`) | Renderer (UNMASKED_RENDERER_WEBGL) | fps | Sans DISPLAY |
|---|---|---|---|
| *(aucun)* | SwiftShader (Vulkan, Subzero) | 11,5 + `CONTEXT_LOST_WEBGL` | idem |
| `--enable-gpu --ignore-gpu-blocklist` | AMD radeonsi renoir ACO, OpenGL 4.6 | 53,4 | ❌ retombe sur SwiftShader |
| … `+ --use-gl=angle --use-angle=gl-egl` | AMD radeonsi, **OpenGL ES 3.2** | 52,7 | ✅ radeonsi (54,7) |
| … `+ --use-angle=vulkan --enable-features=Vulkan` | AMD RADV RENOIR, Vulkan 1.4.318 | 56,5 | ✅ RADV (57,3) |
| … `+ --use-angle=gl` | AMD radeonsi, OpenGL 4.6 | 58,3 | non testé |
| … `+ --use-gl=egl` | SwiftShader (flag ignoré) | 14,9 | idem |
| `--use-angle=swiftshader --enable-unsafe-swiftshader` | SwiftShader | 1,5 | idem |

1920×1080, GPU au repos, `--enable-gpu --ignore-gpu-blocklist` :

| Scène | vsync (défaut) | `--disable-gpu-vsync --disable-frame-rate-limit` (GL) | idem Vulkan |
|---|---|---|---|
| n=50 (0,49 M tris) | 58,7 | 548 | 564 |
| n=400 (3,36 M tris) | 59,0 | 140 | 130 |
| n=1500 (12,4 M tris) | 49,4 | 74 | 69 |
| n=400 sans ombres (1,7 M tris) | 58,3 | 206 | 170 |

✅ Aucune fenêtre créée : `xdotool search --onlyvisible` compte 8 fenêtres avant et pendant la capture. Le mode headless de Chrome 150 est le « nouveau headless » (vrai Chrome, pas `headless_shell`).

### 3.2 Snippet de capture recommandé — `tools/shot.mjs`

Ce code exact a été exécuté tel quel (copie : `scratchpad/stack/app-test/tools/shot.mjs`) : desktop 1920×1080 en JPEG, Pixel 7 en PNG, et avec `env -u DISPLAY` : les trois donnent `radeonsi … OpenGL ES 3.2`. Il faut `playwright-core` dans les `node_modules` du projet.

```js
// node tools/shot.mjs <url> <out.png|jpg> [--mobile="iPhone 15 Pro"] [--landscape] [--wait=1500] [--w=1920 --h=1080] [--no-vsync]
import { chromium, devices } from 'playwright-core';

const CHROME = process.env.CHROME_PATH ?? '/etc/profiles/per-user/bcr/bin/google-chrome';
// GPU matériel AMD en headless, sans fenêtre, avec ou sans DISPLAY :
const GPU_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl-egl'];
// Fallback logiciel (lent, ~10x ; pertes de contexte possibles sur scènes lourdes) :
const SWIFTSHADER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const [url, out = 'shot.png', ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const args = [...(process.env.SOFTWARE_GL ? SWIFTSHADER_ARGS : GPU_ARGS), '--autoplay-policy=no-user-gesture-required'];
if (opt['no-vsync']) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args });
let ctxOpts = { viewport: { width: +(opt.w ?? 1920), height: +(opt.h ?? 1080) }, deviceScaleFactor: 1 };
if (opt.mobile) {
  const { defaultBrowserType, ...d } = devices[opt.mobile === true ? 'iPhone 15 Pro' : opt.mobile];
  ctxOpts = { ...d };
  if (opt.landscape) ctxOpts.viewport = { width: d.viewport.height, height: d.viewport.width };
}
const context = await browser.newContext(ctxOpts);
const page = await context.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'NO WEBGL2';
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
if (/SwiftShader/.test(gpu) && !process.env.SOFTWARE_GL) console.warn('ATTENTION: rendu logiciel', gpu);
await page.waitForTimeout(+(opt.wait ?? 1500));
await page.screenshot({ path: out, ...(/\.jpe?g$/.test(out) ? { type: 'jpeg', quality: 85 } : {}) });
console.log(JSON.stringify({ out, gpu, logs: logs.slice(-10) }, null, 1));
await browser.close();
```

Mesure de fps dans la page (à exposer par le jeu, en mode dev uniquement) :
```js
// dans la page : window.__perf = { frames, fps, done } rempli par la boucle rAF sur 3 s
await page.waitForFunction(() => window.__perf?.done === true, null, { timeout: 20000 });
```

### 3.3 Émulation téléphone ✅
- `devices['iPhone 15 Pro']` (393×659, DPR 3, UA iOS) et `devices['Pixel 7']` (412×839, DPR 2,625) disponibles (liste jusqu'à iPhone 17 / Pixel 9). Retirer `defaultBrowserType` avant `newContext` (on force Chromium).
- Vérifié dans la page émulée : `ontouchstart` présent, `navigator.vibrate(50) → true`, `navigator.wakeLock.request('screen')` OK, `requestFullscreen` présent. `maxTouchPoints` vaut **1** (limite d'émulation) : ne pas s'en servir pour détecter le multi-touch.
- Tap simple : `page.touchscreen.tap(x, y)` → `pointerdown` de type `touch` ✅.
- **Multi-touch (joystick + bouton simultanés)** via CDP ✅ (`touches=2`, cibles `pad` et `btn`) :
  ```js
  const cdp = await context.newCDPSession(page);
  const tp = (id, x, y) => ({ x, y, id, radiusX: 5, radiusY: 5, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(0, 60, 400)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',  touchPoints: [tp(0, 90, 380)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(0, 90, 380), tp(1, 300, 320)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd',   touchPoints: [] });
  ```
- Pour tester PC + téléphones ensemble : **un `browser`, plusieurs `context`** (un par téléphone) — mais voir le piège fps ci-dessous.

### 3.4 Coût des captures ✅
- 1920×1080 : **PNG 1,7 s/capture** (fichier ~3 Mo : le grain/bruit rend le PNG incompressible), **JPEG q85 0,21 s**. Pour des séquences (animation du coucher de soleil, particules), utiliser JPEG ; PNG pour les captures uniques de référence.

### 3.5 Pièges headless
1. **Sans `--enable-gpu`, Chrome headless = SwiftShader** même si le GPU est dispo. Toujours logger `UNMASKED_RENDERER_WEBGL` et refuser de juger un rendu/une perf si « SwiftShader » apparaît.
2. `--enable-gpu` seul dépend de `DISPLAY` (GLX). `--use-angle=gl-egl` ou `--use-angle=vulkan` n'en dépendent pas.
3. **GPU partagé entre agents** : pendant les tests, `/sys/class/drm/card1/device/gpu_busy_percent` était à 100 % à cause d'autres Chrome headless ; la même scène est passée de 59 à 0,5–29 fps. Avant une mesure de perf : vérifier `gpu_busy_percent` ≈ 0, mesurer en `--no-vsync`, et préférer le temps GPU (`EXT_disjoint_timer_query_webgl2`) + temps CPU de frame, plus robustes que les fps.
4. **Plusieurs pages ouvertes dans le même navigateur se partagent le GPU et rAF n'est pas bridé pour les pages « en arrière-plan »** : 2 pages → 15 + 13 fps au lieu de 29. Fermer les pages inutiles ; pour une mesure, une seule page qui rend.
5. Le warning `404` en console = favicon absent (bruit).

## 4. flake.nix de dev recommandé ✅

Testé dans `flake-test/` : `nix develop --command node --version` → **v22.23.3** (26 s au premier lancement, téléchargements depuis cache.nixos.org), pnpm 10.34.0, ffmpeg 8.1.2 (encodeurs `libopus`, `libvorbis`, `libmp3lame`, `aac` présents), SoX 14.4.2, ImageMagick 7.1.2-31, `CHROME_PATH` détecté. `nix flake check --no-build` OK, `.#full` s'évalue (chromium, piper-tts 1.4.2, espeak-ng). Le flake doit être suivi par git (`git add flake.nix`) pour être vu par `nix develop`.

**Pourquoi `nixos-26.05`** : c'est la version de l'hôte Magic Deploy (NixOS 26.05, `pkgs.nodejs_22` = 22.23.2) → même Node en dev et en prod. Le `flake.nix` actuel à la racine pointe sur `nixpkgs-unstable` : à aligner.

```nix
{
  description = "Ombres — party game (Vite + R3F + Node/ws) : environnement de dev";

  inputs = {
    # Même branche que l'hôte Magic Deploy (NixOS 26.05) => même Node 22 en dev et en prod.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs:
        let
          common = with pkgs; [
            nodejs_22 # runtime client/serveur (22.x, identique à la VM)
            pnpm_10 # gestionnaire de paquets
            ffmpeg-headless # conversion audio (wav -> ogg/opus, mp3), vidéos de capture
            sox # génération/traitement audio procédural
            imagemagick # planches de captures, conversions d'images
            jq
          ];
        in
        {
          default = pkgs.mkShell {
            packages = common;
            shellHook = ''
              export PATH="$PWD/node_modules/.bin:$PATH"
              # Captures Playwright : Chrome système si présent, sinon `nix develop .#full` (chromium)
              if [ -z "''${CHROME_PATH:-}" ] && command -v google-chrome >/dev/null 2>&1; then
                export CHROME_PATH="$(command -v google-chrome)"
              fi
              export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
            '';
          };

          # Variante lourde : navigateur + TTS local pour pré-générer les voix du narrateur
          full = pkgs.mkShell {
            packages = common ++ (with pkgs; [ chromium piper-tts espeak-ng python3 ]);
            shellHook = ''
              export PATH="$PWD/node_modules/.bin:$PATH"
              export CHROME_PATH="''${CHROME_PATH:-${pkgs.chromium}/bin/chromium}"
              export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
            '';
          };
        });

      formatter = forAllSystems (pkgs: pkgs.nixfmt-rfc-style);
    };
}
```

Note : la version `nixpkgs#piper-tts` du registre système (flakehub weekly) est 1.8.0 alors que 26.05 fournit 1.4.2 ; si l'agent audio a besoin d'une version précise de piper, il utilise son venv (déjà présent : `venv-piper/`), pas le flake.

## 5. Magic Deploy — recette validée

### 5.1 Structure soumise (`dir`) ✅
```
deploy/
├── configuration.nix
├── server.mjs          # bundle esbuild du serveur (ws inclus), 130 Ko
└── public/             # = sortie de `vite build` (dist/)
    ├── index.html
    └── assets/…
```
Appel : `deploy({ name: "ombres", dir: "<abs>/deploy", port: 80, ttl: "none" })` puis `get_machine({ id, wait_for: "running", timeout_seconds: 180 })`. Build + boot observés : **< 45 s** (1er deploy), ~31 s (redeploy).

`files_from` fonctionne aussi avec des chemins imbriqués ✅ (`{"server.mjs": "/abs/…", "public/index.html": "/abs/…"}`) mais `dir` est plus simple pour un `dist/` à nombreux fichiers.

### 5.2 Bundle serveur ✅
```bash
esbuild server/index.ts --bundle --platform=node --format=esm --target=node22 \
  --outfile=deploy/server.mjs \
  --banner:js="import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"
```
(le banner évite `Dynamic require of "events" is not supported` quand du CJS comme `ws` est bundlé en ESM). `bufferutil`/`utf-8-validate` (optionnels de ws) ne sont pas nécessaires.

### 5.3 `configuration.nix` complet (déployé et testé)
```nix
{ pkgs, ... }:
let
  # Tout ce qui est soumis (dir) atterrit à côté de ce fichier : on le copie dans le store.
  app = pkgs.runCommand "ombres-app" { } ''
    mkdir -p $out
    cp ${./server.mjs} $out/server.mjs
    cp -r ${./public} $out/public
  '';
in
{
  systemd.services.ombres = {
    description = "Ombres game server (static + WebSocket)";
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    environment = {
      NODE_ENV = "production";
      HOST = "0.0.0.0";
      PORT = "80";
      STATIC_DIR = "${app}/public";
    };
    serviceConfig = {
      ExecStart = "${pkgs.nodejs_22}/bin/node --max-old-space-size=256 ${app}/server.mjs";
      Restart = "always";
      RestartSec = 1;
      DynamicUser = true;
      AmbientCapabilities = [ "CAP_NET_BIND_SERVICE" ];
      CapabilityBoundingSet = [ "CAP_NET_BIND_SERVICE" ];
      NoNewPrivileges = true;
      LimitNOFILE = 65536;
    };
  };
}
```
Le serveur de test (`app-test/server/server.ts`) : `http.createServer` statique (cache `immutable` sur `/assets/*`, `no-cache` sur le HTML), `/health` JSON (mémoire, connexions), `WebSocketServer({ noServer: true })` routé sur `upgrade` par chemin (`/ws` sans compression, `/wsz` avec).

### 5.4 Observations sur l'infra ✅
- Hôte : backend **container**, NixOS 26.05 (Yarara), Node 22.23.2, `nproc` = 2 (pour `vcpus: 1`), boot userspace 2,1 s.
- Proxy frontal : **nginx**, HTTP/2, TLS valide (handshake 82 ms depuis ici), IPv6 (Hetzner `2a01:4f8:…`). Le proxy **compresse en gzip** les réponses (three.module 737 Ko → 188 Ko transférés) : inutile de pré-compresser ; pas de brotli/zstd.
- En-têtes reçus par l'app : `x-real-ip` = vraie IP client, `x-forwarded-for: 127.0.0.1`, **`x-forwarded-proto: http`** (faux : le client est en https). Ne jamais construire l'URL du QR code côté serveur à partir de ces en-têtes : utiliser `location.origin` côté PC.
- `exec` (shell root dans la machine) et `get_logs source=machine unit=ombres.service` (journald) fonctionnent. `/run/magic-secrets` n'existe que si des secrets sont déclarés.
- `ttl` : l'expiration est remise à `now + ttl` à chaque redeploy ; pour la version finale `ttl: "none"`.

### 5.5 Mémoire ✅
| État | Node RSS | cgroup service | cgroup conteneur |
|---|---|---|---|
| Démarrage | 62–67 Mo | ~36 Mo | ~108 Mo |
| 13 clients à 60 Hz | 72 Mo | | |
| 200 connexions ouvertes | 72,6 Mo | | |
| Après échos de messages de 60 Mo | 211 Mo (buffers non rendus) | 167 Mo | |

→ `mem_mb` 512 (défaut) suffit largement ; garder `--max-old-space-size=256`.

## 6. Mesures WebSocket à travers le proxy ✅

Client : Node + ws depuis cette machine (ping ICMP vers l'hôte : 18,7 ms moyen). Serveur : echo.

| Test | Résultat |
|---|---|
| Ouverture wss (TLS + upgrade) | 70–107 ms |
| RTT echo applicatif, 100 msgs JSON séquentiels | moyenne **19,1 ms** (p50 18,9, p95 24,1, max 27) ; 2e run : **17,7 ms** (p95 20,0) |
| RTT ping/pong protocolaire, 100 | moyenne 18,7 / 17,6 ms |
| Rafale 60 Hz × 3 s (un flux d'input) | p50 17,3–19,0 ms, p95 20–36 ms, p99 24–156 ms (un pic ; le réseau local/la machine chargée), **0 perte** |
| 13 clients × 60 Hz × 10–20 s (≈ 12 téléphones + PC) | p50 17,5–19,9 ms, p90 20–33 ms, p99 35–96 ms, 0 perte ; serveur **11 % d'un cœur** |
| 200 connexions simultanées | 200/200 ouvertes, RSS +5 Mo |
| Navigateur (Chrome headless, émulation Pixel 7) | wss OK, médiane 19,4 ms sur 50 échos |
| **Inactivité totale** | OK à 115, 200, 250, 290 s ; **coupée à 300,2 s (code 1006, sans close frame)** |
| Ping client toutes les 25 s | vivante à 330 s, echo OK |
| Ping serveur toutes les 25 s (`ws.ping()`) | vivante à 330 s ; les frames ping/pong traversent le proxy dans les deux sens |
| Taille max de message | 60 MiB binaire OK (limite = notre `maxPayload` 64 MiB) ; 1 Mo en ~110 ms |
| `permessage-deflate` | négocié de bout en bout via nginx ; JSON d'état 12 joueurs (~665 o) : 133 Ko → **36 Ko** sur le fil (÷3,7) ; coût +1–2 ms de RTT, CPU serveur ↑ |
| Redeploy | HTTP 502/503 et WS fermées (1006) pendant **~31 s**, reconnexion OK ensuite |

Chemin d'un input téléphone → PC : téléphone → proxy → serveur → PC ≈ 1 RTT (~18–20 ms sur fibre/Wi-Fi ici ; prévoir 40–80 ms en 4G) + gigue Wi-Fi.

## 7. Pièges rencontrés (et parades)

1. **Peer deps « plafonnées »** : `react <19.4` (R3F) et `three <0.187` (postprocessing). Versions exactes dans `package.json`, pas de `^` sur ces 4 paquets.
2. `<Canvas shadows>` → warning PCFSoft en r186 : utiliser `shadows="percentage"`/`"variance"`.
3. Tone mapping ACES implicite de R3F → `<Canvas flat>` pour les aplats.
4. Headless sans flags = SwiftShader ; `--enable-gpu` seul dépend de DISPLAY → `--use-angle=gl-egl`.
5. Mesures fps faussées par les autres agents (GPU à 100 %) et par plusieurs pages ouvertes.
6. PNG 1080p lent (1,7 s) avec du grain → JPEG pour les séquences.
7. Proxy : **idle timeout 300 s** → ping WS serveur toutes les 25 s ; `x-forwarded-proto` faux.
8. Redeploy = 31 s d'arrêt → le client (PC comme téléphone) doit se reconnecter seul avec backoff, et la salle doit pouvoir être recréée par le PC (le serveur perd tout son état mémoire).
9. `pnpm` 10 bloque les postinstall : `onlyBuiltDependencies: ["esbuild"]`.
10. Shell : `pkill -f <motif>` tue aussi le shell qui contient le motif dans sa ligne de commande (exit 144) — utiliser un fichier PID ou `pgrep -f 'motif[x]'`. `cd X && cmd &` ne change pas le cwd du shell courant.
11. Ombres portées sans `shadow-bias`/`shadow-normalBias` : acné en stries sur les faces des tours (vu sur les captures de test) → régler `normalBias ≈ 0.02–0.05` ou utiliser nos propres ombres dans le shader du sable.
12. `x-forwarded-for` vaut `127.0.0.1` (double proxy) : utiliser `x-real-ip` si on a besoin de l'IP client (a priori inutile).

## Décisions proposées

1. **Versions** : épingler exactement la matrice §1 (react 19.3.0, three 0.186.1, R3F 9.8.1, drei 10.7.9, @react-three/postprocessing 3.1.2, postprocessing 6.39.5, zustand 5.0.15, vite 8.3.1, plugin-react 6.1.1, typescript 7.0.2, vitest 5.0.2, ws 8.21.3, tsx 4.23.15, esbuild 0.28.2, playwright-core 1.63.0, tone 15.1.22 si utilisé) ; `@types/node ^22`.
2. **Renderer** : `WebGLRenderer` (WebGL2) + `postprocessing` ; pas de WebGPU. `<Canvas flat shadows="percentage" dpr={[1, 2]} gl={{ antialias: false, powerPreference: 'high-performance' }}>` comme point de départ (AA géré dans la chaîne de post-process).
3. **Horloge** : simulation à pas fixe avec notre propre `THREE.Timer`/`performance.now()`, jamais `state.clock`.
4. **Captures** : `tools/shot.mjs` (§3.2) avec `--enable-gpu --ignore-gpu-blocklist --use-gl=angle --use-angle=gl-egl`, vérification obligatoire du renderer (échec si SwiftShader), JPEG q85 pour les séquences, multi-touch via CDP pour tester la manette.
5. **Mesure de perf** : le jeu expose en mode dev `window.__perf` (fps, temps CPU frame, temps GPU via `EXT_disjoint_timer_query_webgl2`) ; mesurer en `--no-vsync` et seulement si `gpu_busy_percent` ≈ 0.
6. **flake.nix** : celui du §4 (nixos-26.05, nodejs_22, pnpm_10, ffmpeg-headless, sox, imagemagick, jq ; shell `full` avec chromium/piper-tts).
7. **Déploiement** : `vite build` → `deploy/public/`, `esbuild` → `deploy/server.mjs`, `configuration.nix` du §5.3, `deploy({ dir, port: 80, ttl: "none" })` ; mises à jour par `redeploy` (même URL). Un seul process Node sert le statique **et** le WebSocket (pas de nginx dans la VM).
8. **Réseau** : un seul chemin WS (`/ws`), **`perMessageDeflate: false`** (messages < 1 Ko, la latence prime), JSON compact suffit aux débits mesurés (13 × 60 Hz = 11 % CPU) ; inputs téléphone envoyés à 30–60 Hz, uniquement sur changement + heartbeat.
9. **Keepalive** : le serveur envoie `ws.ping()` toutes les **25 s** à chaque client et coupe ceux sans `pong` après 2 intervalles ; côté client, un message applicatif `hb` toutes les 10 s pour détecter vite une coupure (Wi-Fi téléphone, onglet en veille) et déclencher la reconnexion.
10. **Reconnexion** : backoff 0,5 → 1 → 2 → 4 s (plafond 4 s), sans limite de tentatives, jeton de session stocké dans `localStorage` (téléphone et PC) ; le PC autoritaire garde l'état de partie et **recrée la salle avec le même code** si le serveur a redémarré (redeploy = 31 s).
11. **URL du QR** : construite côté PC depuis `location.origin` + `/j/<CODE>` (ne pas se fier à `x-forwarded-proto`). Lib : `qrcode` (déjà en dépendance) ou `uqr` (plus léger) — équivalents.
12. **Bundles** : l'entrée téléphone ne doit pas importer three/R3F (code splitting par page Vite : `index.html` PC, `play.html` téléphone).
