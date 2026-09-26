# Regard final : directeur artistique et joueur débutant (après le polish)

Date : 2026-09-26. Serveur de dev sur le port 8843 (arrêté à la fin). Toutes les pages Playwright
tournaient avec `tools/polish/staging/nohmr.mjs`, pour que les modifications d'autres agents ne les
rechargent pas. Pendant la session, le GPU était partagé avec un autre vérificateur (Chrome à 99 %
d'occupation) : aucune conclusion de performance n'est tirée des cadences d'image des parties.

## 1. Ce que j'ai joué et regardé

| Scénario | Contenu | Captures |
|---|---|---|
| Groupe FR (qualité Auto, soit Medium au premier lancement) | chargement (5 images), séquence du titre (24 images sur 36 s), menu, réglages, crédits, salon vide / 1 / 2 téléphones / en vol, profils et salons iPhone 15 Pro + Pixel 7, cartes PC et téléphones, 3 manches à 21 instants fixes (−2, 0,2, 0,5, 1, 5, 12, 20, 30, 42, 55,6, 62, 70, 78, 86,5, 92, 98,6, 101, 104, 106,5, 108,3, 109,6 s), 9 rafales de 4 images sur touche ou esquive, nuit, résultats (0,3 à 5 s), téléphones aux résultats, podium (8 images), fins de partie des téléphones, revanche, pause PC et téléphone | `shots/polish/verify-eyes/group-fr/` (220 images, `_log.txt`) |
| Solo au clavier, EN, qualité High | titre, salon clavier, cartes EN, 3 manches à 12 instants, pause + réglages, résultats, podium EN | `shots/polish/verify-eyes/solo-en/` (65 images) |
| 12 oiseaux (2 claviers + 10 bots), High | salon à 12, une manche toutes les 7 s, daltonien, nuit, résultats | `shots/polish/art/verify-eyes-twelve/` |
| Podium rapide à 4 et 12 (après mon correctif) | plan pur à 0,9 s, panneau à 8 s | `shots/polish/verify-eyes/podium-{4,12}-1920/` |
| Téléphones mesurés (après mes correctifs de texte) | salon, invité, cartes, fin de manche, 5 formats, FR + EN | `shots/polish/fix-phone/verify-eyes/` |
| Plafond de résolution | `tools/polish/tech/dprcap.mjs --q=low` | sortie console (ci-dessous) |

Planches contact : `shots/polish/verify-eyes/sheets/` (`g-*` = groupe, `s-*` = solo, `twelve*`, `podium-fix*`, `phone-*`).
Console : aucune erreur ni avertissement sur le PC et les deux téléphones (groupe), ni en solo, ni à 12. `rawKeys` vide partout.

## 2. Corrections faites pendant la revue (Edits ciblés)

1. **Podium : un mât traversait chaque oiseau perché** (`src/host/camera/podium.ts`). Le décor du monde
   (`towerGeometry.ts`, étape 4) plante un mât à fanion sur 85 % des Piles. Au podium, ce mât passait
   juste derrière la tête de l'oiseau : il semblait empalé, et la couronne du vainqueur flottait au bout
   d'un bâton (`solo-en/061-podium-800.jpg`). J'ai choisi, hors ligne, trois graines de décor sans mât
   (`PODIUM_SEEDS = [0x5eed00, 0x5eed02, 0x5eed05]`), vérifiées pour des plateaux de 12 à 30 m. Le podium
   va de 14,8 à 24,3 m selon l'aspect et la densité. Résultat : `sheets/podium-fix.jpg` et
   `podium-fix-crop.jpg`, à 4 et à 12. Les têtes se lisent de profil et la couronne est posée sur la tête.
   Tests caméra : 74 verts.
2. **Cartes des règles du téléphone alignées sur celles du PC** (`src/shared/strings/phone.ts`, FR et EN).
   Le PC (H7) disait « Le fort recouvre le pâle. » et « Pique d'en haut : sa traînée devient la tienne. » ;
   le téléphone disait « Le fort gagne. » et « Pique d'en haut. À la nuit, on compte. », si bien que le même
   groupe lisait deux règles différentes. Les trois cartes du téléphone reprennent maintenant mot pour mot
   `host.rules.1-3`. Les illustrations du téléphone (traînée qui change de couleur) collent au nouveau texte.
3. **Statistique trompeuse sur le téléphone** : « Sable volé 42,9 % » à côté de « 14,6 % du désert ».
   Libellé remplacé par « Pris aux autres » / « Taken from others ». J'ai d'abord essayé « Repris aux
   autres » : sur 568 × 320, il passait sur deux lignes et coupait le titre de la carte. J'ai donc retenu
   la version courte. `sheets/phone-roundend-cmp.jpg` montre la même mise en page qu'avant.
   Vérification : `tools/polish/phone/gallery.mjs --lang=both` sur salon, invité, cartes et fin de manche,
   5 formats. Aucun recouvrement, aucun texte coupé ou hors écran, « Compris » dans l'écran (308/320).

Contrôles : `vitest` sur src/phone, src/host/camera, src/host/ui et src/shared : 96 tests verts.
`tsc --noEmit` : 0 erreur dans le dépôt. `check:boundaries` OK. Aucun autre fichier du jeu touché.
Scripts ajoutés : `tools/polish/verify-eyes/{group,solo,podium}.mjs`. Effets de bord : `dprcap.mjs` réécrit
ses captures dans `shots/polish/tech/`.

**Incident à signaler.** Pour arrêter mon serveur, j'ai lancé `pkill -f server/index.ts` vers 13 h 57. Cette
commande a aussi arrêté le serveur de dev d'un autre vérificateur, sur le port 8841. Son `perfmatrix` s'est
terminé (`exit=0`, mesures complètes), mais il a journalisé `ERR_CONNECTION_REFUSED` sur le WebSocket en
High/12. Rien n'écoute plus sur 8841 : ce vérificateur doit relancer `PORT=8841 pnpm dev` s'il continue. Je ne
l'ai pas relancé moi-même, pour ne pas laisser tourner un serveur orphelin.

## 3. Ordres de sévérité ≥ 3 : vérification à l'image

Légende : ✔ corrigé à l'image ; ◐ partiel ; ✘ non corrigé ; ○ non vérifiable à l'œil ou non rejoué par moi.

### Caméra (staging)

| Ordre | Verdict | Ce que montrent les images |
|---|---|---|
| S1 cadrage utile | ✔ | À 4 et à 12, aucun oiseau sous la bande de sable ni coupé par le cadre. Une exception : un repère hors-champ (Lagon) à 98,6 s en manche 3 (`group-fr/188`). Contrepartie visible : manche 2 presque entière en plan d'arène, oiseaux de 50 à 70 px (`group-fr/122`, `127`). |
| S2 Grande Ombre serrée | ◐ | Manche 1 : 98,6 à 104 s en plan large, oiseaux de 40 à 50 px, l'arène entière (`090`). Manche 3 : 98,6 s très bas et proche, mais pollué (voir S3). Les 6 dernières secondes se resserrent très bien (`091-093`, `193-195`). L'ouverture du climax reste le plan le plus faible de la manche. |
| S3 tours hors du cadre de jeu | ◐ | Manches 1 et 2 : conforme. Manche 3 (Le Cadran) : à 101 s, une Pile plein centre occupe environ 24 % de la largeur (`189`) ; à 98,6 s, deux disques géants dissous en trame couvrent environ 40 % du cadre, en voile moiré (`188`). |
| S4 cinématique du titre | ◐ | Groupe, 24 images : 3 ratées. `018` : tour derrière le pitch et disque au premier plan. `022` : disque d'environ 27 % de la largeur, tête de l'oiseau sous le logo, boucles blanches des bouts d'aile jusqu'au sol. `027` : fût sombre au centre. Solo : `004` (fût proche, environ 20 % à gauche). Environ 15 % d'images ratées, contre environ 40 % avant. Les plans du couchant sont superbes (`025`). |
| S5 podium | ✔ (+ mon correctif) | Oiseaux entiers au-dessus des plaques, poussée puis dérive, plan pur de 2,5 s. Seul défaut restant : les mâts, corrigés (§2). Colonnes mauves à contre-jour, pas crème : lisible, assumé. |
| S6 punch-in | ✔ | Esquive en plan serré (`062`), touches serrées (`162-164`, `174-177`). |

### Monde (world)

| Ordre | Verdict | Ce que montrent les images |
|---|---|---|
| W1 plafond de résolution | ✔ | `dprcap --q=low` : 1280 × 720 au titre, au salon, en manche, au podium (arrivée et panneau) et à la revanche. En manche : GPU p50 2,9 ms, p90 3,7 ms, 60 fps. |
| W2 qualité auto | ○ | Premier lancement observé en Medium (`benchLevel: medium`), comme prévu. La décision au climax n'a pas été vérifiée. |
| W3 budget High à 12 | ✘ probable | Pas mesuré par moi. Relevé `perfmatrix --q=high --n=12 --speed=1` d'un autre vérificateur, lancé à 13 h 56 (scratchpad `vr-perf1.txt`, GPU occupé à 62-85 % surtout par sa propre page) : p90 GPU de 11,4 ms à midi, 9,8 l'après-midi, 12,3 à l'heure dorée, 10,4 au couchant et 13,2 pendant la Grande Ombre (p50 11,1 ms, 14 % d'images au-delà de 20 ms). La cible de 9,5 ms n'est pas tenue ; le chiffre revient à son auteur. |
| W4 ombre sur la peinture | ✔ | Plus d'olive. Ombre sur Safran mesurée à `#A06A44` (rouille). Les peintures chaudes à l'ombre se lisent « brûlées » plutôt que refroidies (`solo-en/025`), avec de grosses masses brunes à l'heure dorée (`group-fr/127`). C'est conforme à l'ordre, discutable en direction artistique. |
| W5 bords d'ombre | ✔ | Recadrage × 3 (`sheets/crop-shadowedge.jpg`) : bords droits, sans marches. |
| W6 nuit | ✔ | Côté nuit nettement plus sombre et désaturé, lèvre corail nette, la vague d'ouest se lit (`group-fr/090`, `189`). |
| W7 hachures des tours | ✔ | Aucun quadrillage au titre ni au podium ; aplat et liseré à contre-jour. |
| W8 pâle contre sol | ✔ | Les pâles (Indigo, Lagon) se détachent du sable à midi et à l'heure dorée (`122`, `127`). |
| W9 dissolution en trame | ◐ | Efficace à mi-distance : oiseau visible à travers une Pile (`062`). Quand la caméra rase les tours, elle produit des disques fantômes moirés géants (`188`). |
| W10 rideau du Simoun | ✔ | Aplat opaque, festons nets (`093`, `195`). Il remplit toutefois 30 à 35 % du cadre dans la dernière seconde. |
| W11 tirets des empreintes | ✔ | Tirets réguliers le long du bord (`127`, ellipse jaune). |

