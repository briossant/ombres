# Lancement : aperçu de lien et accueil des téléphones

Agent **landing**. Deux livrables : l'aperçu de lien (Open Graph + carte X) et une page d'accueil légère pour les visiteurs qui ouvrent le lien sur un téléphone (`/m`).

## 1. Aperçu de lien

**Où** : `index.html` et `m.html` portent les mêmes balises (un test le vérifie). Textes en anglais.

| Balise | Valeur |
|---|---|
| `og:title` / `twitter:title` | Ombres |
| `og:description` (170 car.) | Your shadow paints the desert while the sun goes down. A party game for 1–12 players: the big screen runs the game, your phones are the controllers. Free, in the browser. |
| `twitter:description` (104 car.) | Your shadow paints the desert as the sun sets. 1–12 players, phones as controllers, free in the browser. |
| `og:url`, `canonical` | https://ombres.deploy.breizhware.com |
| `og:image`, `twitter:image` | https://ombres.deploy.breizhware.com/og.jpg (1200 × 630, 121 Ko, + `og:image:alt`, type, dimensions) |
| autres | `og:type` website, `og:site_name` Ombres, `og:locale` en_US + `og:locale:alternate` fr_FR, `twitter:card` summary_large_image, `theme-color` #f7f0e3 |

**L'image `public/og.jpg`** : une vraie manche à l'heure dorée (soleil à 27°, territoires peints, ombres des tours), HUD masqué, capturée en 1200 × 630 ; par-dessus, le logotype OMBRES dessiné comme dans le jeu (case de BD, lettres papier bordées d'encre, ombres portées plates, `src/host/ui/Logo.tsx` figé), l'accroche en récitatif et deux cartouches (« 1–12 players · phones are the controllers », « Free, in the browser »).

Pour la refaire :

```bash
PORT=8901 node --import ./tools/polish/staging/nohmr.mjs tools/launch/og-capture.mjs   # une image / s de l'heure dorée à la Grande Ombre → shots/landing/og-raw/
node tools/launch/og-compose.mjs shots/landing/og-raw/golden-26.8.jpg public/og.jpg --quality=86
node tools/launch/og-check.mjs http://localhost:8901      # ou sans argument : le site public
```

`tools/launch/og-check.mjs` télécharge le HTML servi (racine et `/m`) avec les User-Agent de X, Discord et Facebook, extrait les balises hors commentaires, vérifie les obligatoires, puis télécharge `og:image` (JPEG, dimensions lues dans le fichier, poids) et `og:video` s'il y en a une (type, Range). Résultat sur le build de production local : tout vert.

**Bande-annonce (`og:video`)** : `public/media/trailer-720.mp4` n'existait pas à la fin de ce travail. Un commentaire `TODO(bande-annonce)` dans `index.html` donne les cinq balises exactes à ajouter (et `m.html` y renvoie), avec la commande `ffprobe` pour vérifier les dimensions. Après ajout : relancer `og-check.mjs`, qui contrôle alors la vidéo servie.

Après le déploiement, valider aussi avec les outils des plateformes : Card Validator de X (ou un brouillon de post), Discord (coller le lien dans un salon privé), https://www.opengraph.xyz. Les robots mettent l'aperçu en cache : vérifier avant le premier post.

## 2. Accueil des téléphones (`/m`)

### Redirection

Script inline en tout début de `index.html`, avant le moindre chargement du jeu :

- téléphone = **pointeur grossier ET côté court de l'écran < 600 px** (`screen.width/height`, indépendant de l'orientation) → `location.replace('/m' + requête + ancre)` ;
- tablettes (iPad mini 744 px, tablettes Android ≥ 600 px) et PC (pointeur fin, même tactiles) gardent le jeu ;
- `?desktop=1` force le jeu et reste retenu pour l'onglet (`sessionStorage`, stockage indisponible toléré) ; `?debug…` n'est jamais redirigé (scripts de test) ;
- les robots d'aperçu n'exécutent pas de JavaScript : ils lisent les balises d'`index.html`.

