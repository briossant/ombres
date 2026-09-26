# Polish vague 1 — correcteur hostui (H1 à H15)

Périmètre : `src/host/ui/**`, `src/shared/strings/host.ts`, `src/shared/strings/titles.ts` (+ `src/shared/ruleBird.ts` créé, édit ciblé de `src/phone/ui/RulesCards.tsx`).
Captures : `shots/polish/fix-hostui/` (et `shots/polish/firsttime/fix-hostui-group*/`, `shots/polish/art/fix-hostui-twelve/` pour les scénarios existants relancés sous un autre nom).
Scripts de vérification (hors dépôt, dans le scratchpad de la session) : pages Playwright qui ignorent le HMR de Vite (`--import nohmr.mjs`), sinon les modifications des six autres correcteurs rechargeaient la page en pleine partie.

API changée : voir `docs/agent-notes/ui.md`, section « Polish vague 1 ».

## Tableau

| Ordre | Statut | Preuve |
|---|---|---|
| H1 bulles et étiquettes | fait | `firsttime/group.mjs` 3 manches (3 460 relevés) : **0 chevauchement de toute nature** (avant : 30 bulle/bulle, 552 étiquette/étiquette, 58 sur bannière, 107+18 sur la bande, 37 sur le cadran). 11 doublons « Ombre de tour… » (clavier et téléphone : mêmes mots, paramètres de touches différents) → signature = texte affiché ; relance 1 manche (1 134 relevés) : 0 chevauchement, 0 doublon. 12 téléphones pilotés : 2 bulles au plus, « Trop pâle… » fusionnée pour 8 joueurs, 0 chevauchement (`h1-12phones-03-t7.jpg`). Bulle sous l'oiseau quand la bannière est au-dessus (`fix-hostui-group/056-r1-afternoon.jpg`). Tests : fusion, plafond, retrait de l'esquive sur diveCancel/diveMiss. |
| H2 salon | fait | `fix-hostui-group/033-lobby-flying.jpg` : chaque oiseau porte son nom, anneau-cible pointillé + « Mannequin » ; étiquette qui pulse (anneau soleil) tant que « Vole » n'est pas coché (`lobby-b.jpg`). Le joueur clavier coche désormais « Pique ». |
| H3 9-12 oiseaux | fait | `art/fix-hostui-twelve/010-afternoon-t36.jpg` : jetons 18 px permanents sous les 2 humains, « 4,5 % » et « 3,9 % » sous la bande. 12 humains : deux rangées d'étiquettes dans la largeur de la bande (`h1-12phones-03-t7.jpg`). COUP D'AILE dans les 5 s après l'envol : `pulseTag` (événement `flap`). |
| H4 URL longue | fait | URL de déploiement injectée : boîte 376 × 62 identique à l'URL courte, `scrollWidth = clientWidth`, adresse sur une ligne à 15,1 px, case de même hauteur (585 px), « Les règles » ne bouge pas (FR/EN, 1080p/720p : `h4-url-*.jpg`) ; journal de group.mjs : aucun débordement. |
| H5 bannières | fait | `h5-at98.5-greatShadow.jpg` bandeau fin sous la bande, 2,5 s ; `h5-at101` : plus de bannière ; `h5-at55.5-golden.jpg` : « Heure dorée » écrit une fois (onglet du cadran masqué pendant une bannière). |
| H6 podium | fait | 4 et 12 joueurs, 1080p et 4K (`h6-podium-*`) : `clipped: []`, récitatif ni sur les cartes ni sur les plaques (`--titles-h` mesurée), plan pur à 1 s (`h6-podium-4p-1000ms`, `fix-hostui-group/198-podium-0.jpg`), UI à 2,5 s ; « SAFRAN / PIE » sur deux lignes, « remporte la partie » insécable, ligne « Départagés au désert cumulé : 94 % contre 71 % » ; bots « Lagon · Faucon » partout, sur deux lignes dans les cartes serrées. Plaques non déplacées. |
| H7 règles et glossaire | fait (écart) | Cartes FR/EN (`rules-*.jpg`), résultats de manche : « 1 soleil par oiseau devancé, +1 au vainqueur » (×2 en manche double) et calcul animé sur la ligne du meilleur humain en manche 1 (`h7-r1-results-5600-*`). Flèches ↕ (heure dorée) et → (Grande Ombre) dans la bannière. Glossaire : `grep -niE "\bdive(s|d)?\b" host.ts titles.ts` → seuls le bouton et l'objectif du salon ; phone.ts et hints.ts conformes ; `narrator.doubleHit` EN signalé à audio (REQUESTS.md). **Écart** : « À la nuit, on compte. » passe sur la carte 1 (« Ton ombre peint le sable. À la nuit, on compte. ») pour que la condition de victoire reste dans les règles ; la carte 3 est exactement celle de l'ordre. |
| H8 pictogramme | fait | `src/shared/ruleBird.ts` (ptérosaure vu de dessus, ailes en M tendu, cou et bec, queue en éventail, bande d'aile), utilisé par `RuleArt.tsx` et, par édit ciblé, par `src/phone/ui/RulesCards.tsx` (seule la fonction `Bird` et l'import). `rules-fr.jpg` (PC) et `fix-hostui-group/040-A-intro.jpg` (iPhone) : même oiseau. |
| H9 clavier | fait | Salon : carte de touches par groupe avec objectif suivant et « Échap quitter » (`lobby-kb2-fr.jpg`, `033-lobby-flying.jpg`). Réglages : ligne « ou ← ↑ ↓ → (joueur seul) », Pause et Plein écran sur leurs lignes, touches en cartouche « Alt droit » / « Point-virgule » (`settings-en.jpg`). Titre : cartouche sous le pitch (`h9-title-toast.jpg`, 0 chevauchement mesuré avec le logo). |
| H10 QR du titre | fait | `h10-title.jpg` ; QR décodé par zbarimg : `http://192.168.1.16:8834/play?r=PVAE` ; ce lien ouvre le profil du téléphone (`h10-phone-profile.jpg`), le PC passe au salon. |
| H11 sons des résultats | fait | Journal (setNavSound intercepté) : 3 manches, `count` ×90 (≈ 11 Hz pendant 3 s), `sun` ×24 (valeur = rang) ; 12 joueurs : `sun` ×89. |
| H12 voiles et fondus | fait | Voile papier 55 % (`rules-fr.jpg`, `pause-fr.jpg`), pied de titre en case papier opaque, « Appuie sur une touche » respire de ± 3 px, carte des règles essuyée à l'encre par-dessus la précédente (`lobby-carousel-wipe-*.jpg`), panneau des résultats sorti en 110 ms (`fix-hostui-group/155-r3-countdown.jpg` : « 3 » seul). |
| H13 textes et petits défauts | fait (sauf chargement en dev) | Salon « Azur · Faucon » + description à la ligne ; résultats sans troncature ; « Repris aux autres (cumulé) », « pts d'avance », Bâtisseur aligné (« avant l'heure dorée »), « Change personality », « Dernière manche ×2 », pause « Le vent tombe. Le désert attend. », EN britannique (Licence) ; crédits : voix traduite en EN, « CC BY 4.0 » / « CC0 1.0 » uniformes, « Instruments échantillonnés » (une ligne par instrument) ; ligatures désactivées (« ﬁge »). Chargement : logotype dessiné en petit, dessins sans animation d'entrée. `rawKeys` = 0 (FR). Réserve : en dev, les 2,4 premières secondes restent blanches (chargement des modules Vite, avant React) ; non mesuré sur un build de production. |
| H14 planche imprimée | fait | `h7-r1-results-5600-en-1080.jpg`, `fix-hostui-group/110-r1-results-2.jpg` : marge papier, cadre tremblé, filets et graduations, cartouche « Les Parasols — manche 1 », rose des vents, échelle « 50 m » (px/m calculés depuis `resultsMapRect` et l'ellipse de l'arène), tampon « vainqueur » à la couleur du gagnant. La planche s'arrête avant le panneau (corrigé après la 1re capture, vu en 4K : `h7-r1-results-5600-fr-2160.jpg`), tampon sur fond papier au coin. Non recapturé : le dernier correctif du tampon (glyphe du vainqueur masqué par un sélecteur CSS trop large, tampon ramené dans l'écran en 4K). |
| H15 logo vivant | fait | `h15-logo-sheet.jpg` : soleil de la démo à 69°, 27° et 13° → ombres courtes, moyennes, longues et violettes, petit soleil de la case qui descend. Mise à jour à 10 Hz. |