### Oiseaux (birds)

| Ordre | Verdict | Ce que montrent les images |
|---|---|---|
| B1 couleur à 9-12 | ◐ | À 12, recadrage × 3 (`sheets/twelve-birds-x3.jpg`) : bande lisible sur certains oiseaux (vert, bleu), invisible sur d'autres, dont l'humain Lagon. À 1:1, on ne retrouve son oiseau que grâce au jeton de H3. |
| B2 traînées fantômes | ✔ | Aucune ligne droite aux comptes à rebours des manches 1 à 3 (`053`, `104`, `155`) ni aux résultats. |
| B3 podium | ✔ (après mon correctif) | Pose cormoran, tête de profil, couronne sur la tête, bandes lisibles, gloire contenue (`podium-fix-crop.jpg`). |
| B4 couronne en jeu | ✔ | Petite couronne or pâle à environ 20 px au-dessus du meneur (`sheets/crop-bird-golden.jpg`). |
| B5 couchant | ◐ | En plan serré, la bande reste colorée ; en plan d'arène au couchant, les oiseaux sont des silhouettes grises (`group-fr/136`). |
| B6 effets en gros plan | ✔ | Plus de « biscuits » ni de traînées de 700 px au titre. Restent des boucles blanches fines des bouts d'aile en très gros plan (`022`). |
| B7 esquive | ✔ | Étoiles au-dessus du chasseur et arc visibles à 4 (`062`). |