La même règle vit dans `isPhone()` (`src/landing/logic.ts`) ; `src/landing/landing.test.ts` exécute le vrai script d'`index.html` dans un faux navigateur (téléphone, paysage, tablette, PC, `?desktop=1`, `?debug`, stockage qui lève).

Routes : `m.html` est une 3e entrée Vite (`vite.config.ts`, `rollupOptions.input.landing`) ; `server/index.ts` sert `/m` et `/m/` → `m.html` en production et réécrit `/m` en dev. Le serveur connaît aussi le type `video/mp4` (et `video/webm`) : sans lui la bande-annonce partirait en `application/octet-stream`.

### La page

`m.html` + `src/landing/{main.ts,logic.ts,landing.css}` + `src/shared/strings/landing.ts` (FR/EN, clés `landing.*`). La table n'est **pas** enregistrée dans `STRING_TABLES` : la page n'importe que ce fichier et un petit `t()` local, pas l'i18n complet du jeu. Aucun import de React, three.js ou du jeu (vérifié dans le build : `landing-*.js` + le petit chunk partagé `protocol-*.js`).

De haut en bas (portrait) : logotype OMBRES en SVG inline (même dessin que le jeu, `tools/launch/logo-svg.mjs`) et l'accroche en récitatif ; la bande-annonce ; une phrase d'intro et quatre cartouches (1 à 12 joueurs, trois manches / sept minutes, des bots si tu joues seul, gratuit sans pub) ; la case « Play it on a big screen » (« Open ombres.deploy.breizhware.com on a computer or a TV: your phone will be the controller. », boutons **Copy the link** et **Share**) ; la case « Got a room code? » (champ 4 lettres → `/play?r=CODE`) ; « A round in four panels », quatre captures légendées en bande de BD défilante ; pied de page en bande de désert (crédits courts, GitHub https://github.com/briossant/ombres, « Open the full game anyway » → `/?desktop=1`, bascule FR/EN). En paysage : deux colonnes (logo, accroche et faits à gauche, média à droite ; grand écran et code côte à côte).

Comportements :

- **Langue** : choix mémorisé (`localStorage`, `ombres.landing.lang`), sinon la première langue `fr*`/`en*` de `navigator.languages`, sinon anglais.
- **Bande-annonce** : le script demande `HEAD /media/trailer-720.mp4` ; si elle existe, il pose `src` et `poster` (`/media/trailer-poster.jpg`) et la lit **muette, en boucle, inline**. Bouton son (« Turn sound on », qui repart du début au premier son), bouton lecture/pause visible quand la lecture automatique est refusée (économie d'énergie iOS), avec « réduire les animations » ou `Save-Data`. Pause hors écran, reprise au retour.
- **Repli sans bande-annonce** (état actuel) ou si la vidéo échoue (erreur de décodage) : les quatre cases remontent à la place de la vidéo et deviennent un carrousel (une case à la fois, heure dorée d'abord, défilement toutes les 4,5 s tant que personne n'y touche, arrêt si « réduire les animations », pastilles cliquables). Aucun changement de code quand le fichier arrive : la page passe seule en mode vidéo.
- **Copier** : `navigator.clipboard`, repli `execCommand('copy')`, retour « Link copied » (bouton et zone `aria-live`). **Partager** : affiché seulement si `navigator.share` existe.
- **Code de salle** : même normalisation que la manette (majuscules, alphabet des salles sans I ni O, 4 lettres) ; bouton actif à 4 lettres valides. Le formulaire marche aussi sans JavaScript (`GET /play?r=…`).
- **Ouverte sur un PC** (lien `/m` partagé) : la case devient « You're on a big screen » avec **Start the game**.
- Style : papier, encre, cases à bord de 2-3 px et ombre décalée sans flou, rayon 3 px, fond soleil `#FFF2C3` pour l'appel principal, focus clavier encre + soleil, boutons qui s'enfoncent de 3 px. Julius Sans One (titres, logotype, code), Patrick Hand SC (texte) ; pas d'Averia (38 Ko) : les nombres sont peu nombreux et « sept minutes » est écrit en lettres (le 7 de Patrick Hand SC, ART_BIBLE §8.1). Safe areas (`viewport-fit=cover`, `env(safe-area-inset-*)`), boutons de 56-60 px de haut, contrôles vidéo de 44 px.

### Poids (build de production, octets transférés, iPhone 15 Pro)

| Ressource | Ko |
|---|---|
| `m.html` (gzip) | 3,4 |
| `landing-*.css` + `landing-*.js` + `protocol-*.js` | 3,2 + 4,8 + 1,0 |
| Julius Sans One + Patrick Hand SC (latin, préchargées) | 15,9 + 23,0 |
| 4 captures WebP 720 px | 22,7 + 13,9 + 22,5 + 20,4 |
| **Total, page entière vue** | **130,8** (10 requêtes) |

Avec la bande-annonce : + l'affiche et la vidéo ; les captures de la bande restent alors en chargement différé sous la ligne de flottaison.

## 3. Vérifications

- `PORT=8901 node tools/launch/landing-shots.mjs --out=shots/landing/prod` (sur le build de production) : **36/36**. iPhone 15 Pro, iPhone SE (3e gén.), Pixel 7, en portrait et en paysage : la racine redirige vers `/m`, ni three.js ni le jeu chargés, aucun défilement horizontal, aucune erreur ; code tapé « ab1o-cd » → « ABCD » → `/play?r=ABCD` ; le presse-papiers reçoit l'adresse ; français avec un navigateur `fr-FR` ; `?desktop=1` garde le jeu (et reste retenu) ; `/play?r=ABCD` sur téléphone : la manette, sans redirection ; iPad Mini et PC 1920 × 1080 : la racine garde le jeu (écran titre capturé) ; `/m` sur PC propose « Start the game » ; poids < 150 Ko.
- Mode bande-annonce testé avec une vidéo factice (`--trailer=…mp4`) : lecture muette automatique, son (repart à 0), sourdine, bouton lecture avec « réduire les animations ». Chrome headless : décodage matériel en échec (`PIPELINE_ERROR_DECODE`), d'où `--disable-accelerated-video-decode` dans le script ; la page, elle, retombe proprement sur le carrousel dans ce cas.
- Carrousel : avance seul toutes les 4,5 s ; immobile avec « réduire les animations ».
- `tools/e2e/phones.mjs` (deux téléphones émulés + clavier, partie complète, revanche) : vert. `pnpm test` : 372/372 (dont 10 nouveaux dans `src/landing/landing.test.ts`). `tsc` et `check:boundaries` : OK.
- Captures gardées : `shots/landing/prod/` (toutes les vues), `shots/landing/run-trailer/`, `shots/landing/hero-sound.jpg`, `shots/landing/og-raw/golden-26.8.jpg` (source de `og.jpg`).

## 4. Déploiement

- **Le serveur a changé** (`/m`, types vidéo) : après `pnpm deploy:prepare`, **redéployer la VM** (magic-deploy `redeploy`) en plus du téléversement du site. Sans cela, un téléphone serait redirigé vers `/m` et recevrait un 404. Ordre conseillé : redeploy du serveur, puis `node tools/deploy-upload.mjs …`.
- Puis : `node tools/launch/og-check.mjs` (site public) et un passage sur un vrai téléphone (redirection, copie, partage, lecture de la vidéo sur iOS).
- Quand la bande-annonce est publiée : décommenter les balises `og:video` (index.html et m.html), refaire `og-check.mjs`.

## 5. Limites

- Détection par taille d'écran : un grand téléphone pliable ouvert (côté court ≥ 600 px) reçoit le jeu, comme une tablette. C'est voulu.
- Pas vérifié sur de vrais appareils (émulation Playwright seulement) : lecture automatique iOS, `navigator.share`, presse-papiers Safari.
- Les captures du carrousel viennent de `docs/screenshots/` (HUD en français sur l'une, en anglais sur l'autre).