## Contrôles finaux

- `npx tsc --noEmit` filtré sur mes chemins : 0 erreur (seule erreur du dépôt : `tools/polish/feel/bot-pressure.ts`, hors périmètre).
- `npx vitest run src/host/ui` : 16 tests verts (dont fusion et plafond des bulles, retrait de l'esquive, bandeau de la Grande Ombre, licences et échantillons des crédits).
- `pnpm check:boundaries` : OK. `tools/e2e/solo.mjs` (partie complète + revanche) : aucune erreur console.
- Salon plein (12) avec deux joueurs clavier : la carte clavier se réduit à sa ligne de tête, les 12 lignes restent visibles (`lobby-12-fr.jpg`).
- Serveur de dev (port 8834) arrêté, port libre.

## Notes

- Aucune transition sur la position des bulles et étiquettes : une étiquette qui glisse chevauche celle qui prend sa place (18 chevauchements sur une manche rapide avant ce choix).
- Les étiquettes masquées sortent de la mise en page (`display: none`, fondu d'entrée par `@starting-style`) : la sonde ne compte plus des étiquettes invisibles.
- Le mannequin est déduit (oiseau actif hors roster au salon), sans toucher au runner.
- Demande audio A10 appliquée : `host.phaseHint.golden` = « Vole nord-sud, en travers de ton ombre : elle balaie large. » (avec la flèche ↕).
- Demandes ouvertes (REQUESTS.md) : `narrator.doubleHit` EN (audio), `localButtonLabels` → `keyLabel('AltRight')` (game), ligatures du téléphone et noms EN accentués (phone).