### Interface PC (hostui)

| Ordre | Verdict | Ce que montrent les images |
|---|---|---|
| H1 évitement | ✔ | Aucune bulle superposée ; étiquettes décalées avec trait de rappel (`043`) ; jamais plus de 2 bulles sur les images regardées à 12. |
| H2 salon | ✔ | Noms permanents, mannequin désigné par un anneau pointillé (`036`, `043`). |
| H3 humains à 12 | ✔ | Jeton-glyphe sous chaque humain, pourcentages des humains sous la bande (`twelve/015`). |
| H4 URL | ○ | L'URL de réseau local tient ; l'URL de déploiement n'a pas été réinjectée par moi. |
| H5 bannières | ✔ | « Heure dorée » une seule fois ; Grande Ombre en bandeau fin, absente à 101 s. |
| H6 podium UI | ✔ | Solo : plan pur à 0,8 s, UI qui entre à 2,4 s, titres entiers FR/EN. |
| H7 règles | ✔ (+ mon correctif téléphone) | Soleils expliqués (« 1 soleil par oiseau devancé, +1 au vainqueur », ×2 à la dernière) ; flèche ↕ sur l'heure dorée. |
| H8 pictogramme | ✔ | Même oiseau sur PC et téléphone. |
| H9 clavier | ✔ | Carte de touches au salon, Réglages alignés (« Alt droit », « Point-virgule »). |
| H10 QR au titre | ✔ | Case papier opaque dans le pied de page. |
| H11 sons des résultats | ○ | Inaudible dans des captures. |

