# Correcteur phone — polish vague 1

Périmètre : `src/phone/**`, `src/net/**`, `src/shared/messages.ts`, `src/shared/strings/phone.ts` (+ page de dev `src/dev/phone/**`, outillage `tools/polish/phone/**`). Port 8835. Captures : `shots/polish/fix-phone/`.

Outils ajoutés (`tools/polish/phone/`) :
- `gallery.mjs` : galerie mesurée (getBoundingClientRect) sur iPhone 15 Pro, Pixel 7, iPhone SE paysage (568 × 320), 667 × 340 et iPhone 15 Pro portrait, FR et EN. Mesure les recouvrements du salon au repos **et en pilotage** (pouce posé en CDP qui glisse vers la carte), la boîte de l'étoile, l'écart de chaque rayon et du tampon à l'anneau de COUP D'AILE, les éléments hors écran et les textes coupés. `--tag=before|after`.
- `phonegallery.mjs` : copie de `firsttime/phonegallery.mjs` (même contrôle de débordement) avec 667 × 340 en plus et sortie dans `shots/polish/fix-phone/phonegallery/` (pour ne pas écraser les preuves du critique).
- `one.mjs` : un scénario, avec `--burst` (rafale), `--seek` (animations CSS figées à t ms), `--clock` (horloge JS figée), `--for=<sélecteur>`, `--tap` (activation utilisateur), journal de `navigator.vibrate` intercepté.
- `frames.mjs` : cadence rAF pendant un écran.

Page de dev (`/dev/phone.html`) : scénarios `play-hit` (cible + « TOUCHÉ ! »), `play-toast`, `lobby-toast` (indication + tampon « Raté… » au salon) ; paramètre `rf=1` = « Réduire les flashs » du PC.

## Bilan final (après)