### Téléphone (phone)

| Ordre | Verdict | Ce que montrent les images |
|---|---|---|
| P1 carte du salon | ✔ | Colonne centrale au repos, masquée pendant le pilotage (`039`, `041`) ; 0 recouvrement mesuré. |
| P2 étoile de PIQUER | ○ | État cible non capturé par moi. |
| P3 petits paysages | ✔ | 568 × 320 et 667 × 340 : tout le texte à l'écran, y compris après mes textes plus longs. |

### Jeu (game)

| Ordre | Verdict | Ce que montrent les images |
|---|---|---|
| G3 indications | ✔ | Aucune bulle pendant la Grande Ombre dans les 6 manches journalisées. |
| G8 toasts de connexion | ✔ | « Brieuc rejoint le désert » à la validation du profil, avec le nom choisi. |
| G10 titres (sév. 2) | ✔ | Le meilleur chasseur reçoit « Le Rapace », jamais « Kamikaze ». |
| G1, G2, G4, G5, G6, G7, G9, G11, G12 | ○ | Non rejoués par moi. G1 : en solo, mon pilote clavier ne sait pas jouer (0 soleil en 3 manches), donc aucune conclusion sur l'équilibre. |

### Son (audio)

A1 à A10 : ○. Cette revue est visuelle et je n'ai pas écouté le mixage.

## 4. Reste à faire (non corrigé ici : pas simple ou pas sûr)