`gallery.mjs --tag=after --lang=both` : 138 captures mesurées, **0 problème** (aucun élément hors écran, aucun texte coupé, aucun recouvrement listé ci-dessous) — `shots/polish/fix-phone/after/_report.json`, journal `shots/polish/fix-phone/after-gallery.log`. `phonegallery.mjs` : aucune ligne « DÉBORDE » ni « TEXTE COUPÉ » (FR + EN, 6 formats ; une capture en timeout GPU, refaite à la main : `one-settings-se.jpg`). `npx tsx tools/phone-e2e.mjs` : **64/64**. Vraie partie à 2 téléphones + clavier (`PORT=8835 node tools/e2e/phones.mjs`, 3 manches, revanche) : tout est vert, aucune erreur console (captures `shots/runner/phones/`). Fumée `tools/e2e/solo.mjs` : partie complète + revanche, aucune erreur console. `npx vitest run src/net src/phone` : 34 tests verts. Typecheck propre sur mes chemins, `check:boundaries` OK. (`phones.mjs --rounds=2` n'est plus honoré par le runner — la partie reste en 3 manches : hors périmètre.)

## P1 · Salon : carte des règles — FAIT

- **Cause réelle en plus de celle notée** : `--dive` / `--flap` n'étaient définies que sur `.ctl` ; `.lobby-goals` (dans `.ctl-overlay`, sœur de `.ctl`) calculait sa réserve de droite avec une variable indéfinie → `right: auto` → la case des objectifs passait sous COUP D'AILE (visible à 320 px de haut).
- Géométrie des commandes posée sur `.app` (`App.tsx` : `--stick-r`, `--dive-frac`, `--flap-frac` depuis `PHONE_RULES` ; `phone.css` : `--dive`, `--flap`, `--flap-reserve`). Le salon est une colonne flex : objectifs (bornés à gauche de l'anneau de COUP D'AILE), puis la carte dans la **colonne centrale** bornée par le socle au repos (`--col-l`) et l'anneau de COUP D'AILE (`--col-r`), dimensionnée par la hauteur disponible (unités de conteneur), puis le message d'attente.
- Fondu de 150 ms tant qu'un pouce est posé (joystick ou bouton) : `.app:has(.stick:not(.is-idle), .act.is-down) .lobby-rules { opacity: 0 }`.
- « C'est Maëlle qui lance la partie » : dans le bandeau en paysage (à la place du bouton « Lancer » du meneur), sous la carte en portrait. Portrait : carte en bandeau horizontal sous les objectifs (image à gauche, texte à droite).
- Messages (indications du directeur) : posés **sur le bandeau**, au-dessus de tout (z 16), entrée et sortie par essuyage d'encre (clip-path), plus de fondu d'opacité → plus de fantôme ; la bande à la couleur du joueur passe à l'intérieur du cadre d'encre (sur le bandeau de même couleur, la bordure colorée disparaissait). Tampons (« Raté… », « Touché ! ») : opaques, au-dessus de tout, sortie par essuyage. Captures : `p1/lobby-toast-*.jpg`, `p1/lobby-stamp-*.jpg`, `p1/play-toast-659x393.jpg`.
- **Vérifié** : au repos, 0 px² entre `.lobby-rules` et `.act--dive`, `.act--flap`, l'anneau, le socle et les objectifs sur les 5 formats FR/EN ; en pilotage le socle passe sur l'emplacement de la carte (15 000 à 19 000 px²) mais la carte est à opacité 0 (recouvrement **visible** : 0) et revient à 1 au lever du pouce. Avant : 961 px² carte/anneau (iPhone), 597 px² carte/socle au repos et 1 655 px² objectifs/anneau (SE), 13 000 à 18 600 px² visibles en pilotage. Captures : `after/*-lobby*.jpg`, `after/*-lobby-thumb.jpg`, `p1/lobby-stamp-*.jpg` ; avant : `before/`.

## P2 · PIQUER : l'étoile reste dans l'écran — FAIT

- Étoile : boîte à −6 % (112 % du bouton), rayons de 38 à 47 % du **diamètre** du bouton (entièrement dans le disque), tournés de 22,5° (aucun ne vise COUP D'AILE à 225°). La rotation continue (qui agrandissait la boîte de √2) est remplacée par un battement des rayons vers le centre (`star-beat`, échelle 0,92 → 1).
- « TOUCHÉ ! » et les autres tampons : en haut, au centre de la zone libre, sous le bandeau (`left: 44 %`), coup de tampon qui part d'en haut à gauche.
- **Vérifié** (`art/phones.mjs --name=../fix-phone/art-phones` et `gallery.mjs`) : boîte de l'étoile dans l'écran sur les 5 formats (iPhone 15 Pro : droite 641 / 659, bas 381 / 393 ; Pixel 7 : 821 / 839, 400 / 412 ; SE : 548 / 568, 306 / 320 ; avant : +31 px, +35 px, +20 px hors écran). Chaque rayon reste à ≥ 14 px de l'anneau de COUP D'AILE, le tampon à ≥ 8 px (mesuré pendant le coup de tampon). Note : l'intersection des **rectangles** `.act__star` / `.act--flap` n'est pas nulle (835 px² sur iPhone), mais celle des rectangles des deux boutons ronds eux-mêmes ne l'est pas non plus (540 px²) : c'est la disposition en diagonale des disques ; la mesure géométrique (rayons contre anneau) est la bonne. Captures : `after/*-play-target.jpg`, `p2/sheet-stamps.jpg`, `one-play-target.jpg`.

## P3 · Petits écrans paysage — FAIT

- `@media (orientation: landscape) and (max-height: 360px)` : bandeau 50 px, boutons d'interface 46-48 px, cases des objectifs et textes resserrés, tampons 28 px. Les disques PLONGER / COUP D'AILE gardent leurs fractions RULES (`buttonDiveHeightFrac`, `buttonFlapHeightFrac`) : ce sont des chiffres de gameplay, pas de la mise en page.
- « Pouce ici » posé à cheval sur le bas du socle ; au salon le socle se place à 60 % de la hauteur avec une réserve pour l'étiquette (`HINT_BELOW`, Controller.tsx).
- Cartes avant la manche : le pied (« Compris ») ne cède jamais, la grille des cartes cède et défile au besoin (`flex: 0 1 auto; overflow-y: auto`). **Écart à l'ordre** : en paysage court, les 3 cartes restent sur une ligne au lieu d'une colonne qui défile — mesuré, elles tiennent sans défiler à 568 × 320 et 667 × 340 (« Compris » : bas à 308 px pour 320, 328 pour 340), ce qui vaut mieux que cacher deux règles sur trois ; la colonne unique reste en portrait.
- Profil : les 12 pastilles débordaient de 35 px à droite sur SE (et touchaient le bord sur iPhone 15 Pro) : colonnes 0,9 / 1,1, pastilles ≥ 40 px, marges du panneau.
- **Vérifié** : 0 élément hors écran, 0 texte coupé à 568 × 320 et 667 × 340 (FR + EN, tous les écrans). Captures : `after/fr-SE-568x320-*.jpg`, `after/*-667x340-*.jpg`, `one-profile-568x320.jpg`.

## P4 · « Réduire les flashs » sur les téléphones — FAIT

- `PhoneView.reduceFlashes?: boolean` (`messages.ts`, optionnel : compatible avec un PC plus ancien, pas de changement de `PROTOCOL_VERSION`). Classe `.reduce-flash` sur `.app` (`App.tsx`) : plus d'éclair blanc du clac, plus de flash de bordure ni d'inversion du bandeau (remplaçants de vibration sur iOS), bordure rouge de prise d'élan **tenue et fondue** (900 ms, sans pulsation), anneau « urgent » de COUP D'AILE fixe au lieu de clignoter, gloire de fin de partie immobile.
- Edits ciblés hors périmètre (autorisés §10) : `src/host/runner/views.ts` : `reduceFlashes: getSettings().reduceFlashes` dans la vue de base (import de `getSettings`) ; `src/host/settings.ts` : défaut `matchMedia('(prefers-reduced-motion: reduce)').matches` (garde `typeof matchMedia`).
- **Limite** : le runner ne repousse les vues qu'au prochain `markViews()` ; un changement du réglage seul arrive au téléphone au prochain changement d'écran / pause / objectif. Demande faite à game dans `REQUESTS.md` (une ligne dans `bindSettings`).
- **Vérifié** : `npx vitest run src/net` vert, avec une assertion ajoutée (`session.integration.test.ts` : la vue qui ne diffère que par `reduceFlashes` est renvoyée et arrive au téléphone). Captures pendant une prise d'élan puis le clac, sans / avec : `p4/sheet-hunted.jpg` (haut : bordure rouge pulsée puis écran blanchi ; bas : bordure tenue qui s'éteint, pas d'éclair).

## P5 · Typographie et textes — FAIT

- Averia seulement pour les nombres : `NumText` / `splitNumbers` (format.tsx) pour la valeur du titre (« **4** piqués réussis », « **62.4%** of the final territory… » en vraie partie) ; votes « **1** sur **3** » et mention de fin de manche (« Photo finish: **0.2%** apart ») via `useTn` ; ordinaux du podium en chiffre + exposant.
- « 0 soleil » : `pluralOne` (FR : 0 et 1 au singulier).
- Rang et « sur N » regroupés (« 3e / sur 5 », « 18,7 % / du désert ») sur la même ligne de pied.
- Profil en portrait : nom, **couleurs**, aide au vol, puis indication et « Prendre mon envol » (grid-template-areas).
- `RulesCards.tsx` : une phrase par ligne (`sentenceLines`, copie locale de la règle de la TV — `src/phone` ne peut pas importer `src/host`) ; illustrations à la couleur du joueur (lavis fort KF16 / pâle KF80 de la bible §3.3) face à un rival contrasté (Lagon, ou Corail pour les teintes froides). Le dessin de l'oiseau n'a pas été touché (remplacé par hostui H8 pendant la session ; nos deux édits cohabitent).
- `phone.ts` : glossaire EN (§9) — « Strike from above », « Strikes landed », « Missed strikes », « Easier strikes », « Striking! », « strike the dummy from above » ; DIVE reste le bouton tenu. FR : « C'est {name} qui lance la partie », « puis pique sur le mannequin ». Demandes de hostui traitées : noms EN sans accent (« Alizé », « Sandy » → « Simoom », « Mesa ») et `font-variant-ligatures: no-common-ligatures` (Patrick Hand SC dessinait « ll », « ff » en bas de casse : « SAlle » → « SALLE »).
- **Vérifié** : `src/phone/format.test.ts` (3 tests) ; captures FR/EN : `after/*-matchEnd*.jpg`, `after/*-roundEnd*.jpg`, `one-profile-portrait.jpg`, `after/*-intro.jpg` (cartes en Safran, coupées par phrase).

## P6 · Voiles papier — FAIT

- `.overlay--dim` (pause, reconnexion, PC hors ligne) : voile papier `#F7F0E3` à 55 % au lieu de l'encre à 45 %. Même voile pour la feuille des réglages (même défaut kaki).
- **Vérifié** : `p6/sheet-veils.jpg` (haut : avant, kaki ; bas : après), `p6/after-settings.jpg`.

## P7 · (wow) Le téléphone du vainqueur — FAIT

- `src/phone/ui/Celebrate.tsx` : `WinnerFlood` — le lavis du joueur part de son rang et couvre tout l'écran en 1,5 s (tache au bord bruité qui s'agrandit, front mouillé = liseré de pigment + bande sombre translucide, trait constant grâce à `vector-effect: non-scaling-stroke`), sous les cases ; `InkGlory` — disque soleil et 28 rayons d'encre derrière « 1er », qui tournent (24 s/tour, rotation composée par le GPU ; immobile avec « Réduire les flashs ») ; roulement de tambour `DRUM_ROLL` (coups qui se resserrent pendant l'inondation, frappe finale ≈ 1,5 s) par `navigator.vibrate`, sans flash de remplacement, réglage Vibrations respecté.
- Les autres : leur rang, leurs soleils puis la valeur de leur titre s'écrivent à la plume l'un après l'autre (`.ink-write` : révélation gauche → droite par `@property --ink-p`, bec d'encre au bord). L'écran de fin de partie ne porte pas de pourcentage : ce sont ces trois chiffres qui s'écrivent.
- **Vérifié** : rafales à temps figé (`--seek`) `p7/sheet-p7.jpg` (vainqueur Azur à 0,5 / 0,8 / 1,1 / 1,4 / 1,8 s ; perdant à 0,3 / 0,7 / 1,4 / 2,4 s), `p7/winner3-02400.jpg` (Safran) ; vibrations journalisées : un seul appel `[18,110,18,90,…,34,60,260]` pour le vainqueur, aucun pour le perdant.
- Performance : mesures `frames.mjs` non concluantes (GPU partagé à 95-99 %). Le lavis repeint une surface SVG plein écran pendant 1,5 s une fois par partie ; la gloire tourne par une transformation composée.

## Non fait / reste

- Rien de non fait dans les ordres P1-P7. Écart documenté : P3 garde les 3 cartes en ligne en paysage court (elles tiennent).
- Le 404 relevé par `gallery.mjs` au chargement de la page de dev existait avant (hors périmètre).