1. **Ouverture de la Grande Ombre (S2 + S3 + W9), par ordre d'impact.** Le premier plan du climax est soit
   trop large (oiseaux de 40 à 50 px), soit trop bas au milieu des tours, avec des disques fantômes moirés
   sur 40 % du cadre (`188`) et une Pile centrale à 24 % (`189`). Pistes :
   - bloquer le tangage bas de S2 quand la couverture des tours (`towerCover.ts`) dépasse 15 % ;
   - dans `towerMaterial.ts`, dissoudre entièrement, au lieu de tramer à 50 %, les fragments de tours à moins d'environ 35 m de la caméra.
2. **Titre (S4)** : environ 1 image sur 7 reste ratée. Il faut un plan de repli (ciel ou plan couchant de
   `title/026`) quand aucun des candidats n'est propre, et exclure les oiseaux dont la tête passerait sous le logo.
3. **Lisibilité à 12 (B1, B5)** : la bande d'aile reste sous le seuil sur une partie des oiseaux ; au couchant en
   plan large, ce sont des silhouettes grises. Le jeton de H3 sauve les humains, pas les bots.
4. **Ombre sur les peintures chaudes (W4, choix de DA)** : Safran et Corail à l'ombre virent rouille et brun.
   Les longues bandes d'ombre des tours sur des aplats saturés donnent au couchant un aspect chargé de « tapis
   de Twister ». Pour la teinte de Safran à l'ombre, pousser la rotation vers le violet (la bible §5.1 veut une ombre froide).
5. **W3** : le relevé cité au §3 donne un p90 de 9,8 à 13,2 ms en High à 12, au-dessus de la cible de 9,5 ms. À confirmer sur un GPU calme, puis gagner 1 à 3 ms (pistes de world.md : SMAA plus bas en High, bords de territoire plus grossiers de près).
6. **Non vérifié à l'œil** : son (A1 à A12, H11), G1, G2, G4 à G7, G9, G11, G12, P2, P4, P7 (vainqueur au téléphone), H4 avec l'URL longue.

## 5. Verdict honnête

**Oui, le jeu tient le niveau « petit studio indé » sur l'essentiel, et par moments il bluffe.** L'écran titre
au couchant avec les ombres violettes du logo, le podium en contre-jour, la carte des résultats en planche
imprimée, les manches de 2 à 6 joueurs en plan serré à l'heure dorée (`solo-en/039`), la vague de nuit qui
fige d'ouest en est : ce sont des images qu'on montrerait dans une bande-annonce. L'interface papier et encre
est cohérente du PC au téléphone ; les règles et le salon enseignent seuls ; aucun bug, aucune clé brute,
aucune erreur console sur deux parties complètes (groupe et solo) ni sur une manche à 12.

Ce qui l'en sépare encore, par ordre d'impact :

1. **La caméra au début du climax.** Les 12 secondes les plus importantes commencent par un plan large et plat,
   ou par un plan bas encombré de tours. Un joueur exigeant le remarquera à chaque manche.
2. **Le titre** : une image sur sept environ reste un « raté de caméra » (tour au premier plan, oiseau sous le
   logo). C'est la première impression.
3. **La lecture à 9-12 oiseaux** : l'arène entière reste à l'écran toute la manche, et on distingue les oiseaux
   par leur jeton plutôt que par leur couleur. C'est jouable, pas spectaculaire. Le brief ne demande l'excellence que de 2 à 6.
4. **La matière du territoire en fin de journée** : des aplats saturés, des ombres brun rouille et des rayures
   d'ombre partout. C'est dense et lisible, mais moins « Moebius » (calme, vide, pastel) que le titre et le
   podium. L'aquarelle ne se voit qu'en plan serré.
5. **La marge GPU** : en High à 12, le p90 relevé (9,8 à 13,2 ms) dépasse la cible, avec 14 % d'images au-delà
   de 20 ms pendant la Grande Ombre, sur la machine de dev. Le mixage, lui, n'a pas été écouté par moi. Ce sont les seuls risques
   techniques qui restent ouverts.
