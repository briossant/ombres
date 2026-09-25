# Ombres : Game Design Document (définitif)

Directeur de game design. Statut : **référence d'implémentation**. En cas de conflit avec un document de `docs/research/`, ce GDD l'emporte.
Sources : `docs/BRIEF.md`, les trois propositions `docs/research/design-{party,depth,drama}.md`, la bible de style `docs/research/moebius-style.md`, et la validation chiffrée `docs/research/gdd-validation/validate.mjs` (résultats de référence dans `results.md`, même dossier).

Conventions : `x` = est, `y` = nord, `z` = altitude, en mètres. L'azimut se mesure depuis le nord, dans le sens horaire. `t` est le temps de manche (0 → 110 s) et `u = t / T`. `e` est l'élévation du soleil, `S = 1/sin(e)` l'étirement des ombres, `d̂` la direction horizontale des ombres (opposée au soleil). Tous les nombres du jeu sont dans le tableau du § 19 et dans un seul fichier `rules.ts`, jamais en dur.

---

## 0. Le jeu en une page

> **Ton ombre peint le désert. À la nuit, le plus grand territoire gagne.**

Les cinq règles, toutes visibles à l'écran. Il n'y en a pas d'autres.

1. **Ton ombre peint le sable à ta couleur.** À la nuit, celui qui possède le plus de sable gagne la manche.
2. **Maintiens PLONGER pour raser le sable : petite ombre forte. Relâche pour remonter : grande ombre pâle.** Une ombre pâle ne recouvre pas du sable fort.
3. **PLONGER au-dessus d'un oiseau plus bas, c'est le piquer.** Touché, il décroche et **sa traînée passe à ta couleur**. Raté, c'est toi qui décroches. Au « clac », la cible peut esquiver d'un COUP D'AILE.
4. **L'ombre des tours fige le sable.** Un oiseau dont l'ombre y disparaît est caché.
5. **Le soleil se couche.** Les ombres s'allongent, puis la nuit descend de la falaise et fige tout, d'ouest en est.

Une manche dure 110 s de soleil, plus 3 s de compte à rebours et 2 s de nuit. Une partie compte 3 manches, et la dernière vaut double. On joue de 1 à 12, avec un optimum de 2 à 6. Le téléphone porte un joystick et deux boutons (PLONGER maintenu, COUP D'AILE), le clavier les mêmes commandes.

---

## 1. Évaluation des trois propositions

Notes sur 10, de mon point de vue de directeur, après lecture intégrale des trois documents et de leurs simulations.

| Critère | Party (accessibilité) | Depth (compétitif) | Drama (spectacle) |
|---|---|---|---|
| Clarté en 5 s | **9** : deux étages, deux boutons, une seule exception de peinture | 5 : altitude continue, descente passive, fenêtre de piqué 5-12 m, choc d'encre, thermique | 8 : cinq règles visibles, « haut par défaut » ; l'encre continue se compare mal à l'œil |
| Profondeur | 6 : peu de décisions fines une fois l'étage choisi | **9** : équilibre mixte démontré, feinte, clac, vol de traînée, sceller | 7 : altitude et vitesse analogiques, éclipses, esquive géométrique |
| Tension de fin de manche | 6 : nuit de 5 s seulement, fin à 5° (ombres de 275 m) | 7 : Grande Ombre de 5 s, vol de traînée des balayeurs | **9** : Grande Ombre de 12 s qui entasse tout le monde à l'est, ralenti final |
| Lisibilité sur un écran | 7 : arène entière à l'écran, mais décalage de 183 m à 5° | 6 : arène ronde (mal adaptée au 16:9), mires, thermique, trois rendus d'encre | **9** : fin à 9°, opacité = pouvoir de peindre, caméra et HUD spécifiés |
| Fun à 2-6 | 7 : couronne, piqué généreux ; duel non étudié | 7 : duel étudié (cycle) mais exigeant | 7 : duel signalé déséquilibré (le haut gagne 25 manches sur 30) |
| Faisabilité technique | **9** : états discrets, peinture binaire | 6 : vérification de faisabilité de la mire, thermique, traînées, encre continue | 8 : encre continue, test de rayon pour la cachette |
| Qualité des bots | 8 : 7 personnalités à signature visible, choix des victimes | 8 : tics lisibles, esquive calibrée par simulation | 8 : erreurs crédibles, équité (2 bots au plus par cible) |
| Onboarding | **9** : lobby à micro-objectifs, aide au vol visible | 7 : bac à sable, beaucoup à apprendre | 8 : écran titre joué, « ne rien faire » reste jouable |
| **Total /80** | **61** | **55** | **64** |

**Base retenue : Drama**, pour la dramaturgie (Grande Ombre, fin à 9°, falaise), la mise en scène (caméra, HUD, ralentis), les cinq règles et la commande « PLONGER maintenu ».
**Greffes de Party** : deux altitudes de croisière et deux niveaux de peinture binaires (lecture instantanée), cachette à 90 % d'ombre couverte, couronne, lobby à micro-objectifs, aide au vol, arène dimensionnée par joueur, clavier par `code`, titres attribués par z-score.
**Greffes de Depth** : vol de traînée comme récompense du piqué, engagement « clac » suivi d'une fenêtre d'esquive, raté = l'attaquant décroche, feinte, compensation de latence, équilibre « la stratégie minoritaire gagne » comme critère de réglage.

### Contradictions tranchées

| Sujet | Party | Depth | Drama | **Tranché** | Pourquoi |
|---|---|---|---|---|---|
| Altitude | 2 étages | continue 3-22 m | continue 4-20 m | **2 altitudes de croisière (4 m et 18 m), transitions continues** | « Je suis en haut / en bas » se lit sur un écran partagé ; les transitions gardent la physique du piqué et du coup de fouet |
| Commande d'altitude | ▲ / ▼ | MONTER maintenu | PLONGER maintenu | **PLONGER maintenu = bas, relâché = haut** | Ne rien faire reste jouable (on peint grand) ; relâcher en panique met à l'abri |
| Peinture | fort / pâle, instantané | encre continue, 2 passages | encre continue, érosion | **fort / pâle, instantané** | Deux valeurs se comparent d'un coup d'œil ; pas de minuterie invisible |
| Récompense du piqué | tache de 10 m | vol de traînée 1,5 s | tache r 8 × S | **vol de traînée 1,5 s (3 s sur la couronne)** | Le public a vu la traînée se peindre, il la voit changer de couleur ; elle grossit au couchant sans règle ajoutée |
| Esquive | élan, crochet, remonter | grand battement au clac | coup d'aile géométrique | **COUP D'AILE après le « clac »** | La micro-simulation (§ 17-E) montre qu'il faut un engagement balistique pour qu'esquiver serve à quelque chose |
| Raté | attaquant freiné | attaquant décroche 1,2 s | rien | **attaquant décroche 1,0 s** | Règle symétrique qui tient en une phrase |
| Fin de manche | nuit de 5 s après 5° | Grande Ombre de 5 s | Grande Ombre de 12 s dans la manche | **Grande Ombre 98 → 110 s, fin à 9°** | Climax long, joueurs regroupés, ombres encore cadrables (141 m au plus) |
| Cachette | ombre couverte ≥ 90 % | corps dans l'ombre | rayon bloqué | **ombre couverte ≥ 90 %** (même règle pour la nuit) | « Si on ne voit plus ton ombre, on ne te voit plus » ; impossible de se cacher au couchant (§ 17-D) |
| Arène | ellipse | disque | ellipse | **ellipse est-ouest, 6 tailles** | Les ombres s'allongent vers la droite de l'écran 16:9 |
| Thermique | non | oui | non | **non (v1)** | Le haut n'est pas un sanctuaire rentable : son sable pâle est repris par n'importe quel oiseau bas |
| Manches | 3 | 3 | 5 | **3 (réglable 1/3/5)** | Partie d'environ 7 minutes |
| Points | oiseaux devancés | idem | + 1 au vainqueur | **oiseaux devancés + 1 au vainqueur, dernière × 2** | Gagner vaut nettement plus que finir deuxième |
| Vitesse au joystick | constante | constante | amplitude = vitesse | **constante** | Un enfant qui pousse à moitié a le même oiseau |
| Noms de couleur au narrateur | noms propres | noms masculins avec article | noms propres | **noms propres sans article** (§ 16) | Pas d'accord à gérer, pas d'élision |

---

## 2. Pitch, règle en 3 images, table des signes

### Pitch

Sous le titre, au chargement et dans le lobby : « Ton ombre peint le désert. À la nuit, le plus grand territoire gagne. » (EN : « Your shadow paints the desert. At nightfall, the biggest territory wins. »)

### La règle en 3 images

Cartes illustrées en ligne claire, animées en boucle de 2,5 s. Elles tournent dans le lobby (sur la TV et sur les téléphones) et s'affichent une fois avant la première manche de la session (8 s, passables quand tous les téléphones ont tapé OK).

| # | Animation | Texte FR (≤ 10 mots) | Texte EN |
|---|---|---|---|
| 1 | Un oiseau passe ; son ombre laisse derrière elle une bande de sa couleur. | Ton ombre peint le sable. | Your shadow paints the sand. |
| 2 | Un oiseau bas (petite ombre foncée) mord sur la zone pâle d'un oiseau haut ; la grande ombre pâle glisse sur une zone foncée sans l'entamer (petit ✕). | Bas : fort. Haut : grand. Le fort gagne. | Low: strong. High: wide. Strong wins. |
| 3 | Un oiseau haut replie ses ailes, fond sur un oiseau bas ; la traînée de la victime change de couleur. Puis le couchant en accéléré, la nuit qui avance. | Pique d'en haut. À la nuit, on compte. | Dive from above. At nightfall, we count. |

### Table des signes : chaque règle a un signe visible

| Règle | Signe à l'écran (TV) | Signe sur le téléphone | Son |
|---|---|---|---|
| L'ombre peint | la bande de couleur apparaît derrière l'ombre | — | grain de sable qui coule, volume ∝ m²/s peints |
| FORT (oiseau ≤ 11 m) | ombre dense (opacité 0,85), bouts d'ailes qui soulèvent du sable ; territoire saturé à hachures croisées | bouton PLONGER enfoncé | souffle grave |
| PÂLE (oiseau > 11 m) | ombre légère (0,40), deux filets d'air blancs aux bouts d'ailes ; territoire à 45 %, hachure simple | — | vent aigu |
| Le pâle ne recouvre pas le fort | le liseré de l'ombre crépite et lâche des étincelles d'encre sur le sable fort | — | « tsk » granuleux |
| Cible verrouillée | chevron à la couleur du chasseur au-dessus de la cible | chasseur : PLONGER devient « PIQUER » à la couleur de la cible ; cible : « tic » discret | — |
| Prise d'élan (0,2 s) | le chasseur se cabre, cri ; « ! » au-dessus de la cible | cible : bordure rouge + vibration | cri |
| Engagement « clac » | ailes claquées, traînée blanche rectiligne | cible : flash + vibration courte | « clac » sec |
| Touche | éclaboussure d'encre, la traînée de la victime change de couleur (vague de 0,4 s), ralenti | vibrations (§ 12) | impact + accord |
| Raté | gerbe de sable, l'attaquant roule dans le sable | vibration longue | « pfft » de sable |
| Immunité | plumes hérissées, scintillement | — | — |
| COUP D'AILE prêt | bouts d'ailes blancs | anneau plein autour du bouton | « tic » à la recharge |
| Sable figé (ombre de tour, nuit) | le sable est dans l'ombre (aplat lavande) ; le territoire y reste visible, assombri | — | — |
| Oiseau caché | oiseau assombri, étiquette en contour seul, aucun chevron possible | icône œil barré | — |
| Couronne | couronne au-dessus du meneur, premier segment de la bande de sable | pastille couronne | cloche |
| Tempête (bord) | rideau de sable ; ombre grisée au-delà du bord | vibration faible | grondement |

---

## 3. Déroulé d'une manche et arc de tension

| Phase (bandeau 3 s) | t (s) | e | S | Ce qui se passe | Intensité | Musique (couches) |
|---|---|---|---|---|---|---|
| Envol | −3 → 0 | 88° | 1,00 | Oiseaux en pilote automatique, peinture coupée, « 3, 2, 1, Envol ! » | 1 | vent, bâtons de bois, gong |
| **Midi** | 0 → 15 | 88° → 71,5° | 1,00-1,05 | Ruée sur le sable neutre, ombres sous les oiseaux | 2 | nappe + drone |
| **Après-midi** | 15 → 55 | → 35° | → 1,74 | Les ombres se décalent (jusqu'à 26 m) ; les disques des tours se détachent et deviennent des éclipses mobiles ; premiers piqués | 2 → 3 | + mélodie éparse |
| **Heure dorée** | 55 → 85 | → 16,4° | → 3,55 | Lumière chaude, fil d'ombre affiché ; voler en travers des ombres devient payant | 3 → 4 | + percussions |
| **Couchant** | 85 → 98 | → 11,3° | → 5,11 | Ombres de 80 à 110 m, bandes d'ombre des tours à travers l'arène | 4 | + cordes en ostinato, `riser` à 97 s |
| **Grande Ombre** | 98 → 110 | → 9° | → 6,39 | La nuit descend de la falaise et fige le désert d'ouest en est ; tout le monde fuit vers l'est ; « Dix secondes » à 100 s ; dernière seconde à 0,5× | 5 | tutti + battement de cœur 1 → 2 Hz |
| **Nuit** | 110 → 112 | figé | — | Gel, 1,5 s de silence, étoiles, le territoire s'allume comme des braises | 1 | coupure, puis gong |
| Résultats | 112 → ~127 | — | — | Vue carte verticale, décompte, soleils, titre de manche | — | thème des résultats |

---

## 4. Arène

### 4.1 Forme et tailles

Ellipse de grand axe est-ouest. La caméra regarde le nord : le soleil se couche à gauche de l'écran, les ombres s'allongent vers la droite. L'arène entière tient à l'écran au dézoom maximal. Sa taille dépend du nombre total d'oiseaux N (bots compris).

| N | Demi-axes a × b | Surface | m²/oiseau (N max) | Tours (Parasols) | Cellule (grille 512 × 352) | Oiseau de 11 m à 1080p, dézoom max |
|---|---|---|---|---|---|---|
| 1-2 | 110 × 76 m | 26 264 m² | 13 132 | 5 | 0,43 m | 87 px |
| 3 | 128 × 88 m | 35 387 m² | 11 796 | 5 | 0,50 m | 75 px |
| 4 | 142 × 98 m | 43 718 m² | 10 930 | 6 | 0,55 m | 68 px |
| 5-6 | 165 × 114 m | 59 093 m² | 9 849 | 7 | 0,64 m | 58 px |
| 7-9 | 188 × 130 m | 76 781 m² | 8 531 | 8 | 0,73 m | 51 px |
| 10-12 | 210 × 145 m | 95 661 m² | 7 972 | 9 | 0,82 m | 46 px |

La densité monte un peu avec N : à 12, le chaos est voulu. Le rendu peut grossir les oiseaux jusqu'à +30 % au dézoom maximal (cosmétique : jamais les ombres ni les zones de touche).

### 4.2 Grille de territoire

- 512 colonnes sur le grand axe, 352 lignes (rapport a/b ≈ 1,45). Chaque cellule stocke `owner` (0 = neutre, 1..12) et `level` (0, 1 = pâle, 2 = fort). Texture RG8 512 × 352 envoyée au shader du sol.
- Seules comptent les cellules dont le centre est dans l'ellipse et hors du pied des tours.
- Masque « figé » (R8, même résolution) : ombres de tours (recalculé toutes les 3 ticks, soit 10 Hz) et Grande Ombre (analytique, à chaque tick).

### 4.3 Bord : le Simoun

Un rideau de tempête tourne autour de l'ellipse. Règle visible et unique : on ne peut pas sortir.
- Au-delà de 92 % du rayon elliptique (`hypot(x/a, y/b) > 0,92`), le cap est tiré vers le centre à 115°/s en plus du pilotage, et les ailes tremblent.
- À 100 %, la position est ramenée sur le bord.
- Une ombre qui tombe au-delà du bord ne peint pas et s'affiche grisée sur le rideau. Voler près du bord gaspille son ombre, ce qui ramène vers l'intérieur.

### 4.4 Apparition

Oiseaux répartis régulièrement sur un anneau à 45 % du rayon elliptique, cap tangent (sens antihoraire), à 25 m au moins d'une tour (on décale l'angle si besoin). Chacun reçoit une tache forte de 8 m de rayon sous lui, pour repérer sa couleur dès la première seconde.

### 4.5 Ce qui garde les joueurs proches (tout est visible)

1. L'arène tient à l'écran et se traverse en 16 s (5-6 oiseaux, en haut).
2. Le sable neutre s'épuise : 65 % du désert est peint à 45 s en simulation (bots médiocres). Ensuite, gagner veut dire voler, donc aller chez les autres.
3. La couronne : le meneur est marqué, et le piquer vole deux fois plus de traînée.
4. Le piqué exige la proximité : cible à 26 m au plus.
5. La lumière rétrécit : bandes d'ombre des tours (16 % de l'arène au couchant), puis la Grande Ombre réduit la zone jouable de 100 % à 0 % en 12 s et entasse tout le monde à l'est.

Mesure : distance moyenne au plus proche voisin, de 30 à 90 s, entre 35 et 54 m selon N (§ 17-F). **Levier de réserve** (désactivé par défaut) : si les playtests mesurent plus de 70 m, le Simoun se resserre à 85 % du rayon entre 40 et 98 s. Le sable avalé garde sa couleur et devient figé.

---

## 5. L'oiseau

### 5.1 États et cinématique

| Paramètre | BAS (ras du sable) | HAUT | Commentaire |
|---|---|---|---|
| Altitude de croisière | 4 m | 18 m | PLONGER maintenu → vise 4 m ; relâché → vise 18 m |
| Transition | descente 22 m/s (0,64 s) | montée 8 m/s (1,75 s) | La montée est la phase vulnérable |
| Niveau de peinture | FORT si altitude ≤ 11 m | PÂLE si altitude > 11 m | Le basculement se voit (densité de l'ombre, sable ou filets d'air) |
| Vitesse | 16 m/s | 21 m/s | Interpolée linéairement selon l'altitude ; lissage τ = 0,25 s ; on ne s'arrête jamais (planeur) |
| Virage max | 140°/s (rayon ≈ 6,5 m) | 105°/s (rayon ≈ 11,5 m) | Interpolé ; accélération de lacet 720°/s² |
| Ombre (rayon avant étirement) | 5 m | 11 m | `r = 5 + 6·α`, `α = (h − 4)/14` |

- Pilotage : le joystick donne un cap absolu à l'écran (haut du stick = haut de la TV = nord). Dans la zone morte (20 % du rayon), l'oiseau garde son cap. L'amplitude ne change pas la vitesse.
- La caméra ne tourne jamais en lacet pendant une manche : le cap reste stable sous le pouce.
- Pourquoi le bas est plus lent : à vitesse égale, voler bas dominait (Drama : 75 % de victoires). À 16 contre 21 m/s, aucune politique pure ne domine (§ 17-F).

### 5.2 COUP D'AILE (bouton 2)

Impulsion de +22 m/s dans la direction du joystick (ou du cap si le stick est neutre), pendant 0,3 s, puis retour à la vitesse de croisière (τ = 0,25 s). Déplacement latéral d'environ 6,6 m. Recharge de 3,0 s, visible (bouts d'ailes blancs quand il est prêt, anneau sur le bouton). Il sert à esquiver un piqué (§ 8.5), à sprinter pour peindre ou à fuir. Aucune invulnérabilité : l'esquive est géométrique.

### 5.3 Collisions

- Entre oiseaux : si l'écart d'altitude est inférieur à 3 m et la distance inférieure à 6 m, chacun reçoit une poussée latérale de 5 m/s, avec une bouffée de plumes et une petite vibration. Aucun effet de jeu.
- Avec une tour : seuls les fûts sont en dessous de 24 m (§ 9.3). Collision à `rayon du fût + 2,5 m` : l'oiseau glisse tangentiellement et perd 30 % de vitesse pendant 0,3 s, sans décrocher. Une aide de trajectoire dévie le cap de 15° au plus si l'impact est prévu dans moins de 0,5 s (30° avec l'aide au vol).

### 5.4 Animation procédurale (exigences du brief, pilotées par l'état)

Ailes repliées en descente et en piqué, battements amples en montée (amplitude ∝ taux de montée), inclinaison proportionnelle au taux de virage (50° au plus), pose cabrée pendant la prise d'élan, ailes claquées au clac, roulé-boulé dans le sable au décrochage, plumes hérissées pendant l'immunité.

---

## 6. Ombre et peinture

### 6.1 Géométrie de l'ombre d'un oiseau (identique au rendu et au gameplay)

Pour un oiseau en `(x, y)` à l'altitude `h` :
- rayon `r = 5 + 6·clamp((h − 4)/14, 0, 1)` ;
- centre `c = (x, y) + h·cot(e)·d̂` ;
- empreinte : ellipse de demi-axe `r·S` le long de `d̂` et `r` en travers, avec `S = min(1/sin e, 6,5)` ;
- niveau : FORT si `h ≤ 11 m`, PÂLE sinon.

C'est l'ombre d'une sphère de rayon `r`. Un disque plat (ailes à plat) ne s'allongerait pas, et le brief exige que les ombres s'allongent : l'entorse est assumée, et le rendu utilise exactement la même ellipse, au pixel près. Rendu (compatible avec la règle R9 de la bible de style) : aplat `castShadow` teinté de la couleur du joueur, d'opacité 0,85 (FORT) ou 0,40 (PÂLE), bord adouci de ±0,5 m autour du contour exact (la ligne à 50 % est celle qui peint), liseré de 0,5 m à la couleur du joueur. Un fil d'encre pointillé relie l'oiseau au centre de son ombre dès que le décalage dépasse 8 m.

### 6.2 Règle de peinture (chaque tick de 30 Hz)

Une cellule est peinte si son centre est dans l'empreinte, dans l'arène, hors du masque figé, et si l'oiseau n'est pas décroché.

| Cellule avant | Ombre FORTE | Ombre PÂLE |
|---|---|---|
| neutre | à toi, forte | à toi, pâle |
| à toi, pâle | à toi, forte | inchangée |
| à toi, forte | inchangée | inchangée (on ne s'affaiblit jamais soi-même) |
| adverse, pâle | à toi, forte | à toi, pâle |
| adverse, forte | à toi, forte | **aucun effet** : étincelles et « tsk » |

- Plusieurs ombres sur une même cellule au même tick : la FORTE gagne ; à niveau égal, l'ombre dont le centre est le plus proche ; en cas d'égalité exacte, un hash déterministe `(tick, cellule)`.
- Sous-pas obligatoires : l'ombre ne doit jamais avancer de plus de 1 m entre deux empreintes rastérisées. Le coup de fouet déplace une ombre à 137 m/s en fin de manche, soit 4,6 m par tick : sans sous-pas, des cellules seraient sautées.
- Pas d'usure : un territoire ne change que si quelqu'un le repeint.
- Score : nombre de cellules possédées, quel que soit le niveau. Le niveau ne sert qu'à la défense.
- Rendu du territoire : FORT = couleur saturée et hachures croisées serrées ; PÂLE = teinte à 45 % et hachure simple espacée. La DA doit garantir que FORT et PÂLE se distinguent en niveaux de gris. Le mode daltonien ajoute un motif propre à chaque joueur (angle de hachure et trait ou pointillé).

### 6.3 Ordres de grandeur (vérifiés, § 17-A)

- Débit au zénith : 160 m²/s en bas, 462 m²/s en haut (0,27 et 0,78 % de l'arène 5-6 par seconde).
- Débit à la nuit, en vol perpendiculaire aux ombres : 1 023 et 2 953 m²/s (× 6,4). Un oiseau haut balaie 5 % de l'arène par seconde.
- Dans l'axe des ombres, le débit reste celui du zénith. **Voler en travers des ombres** est la compétence du soir : elle se découvre en regardant sa bande s'élargir, et une indication la rappelle au début de l'heure dorée.
- Décalage de l'ombre à la nuit : 25 m en bas, 114 m en haut. Longueur de l'ombre : 64 et 141 m.
- **Coup de fouet** : monter ou descendre déplace l'ombre à `vitesse verticale × cot e`, soit 110 m/s en descente à 98 s. Un plongeon au couchant fouette une bande de 70 m en 0,64 s. C'est la géométrie qui le produit, et les experts s'en serviront.
- Potentiel de peinture par phase : Midi 6 %, Après-midi 20 %, Heure dorée 28 %, Couchant 21 %, Grande Ombre 26 % (avant réduction par le front). Le début compte, la fin pèse le plus.

---

## 7. Le soleil

- Durée `T = 110 s` (réglage de partie : Courte 80 s, Normale 110 s, Longue 150 s ; tous les instants de phase sont mis à l'échelle par `T/110`).
- Élévation : `e(u) = 9° + 79° × (1 − u)^1,6`. Le disque passe vite sur le zénith, où les ombres sont toutes sous les oiseaux, et s'attarde là où elles grandissent.
- Azimut : `az(u) = 270° − 30° × (1 − u)²`. Le soleil part du sud-ouest (ombres vers le nord-est, en haut à droite de l'écran) et finit plein ouest (ombres vers la droite). Les ombres tournent quand elles sont courtes et que ça compte peu, puis deviennent prévisibles.
- Le cadran du HUD avance linéairement en temps, même si l'élévation ne le fait pas : c'est un chronomètre.
- Fin à 9° plutôt qu'à l'horizon : à 3°, l'ombre d'un oiseau haut tomberait à 340 m, hors de l'arène. À 9°, le décalage maximal est de 114 m, un tiers de l'arène 5-6 : cadrable.

### 7.1 La Grande Ombre (98 → 110 s)

- À 98 s, le disque solaire touche la crête de **la Falaise**, une mesa géante sur l'horizon ouest, visible dans la skybox (environ 320 m de haut, à 1,7 km). Son ombre entre par le bord ouest.
- Le front est une ligne perpendiculaire à `d̂` (presque nord-sud), au profil dentelé fixe par carte (±6 m, la silhouette de la mesa). Il avance à vitesse constante et atteint le bord est à 110 s : 27,5 m/s dans l'arène 5-6 (de 18 à 35 m/s selon la taille). Plus rapide que les oiseaux : on ne le distance pas.
- Derrière le front, le sable est figé, exactement comme sous une tour.
- Un oiseau est « dans la nuit » quand 90 % de son ombre y est : il ne peint plus et ne peut plus être ciblé. Même règle que la cachette sous une tour. Conséquence visible : un oiseau haut peut voler physiquement jusqu'à 114 m à l'intérieur de la nuit et peindre encore devant le front, parce que son ombre tombe là-bas.
- « Dix secondes » à 100 s. La dernière seconde (109 → 110 s) est jouée à 0,5× (2 s réelles). Au passage du front sur le bord est : gel, silence.
- Repli prévu si les playtests trouvent le front confus : extinction uniforme en 2 s à 110 s.

---

## 8. Le piqué

### 8.1 Verrouillage (automatique, visible)

À chaque tick, pour chaque oiseau A (ni décroché, ni en piqué, recharge de piqué terminée), la cible B retenue est celle qui minimise `distance × (1 + écart angulaire / 70°)` parmi les oiseaux qui :
- volent **au moins 6 m plus bas** que A (en pratique : un oiseau haut sur un oiseau bas, ou sur un oiseau qui remonte et n'a pas encore passé 12 m) ;
- sont à **26 m au plus** à l'horizontale ;
- sont dans un cône de **±70°** autour du cap de A (pas de cône à moins de 3 m) ;
- ne sont ni décrochés, ni immunisés, ni cachés (tour ou nuit).

Signe : un chevron à la couleur du chasseur au-dessus de la cible, visible de tous. Sur le téléphone du chasseur, PLONGER devient « PIQUER » à la couleur de la cible. À 12 oiseaux, on n'affiche que le chevron du chasseur le plus proche de chaque cible.

### 8.2 Déclenchement

- Appuyer sur PLONGER avec une cible verrouillée lance le piqué.
- Maintenir PLONGER (descente) au moment où une cible devient verrouillable le lance aussi : **tomber sur quelqu'un, c'est le piquer**.
- Sans cible, PLONGER fait simplement descendre.

### 8.3 Déroulé

1. **Prise d'élan, 0,2 s.** Le chasseur se cabre, s'oriente vers sa cible et crie. La cible est avertie : « ! » au-dessus de son oiseau, bordure rouge et vibration sur son téléphone.
2. **Chute guidée.** Vitesse horizontale de 30 m/s, virage limité à 150°/s vers le point d'interception prédit. La cible est extrapolée sur un arc, à vitesse et taux de virage constants (ceux qu'elle a à cet instant) : tourner en rond ne protège pas. La vitesse verticale s'adapte pour arriver à l'altitude de la cible.
3. **Engagement, le « clac ».** Quand l'interception prédite est à 0,65 s ou moins, le chasseur claque ses ailes et sa trajectoire devient balistique et rectiligne vers le point prédit. Cette phase dure au moins 0,65 s (le chasseur ralentit si la cible est tout près). Le contact survient en médiane 0,49 s après le clac.
4. **Résolution.** Touche si la distance 3D entre les centres est ≤ 4,0 m et que le chasseur n'est pas plus d'1 m sous la cible. Sinon, raté. Durée maximale après la prise d'élan : 1,4 s. Durée moyenne mesurée : 0,87 s.
5. **Feinte.** Relâcher PLONGER **avant** le clac annule le piqué : le chasseur se redresse et remonte, sans autre pénalité que l'altitude perdue et la recharge de 1 s. Après le clac, plus d'annulation.
6. Si la cible devient cachée ou immunisée avant la résolution, le piqué s'annule de la même façon, sans pénalité.

### 8.4 Effets

| | Touche | Raté (esquive ou erreur de visée) |
|---|---|---|
| Victime | **Décroche** 1,5 s : vrille, tombe au ras du sable, dérive à 8 m/s, ne contrôle plus rien et ne peint plus (ombre grise sans liseré). Puis 2,5 s d'immunité (plumes hérissées : ni verrouillable ni touchable, mais elle pilote et peint). | Rien. Son COUP D'AILE est en recharge. |
| Territoire | **Vol de traînée** : toutes les cellules couvertes par les empreintes de l'ombre de la victime pendant les **1,5 dernières secondes** (3 s si elle porte la couronne), qui lui appartiennent encore et ne sont pas figées, passent à la couleur du chasseur **en gardant leur niveau**. On voit une vague de couleur remonter la traînée en 0,4 s. | Rien. |
| Chasseur | Rebondit (+6 m instantanés, puis remonte s'il relâche PLONGER), garde sa vitesse. Recharge de piqué 1,0 s. | **Plante dans le sable** : décroche 1,0 s au ras du sable (ne peint plus, ne contrôle plus). Recharge 1,0 s ensuite. « Raté, c'est toi qui décroches. » |

Ordres de grandeur du vol de traînée : 240 m² pour un oiseau bas à midi, environ 1 500 m² au couchant (2,5 % de l'arène 5-6), 3 000 m² si c'est le meneur couronné. En simulation, une touche rapporte en moyenne 1 150 à 1 370 m² (§ 17-F). Les proies les plus rentables sont les peintres du soir, bas et étirés : le piqué est leur contrepoids.

### 8.5 Contre-jeu et fenêtre d'esquive (micro-simulation, § 17-E)

- **Ne pas être dessous** : rester haut rend intouchable (il n'y a personne au-dessus du plafond). Remonter dès qu'un chevron apparaît : il faut 0,75 s pour passer de 4 à 10 m, et on reste verrouillable tant qu'on est 6 m sous le chasseur.
- **Coup d'aile au clac** : la fenêtre utile va de 0,50 à 0,20 s avant le contact.

| Appui du coup d'aile, avant l'impact | 0,05 s | 0,15 s | 0,25 s | 0,35 s | 0,45 s | 0,55 s | 0,70 s |
|---|---|---|---|---|---|---|---|
| P(touche) | 100 % | 99 % | 4 % | 0 % | 0 % | 18 % | 98 % |

Trop tôt (avant le clac), le chasseur réajuste. Trop tard, il est déjà là. Réagir au clac en 0,25 s esquive 87 % des piqués, en 0,30 s la moitié, en 0,35 s seulement 13 %. Un joueur attentif esquive la plupart des piqués, un joueur distrait non. L'anticipation (lire la prise d'élan et la distance) permet de faire mieux que le réflexe pur.
- **Contre-virage au clac** : inverser un virage serré 0,1 à 0,2 s après le clac esquive aussi (0 à 6 % de touches). Tourner en rond en continu ne protège pas (100 % de touches).
- **Se cacher** : glisser son ombre dans celle d'une tour annule la cible.
- **Lire la feinte** : garder son coup d'aile pour le clac, pas pour le cri.

### 8.6 Latence (20-80 ms)

Le PC fait autorité. Pour une cible pilotée par téléphone, la résolution d'une touche est retardée de `min(0,1 s, RTT/2)` de ce téléphone. Si un COUP D'AILE arrive pendant ce délai avec un horodatage client antérieur au contact (horloge synchronisée par ping), la touche est annulée et l'esquive appliquée. L'écart visuel se limite à un recalage de quelques décimètres, masqué par le ralenti. Aucune règle ne dépend d'une précision inférieure à 100 ms.

### 8.7 Anti-frustration

Immunité de 2,5 s après un décrochage (4 s avec l'aide au vol). Les bots ne s'engagent jamais à plus de deux sur la même cible par fenêtre de 10 s. Le choix sûr existe toujours : rester haut.

---

## 9. Les tours : « elles cachent et elles bloquent »

### 9.1 Géométrie exacte

Une tour est un empilement de segments de révolution (profils lathe) : troncs de cône `(z0, r0) → (z1, r1)`. Les bulbes sont approchés par 4 troncs, les disques sont des cylindres courts, les dômes 3 troncs. Sous lumière parallèle, l'ombre au sol d'un tronc de cône est **exactement l'enveloppe convexe de deux cercles** : rayon `r0` centré en `base + z0·cot(e)·d̂`, rayon `r1` centré en `base + z1·cot(e)·d̂`. Pour un cylindre, c'est une capsule. L'ombre d'une tour est l'union de ses segments. Test d'appartenance : dans l'un des deux cercles, ou entre les deux tangentes extérieures et entre les deux cordes de tangence (implémentation de référence : `segHull` / `inHull` dans `validate.mjs`). Même fonction pour le rendu (shader, tableau uniforme de segments) et pour la simulation.

### 9.2 Les trois effets

1. **Elles bloquent** : une cellule sous l'ombre d'une tour est figée. Personne ne la peint ni ne la vole, pas même par vol de traînée. Elle compte toujours pour son propriétaire.
2. **Elles cachent** : un oiseau dont l'ombre est couverte à 90 % ou plus (13 points d'échantillonnage : le centre, 6 à mi-rayon, 6 au bord) par l'ombre des tours ou par la nuit est caché. Il n'est ni verrouillable ni touchable, et un piqué en cours contre lui s'annule. Il peut piquer depuis sa cachette (embuscade).
3. **Le prix** : une ombre dans l'ombre ne peint pas (le sable y est figé). Un oiseau caché ne peint donc presque rien. Ce n'est pas une règle ajoutée : c'est la physique, et on la voit.

Se cacher est une affaire d'oiseau bas (petite ombre) et de début de manche : 1,5 à 3,2 % des positions de l'arène cachent un oiseau bas jusqu'à 85 s, 0,3 % à 98 s ; un oiseau haut ne se cache presque jamais (< 1 %). Au couchant, quand tout se joue, on ne peut plus se cacher.

### 9.3 Règles de placement (toutes les cartes)

- Aucune partie de tour plus large que 5 m de rayon en dessous de 24 m : les oiseaux (≤ 18 m, rebond compris) ne heurtent que des fûts. Disques, chapeaux et bulbes sont au-dessus, silhouettes typiquement Moebius.
- 45 m au moins entre deux fûts ; 15 m au moins entre un fût et le bord ; 25 m au moins entre un fût et un point d'apparition ; 30 m dégagés autour du centre sur la carte d'ouverture.
- Tours hautes à l'ouest, basses à l'est : les ombres des couronnes doivent traverser l'arène pendant l'heure dorée au lieu d'en sortir trop tôt. Condition : `x_tour + z_couronne × 5 ≤ a`.
- Couverture cible (arène 5-6) : 4-7 % à midi, 8-13 % à 55 s, 13-25 % de 85 à 98 s.
- Autres tailles : positions × (a/165, b/114), rayons des parties larges (> 5 m) × √(a/165), hauteurs et fûts inchangés, tours retirées ou ajoutées selon le tableau du § 4.1.

### 9.4 Les quatre cartes (preset 5-6 oiseaux, coordonnées en mètres)

**Les Parasols** (manche 1 par défaut) : de grands refuges à midi, puis des éclipses mobiles.

| Tour | Position | Profil (z en m, r en m) |
|---|---|---|
| T1 Grand Parasol | (−70, 8) | fût r 4 → 3,5 (0-44) ; disque r 18 (44-48) ; flèche r 2 → 1 (48-58) |
| T2 Parasol ouest | (−128, −42) | fût r 3,5 → 3 (0-34) ; disque r 13 (34-37) |
| T3 Fuseau nord-ouest | (−110, 60) | fût r 4 → 3 (0-46) ; bulbe r 8 centré à 54 ; pointe r 1,5 → 0,5 (62-70) |
| T4 Pile nord | (−15, 72) | fût r 3,5 → 3 (0-36) ; disque r 10 (26-28) ; disque r 13 (33-36) |
| T5 Parasol sud | (−10, −76) | fût r 3 → 2,5 (0-30) ; disque r 12 (30-33) |
| T6 Fuseau est | (68, 45) | fût r 3,5 → 2,5 (0-26) ; bulbe r 6 centré à 31 |
| T7 Colonne est | (88, −38) | fût r 5 (0-24) ; disque r 9 (24-27) |
| T8 Aiguille centre (N ≥ 7) | (28, −18) | fût r 3 → 1,5 (0-40) ; bulbe r 5 centré à 44 |
| T9 Parasol nord-est (N ≥ 10) | (42, 88) | fût r 3 → 2,5 (0-30) ; disque r 12 (30-33) |

**Les Aiguilles** : 9 fuseaux fins en quinconce, peu de refuges. Au couchant, elles découpent le désert en couloirs, comme un code-barres. Positions (−120, 20), (−85, −55), (−70, 70), (−35, 5), (−15, −85), (10, 55), (45, −35), (80, 30), (110, −50) ; hauteurs décroissantes d'ouest en est, de 52 à 26 m ; fût r 3 → 1,5 ; bulbe r 5 → 3,5.

**Les Géantes** : deux tours géantes plantées dans la tempête, à l'ouest, hors de l'arène. G1 en (−228, −38), fût r 10 → 7 (0-100), bulbe r 12 centré à 108. G2 en (−222, 62), fût r 9 → 6 (0-84), bulbe r 10 centré à 91. Leurs ombres entrent dans l'arène pendant l'après-midi et la traversent au couchant : ce sont « les doigts de la nuit ». S'y ajoutent 4 tours intérieures : parasol (−95, 5) h 36 r 15, pile (−30, −65) h 34, parasol (15, 55) h 30 r 12, fuseau (80, −20) h 34.

**Le Cadran** (toujours la dernière manche) : un gnomon central en (−30, 0), fût r 5 → 3 (0-70) avec disques r 12 (38-41), r 16 (52-55) et r 7 (66-70). Son ombre tourne comme l'aiguille d'un cadran solaire pendant toute la manche. Quatre parasols de 28 à 34 m l'entourent en (55, ±55) et (−110, ±58).

Couverture mesurée (§ 17-D), en % de l'arène :

| Carte | 0 s | 30 s | 55 s | 70 s | 85 s | 98 s |
|---|---|---|---|---|---|---|
| Les Parasols | 4,7 | 6,6 | 9,8 | 12,6 | 16,1 | 15,6 |
| Les Aiguilles | 0,5 | 2,3 | 4,6 | 6,9 | 9,7 | 10,7 |
| Les Géantes | 2,7 | 4,1 | 9,3 | 15,3 | 23,3 | 24,4 |
| Le Cadran | 3,9 | 5,2 | 7,7 | 10,1 | 10,8 | 9,9 |

Longueur de l'ombre d'une tour (pointe, mesurée depuis le pied) : une tour de 46 m projette 2 m à midi, 66 m à 55 s, 156 m à 85 s, 231 m à 98 s et 290 m à 110 s ; le gnomon de 70 m, 442 m à la fin (il traverse l'arène). La pointe avance de 1 m/s à midi, 1,8 m/s à 55 s, 4,8 m/s à 85 s et 6,4 m/s à 98 s : une course visible pour qui veut « sceller » son sable juste avant qu'elle ne le recouvre.

### 9.5 Profondeur qui en découle, sans règle ajoutée

- **Sceller** : peindre fort juste devant une ombre de tour qui arrive met ce sable à l'abri jusqu'à ce qu'elle reparte.
- **Désceller** : quand l'ombre tourne, elle relâche une bande de l'autre côté ; ce qui y dormait redevient prenable.
- **Refuges mobiles** : à midi, les disques forment des ombrelles au pied des tours ; l'après-midi, ils s'en détachent et glissent vers l'est (1 à 3 m/s). Pour rester caché, il faut les suivre.

---

## 10. La couronne

Le meneur de la manche en cours (surface possédée), avec une hystérésis de 2 s, porte une couronne au-dessus de son oiseau et occupe le premier segment de la bande de sable. Seul effet : le piquer vole **3 s de traînée au lieu de 1,5 s**. Tout le monde a une raison d'aller vers lui, et le meneur doit regarder le ciel. Rattrapage visible, pas d'élastique caché.

---

## 11. Score, manche, partie

### 11.1 Manche

- Score de manche : part du désert possédée à la nuit (toutes les cellules sont figées), affichée au dixième de pour cent. Les égalités d'affichage se départagent au nombre exact de cellules (« photo-finish ») ; à égalité exacte, même rang.
- **Soleils** (points de partie) : un soleil par oiseau devancé, plus un au vainqueur. À 4 oiseaux : 4 / 2 / 1 / 0. À 6 : 6 / 4 / 3 / 2 / 1 / 0. Les ex æquo prennent le meilleur rang.
- **Dernier couchant** : la dernière manche compte double (réglage activé par défaut), annoncé dans le lobby, avant la manche et par le narrateur.

### 11.2 Partie

- 3 manches par défaut (réglable : 1, 3 ou 5). Le désert est remis à zéro à chaque manche.
- Ordre des cartes : Les Parasols, puis Les Aiguilles ou Les Géantes (tirage), puis **Le Cadran** en dernier. En 5 manches : Parasols, Aiguilles, Géantes, Parasols en miroir nord-sud, Cadran.
- Vainqueur : total de soleils. Départage : territoire cumulé sur la partie, puis nombre de manches gagnées, puis co-victoire (« Le désert refuse de choisir »).
- Durée : 3 + 110 + 2 + 15 ≈ 130 s par manche, soit environ 7 minutes pour 3 manches avec le podium.

### 11.3 Entre les manches (15 s au plus, passables quand tous les téléphones appuient sur « Prêt »)

Nuit (1,5 s de silence, étoiles, territoire qui s'allume), montée de la caméra à la verticale pour la vue carte, pourcentages au compteur (3 s), vainqueur et réplique du narrateur, soleils qui volent vers les noms, une mention au plus (« Plus gros vol : Corail, +6,2 % en 3 s »). Les téléphones affichent les statistiques personnelles.

### 11.4 Titres de fin de partie

Chaque joueur reçoit exactement un titre, s'il en atteint au moins un seuil. Attribution gloutonne : on calcule pour chaque paire (joueur, titre) le z-score de la statistique dans le groupe, on attribue la paire la plus forte au-dessus du seuil, on retire ce joueur et ce titre, et on recommence. Chaque titre s'affiche avec son chiffre.

| Titre | Statistique | Seuil |
|---|---|---|
| Le Rapace | piqués réussis | ≥ 3 |
| Le Gibier | décrochages subis | ≥ 3 |
| L'Anguille | esquives réussies (le chasseur a planté) | ≥ 2 |
| Le Kamikaze | piqués ratés | ≥ 3 |
| Le Pilleur | sable pris à d'autres (repeint + traînées) | ≥ 8 % de l'arène, cumulés |
| Rase-Mottes | part du temps en bas (≤ 11 m) | ≥ 50 % |
| Le Nuage | part du temps en haut | ≥ 75 % |
| Le Bâtisseur | part du territoire final déjà à soi à 60 s | ≥ 40 % |
| Le Notaire | territoire figé sous les tours au moment de la nuit | ≥ 3 % de l'arène |
| Dernier Rayon | gain net pendant la Grande Ombre | le plus haut, > 0 |
| Le Lézard | temps caché | ≥ 15 s |
| Le Revenant | places gagnées entre 90 s et la nuit | ≥ 2 places |

### 11.5 Podium et revanche

Podium : les oiseaux perchés sur les couronnes de trois tours, le champion sur la plus haute, silhouettes sur le ciel du couchant. Sur les téléphones, « Revanche » et « Salon ». La revanche démarre quand la majorité des humains l'a votée, ou après 15 s si au moins un l'a votée. On garde joueurs, couleurs, bots et réglages. Au clavier : Entrée = revanche.

---

## 12. Contrôles

### 12.1 Téléphone (paysage, écran toujours allumé via Wake Lock, fond à la couleur du joueur)

| Zone | Contrôle | Détail |
|---|---|---|
| Moitié gauche | joystick flottant | naît sous le pouce ; rayon 70 px CSS ; zone morte 20 % ; cap absolu à l'écran |
| Droite, en bas | **PLONGER** (grand rond, 38 % de la hauteur) | maintenu = bas, relâché = haut ; devient « PIQUER » à la couleur de la cible quand une cible est verrouillée |
| Droite, au-dessus | **COUP D'AILE** (rond, 28 % de la hauteur) | appui ; anneau de recharge de 3 s |
| Bandeau haut | infos | couleur, nom, rang (« 2e »), part (« 23,4 % »), couronne, mini-arc du soleil |
| Coin haut droit | pause | appui long d'1 s |

- Les boutons agissent à l'appui. Un appui pendant une transition est mis en tampon 0,15 s. Les compteurs d'appuis (`pa`, `pb`) garantissent qu'aucun appui bref n'est perdu.
- Réglage « Type de contrôle » : **Absolu** (défaut) ; **Relatif** (l'axe X du joystick tourne à gauche ou à droite, comme un volant) ; **Inclinaison** (le vecteur d'inclinaison donne le cap, mesuré depuis la position enregistrée au « Prêt », zone morte 5°, plein effet à 20°, bouton « Recalibrer » ; sur iOS, un bouton « Activer l'inclinaison » appelle `DeviceOrientationEvent.requestPermission`). Les boutons restent tactiles.
- Mode portrait de secours : joystick en bas à gauche, boutons en bas à droite.
- **Aide au vol** (par joueur, activable depuis son téléphone, icône plume visible à côté du nom sur la TV) : verrouillage à 34 m et ±85°, évitement des tours et du Simoun (30°), immunité de 4 s, et un COUP D'AILE automatique au clac une fois sur deux s'il est rechargé. Pour les enfants et les débutants. Elle est affichée, donc ce n'est pas une règle cachée.

### 12.2 Clavier (`KeyboardEvent.code`, positions physiques : ZQSD en AZERTY sans réglage)

| Joueur | Direction | PLONGER (maintenir) | COUP D'AILE | Pause |
|---|---|---|---|---|
| Solo / dev | `KeyW/A/S/D` ou flèches | `Space` | `ShiftLeft` ou `ShiftRight` | `Escape` |
| Clavier partagé J1 | `KeyW/A/S/D` | `Space` (pouce gauche) | `ShiftLeft` (auriculaire) | `Escape` |
| Clavier partagé J2 | `KeyI/J/K/L` | `AltRight` (pouce droit) | `Semicolon` (M en AZERTY) | |
| J2, variante pavé numérique | `Numpad8/4/5/6` | `Numpad0` | `NumpadEnter` | |

Directions en 8 secteurs ; aucune touche = on garde le cap. Toutes ces touches appellent `preventDefault` ; sous Windows, AltGr émet aussi `ControlLeft`, à ignorer quand `AltRight` est enfoncé. On rejoint le lobby en appuyant sur la touche PLONGER de son groupe. Les libellés affichés passent par `navigator.keyboard.getLayoutMap()` quand il existe. `F` = plein écran. Manette (Gamepad API, bonus) : stick gauche ; A/✕ ou gâchette droite = PLONGER ; B/○ ou RB = COUP D'AILE ; Start = pause.

### 12.3 Vibrations (`navigator.vibrate` ; iOS ne les gère pas, un flash de la bordure du téléphone les remplace)

| Événement | Motif (ms) |
|---|---|
| Passage bas ↔ haut | `[10]` |
| Tu es verrouillé (nouveau chasseur) | `[8]`, au plus une fois toutes les 2 s |
| Prise d'élan d'un piqué contre toi | `[120]` + bordure rouge 0,6 s |
| Clac (engagement contre toi) | `[35]` + flash blanc |
| Ton piqué touche | `[20, 30, 90]` |
| Tu décroches | `[200, 60, 200]` |
| Tu esquives | `[15, 20, 15, 20, 15]` |
| Ton piqué est raté (tu plantes) | `[120, 40, 120]` |
| COUP D'AILE rechargé | `[10]` |
| Tu prends la couronne | `[20, 30, 20, 30, 60]` |
| Collision (oiseau, tour, tempête) | `[15]` |
| Début de la Grande Ombre | `[80, 80, 80]` |
| Chacune des 5 dernières secondes | `[25]` |
| Victoire de manche | `[100, 50, 100, 50, 300]` |

---

## 13. Caméra, HUD, game feel

### 13.1 Caméra

- **Cadrage** : boîte englobante des oiseaux actifs (poids 0,7) et des centres de leurs ombres (poids 1,0). Marges : 12 % à gauche et à droite, 15 % en haut et en bas. Largeur cadrée entre 110 m et la largeur de l'arène + 10 %. Ressorts critiques amortis (position ω = 1,8 rad/s, zoom ω = 1,2 rad/s), zone morte de 4 m.
- **Lacet fixe** (nord en haut) pendant toute la manche. **Tangage** : 58° au zénith, qui descend linéairement jusqu'à 42° à 110 s. Le ciel et l'horizon entrent dans le champ, le couchant devient cinématographique.
- **Dramatisation** : piqué engagé dans le champ, zoom de +8 % vers la paire pendant 0,6 s ; touche, tremblement de 0,15 m et deux images d'impact « encre » ; Grande Ombre, la caméra inclut le front et se décale vers l'est ; nuit, montée à la verticale en 2,5 s pour la vue carte ; vainqueur, plan bas face à l'ouest, oiseau en silhouette devant la lueur derrière la Falaise.
- **Hors champ** : flèche au bord de l'écran, à la couleur du joueur (rare, l'arène tenant à l'écran).

### 13.2 Ralentis

Touche visible : temps de simulation × 0,35 pendant 0,35 s réelles, retour en 0,2 s ; au plus un toutes les 6 s ; aucun pendant les 3 dernières secondes. Dernière seconde : × 0,5. Le ralenti s'applique à toute la simulation (un seul écran) ; les entrées continuent d'arriver.

### 13.3 HUD (TV)

| Élément | Position | Détail |
|---|---|---|
| Cadran solaire (seul chronomètre) | haut gauche, 18 % de la hauteur | quart d'arc du zénith à la silhouette de la Falaise ; le disque le parcourt linéairement en temps ; graduations aux phases ; segment de la Grande Ombre hachuré ; nom de phase 3 s en petites capitales ; aucun chiffre sauf « 5 4 3 2 1 » à la fin |
| Bande de sable | haut centre, 46 % de la largeur, 18 px en 1080p | barre empilée triée par rang (meneur à gauche, couronne au-dessus), puis le neutre ; pourcentage dans chaque segment ≥ 3 % ; animation de 300 ms ; flash du segment d'un voleur qui prend ≥ 3 % |
| Sous-titres du narrateur | bas centre | cartouche de récitatif (Patrick Hand SC), 28 px en 1080p, nom de couleur écrit en encre avec une pastille de sa teinte |
| Dans le monde | — | étiquette de nom sous chaque oiseau (visible les 5 premières secondes, puis lors des événements) ; fil d'ombre ; chevrons ; « +2,4 % » qui s'envolent après un vol ; plumes hérissées ; oiseau assombri s'il est caché ; icône plume (aide au vol) |

Aucun élément de debug.

### 13.4 Son (intentions ; détail dans `assets.md`)

Vent qui varie avec l'altitude et la vitesse, sifflement en piqué, battements en montée, cri à la prise d'élan, clac, impact, « tsk » du pâle sur le fort, grain de sable ∝ m²/s peints par tous (on entend l'accélération du couchant). Musique en couches ajoutées à chaque phase (§ 3), ducking de −6 dB sous le narrateur, coupure nette à la nuit.

---

## 14. Bots

### 14.1 Architecture

Les bots passent par la même couche d'entrée que les humains : un vecteur de joystick et deux boutons, produits à 30 Hz avec un temps de réaction et un bruit propres au niveau. Aucune triche : ils ne lisent que ce que l'écran montre, sans vitesse ni information supplémentaire, et sans élastique caché.

Décision par utilité, à intervalle fixe :
- On évalue 16 caps. Pour chacun : la valeur des cellules sous l'empreinte **de l'ombre** (pas de l'oiseau) à 0,7, 1,4 et 2,1 s, plus la valeur de blocs de 8 m à 25, 50, 80 et 120 m dans ce cap (au point où tombera l'ombre), le tout multiplié par le débit de balayage dans ce cap (`2r·v·(1 + (S − 1)·|sin(cap − direction des ombres)|)`). On pénalise la tempête et les demi-tours.
- Valeur d'une cellule : neutre 1,2 ; adverse prenable 1,0 (1,25 si c'est la couronne) ; à soi pâle quand on est fort 0,35 ; figée ou adverse fort pour une ombre pâle : 0.
- Couche d'altitude (personnalité), couche piqué (cible verrouillée → décider), couche menace (verrouillé → coup d'aile au clac selon le niveau, remonter ou se cacher). L'implémentation de référence de la décision de cap est `bestHeading` dans `validate.mjs`.
- Équité : au plus 2 bots engagés sur un même oiseau par fenêtre de 10 s ; bonus de +50 % au meneur dans le choix des cibles, qu'il soit humain ou bot.

### 14.2 Personnalités (nom affiché « Jade · Faucon » et icône dans le lobby)

| Bot | Étage dominant | Intention | Signe lisible à l'écran | Erreurs crédibles |
|---|---|---|---|---|
| **Le Faucon** (chasseur) | haut | chasse les oiseaux bas, de préférence la couronne ; peint pâle entre deux attaques | décrit un cercle complet (0,8 s au moins) au-dessus de sa proie avant de piquer | pique sur des cibles dont le coup d'aile est prêt ; s'acharne ; oublie de peindre |
| **Le Laboureur** (bâtisseur) | bas | peint fort près de chez lui, scelle devant les ombres des tours ; au couchant, balaie en travers | sillons parallèles espacés de 10 m, comme un tracteur | ne lève jamais la tête ; fuit en ligne droite quand on le vise |
| **La Pie** (pillarde) | bas | fonce sur la plus grosse zone adverse ou sur la couronne, coup d'aile à l'entrée | lignes droites vers la couleur du meneur | gourmande, reste bas sous les chasseurs |
| **Le Nomade** (balayeur) | haut | longs balayages rectilignes en travers des ombres ; premier à partir vers l'est avant la nuit | grandes lignes droites qui traversent l'arène | néglige la défense ; frôle la tempête ; laisse son ombre sortir de l'arène |
| **Le Guetteur** (embusqué) | bas, près des tours | se cache sous les ombrelles, peint devant les éclipses, jaillit sur les oiseaux bas qui passent | cercles serrés dans l'ombre d'une tour, puis sortie brusque | trop passif ; en retard au couchant, quand les refuges disparaissent |
| **Le Fou** (chaos) | variable | zigzags, coups d'aile gratuits, pique sur tout ce qui bouge, looping de célébration | trajectoire chaotique, cri spécifique | rate beaucoup, finit dans le Simoun, gagne parfois par pur hasard |
| **L'Horloger** (Voyageur et Seigneur seulement) | variable | scelle à l'est des tours avant 75 s, se place à l'est avant la Grande Ombre, pique au couchant pour priver l'adversaire | peint des zones que les ombres vont recouvrir | trop méthodique, lent à réagir aux piqués au milieu de la manche |

### 14.3 Niveaux

| Paramètre | Oisillon | Voyageur | Seigneur des sables |
|---|---|---|---|
| Temps de réaction | 550 ms | 300 ms | 160 ms |
| Intervalle de décision | 1,0 s | 0,6 s | 0,35 s |
| Bruit sur le cap | ±20° | ±8° | ±3° |
| Visée avec l'ombre | compense 50 % du décalage | 85 % | 100 % + anticipation du soleil |
| Verrouillage tenu avant de piquer | 1,2 s | 0,6 s | 0,25 s |
| Piqués hors de la bonne géométrie | 30 % | 10 % | 0 % |
| Réaction au clac (coup d'aile) | 0,45 ± 0,15 s, 35 % d'oublis | 0,30 ± 0,05 s, 10 % d'oublis | 0,26 ± 0,03 s, 3 % d'oublis |
| Esquive résultante (d'après § 17-E) | ≈ 15 % | ≈ 45 % | ≈ 75 % |
| Feintes | jamais | 15 % | 35 % |
| Pâle sur fort (sans effet) | 40 % du temps concerné | rarement | jamais |
| Grande Ombre | réagit quand le front arrive | part vers l'est à 95 s | se place dès 90 s et peint devant le front |
| Ombres des tours | les ignore | évite de peindre du figé ; se cache quand il est visé | scelle, exploite les éclipses |
| Erreurs volontaires | 1 toutes les 10 s (tempête, hésitation, oubli de remonter) | 1 toutes les 25 s | 1 toutes les 40 s |
| Choix des victimes | bots ou couronne ; jamais un joueur en aide au vol | couronne puis le plus proche | optimal (grosse traînée, coup d'aile adverse en recharge) |

Composition par défaut : un humain seul reçoit 3 bots Voyageur (Faucon, Laboureur, Nomade) ; deux humains en reçoivent 2 (Pie, Guetteur) ; trois humains, 1 (Faucon) ; à partir de 4 humains, aucun. Un joueur déconnecté est remplacé au bout de 3 s par un bot Voyageur « Laboureur » marqué « (remplaçant »), qui garde sa couleur et son territoire, et lui rend la main dès sa reconnexion.

Cibles de playtest des bots : Seigneur contre 3 Oisillons, au moins 80 % des manches ; Oisillon contre 3 Seigneurs, au moins 1 manche sur 10 ; aucune personnalité au-dessus de 35 % de victoires à 6 Voyageurs.

---

## 15. Apprentissage intégré (aucune explication orale)

1. **Écran titre** : des bots jouent une vraie manche en fond, avec un coucher accéléré (40 s), la caméra de jeu et le pitch à l'écran.
2. **Lobby jouable** : dès qu'un téléphone se connecte, son oiseau vole dans le désert du lobby (arène 90 × 62 m, un parasol, soleil fixe à 60°, territoire remis à zéro toutes les 30 s, un bot mannequin qui tourne au ras du sable). Le téléphone propose trois micro-objectifs à cocher : « Vole » (joystick 2 s), « Plonge » (PLONGER maintenu 1 s : ton ombre fonce), « Pique » (sur le mannequin). Une coche apparaît sur le slot du lobby quand les trois sont faits. Les 3 cartes tournent dans un coin.
3. **Les 3 cartes** avant la première manche de la session (8 s, passables).
4. **Indications contextuelles** pendant la première partie d'un téléphone (mémorisées en localStorage, réglage « Conseils » : Auto, Toujours, Jamais). Bulle à la couleur du joueur près de son oiseau sur la TV, reprise sur son téléphone. Une seule fois chacune, au plus une toutes les 8 s par joueur.

| Déclencheur | Texte FR | Texte EN |
|---|---|---|
| 6 s sans avoir appuyé sur PLONGER | Maintiens PLONGER : ombre petite et forte. | Hold DIVE: small, strong shadow. |
| 8 s d'affilée au ras du sable | Relâche : tu remontes, ombre grande. | Release: you climb, wide shadow. |
| Première cible verrouillée | {color} est sous toi. PLONGER pour piquer ! | {color} is below you. DIVE to strike! |
| Premier piqué subi (prise d'élan) | Au clac : COUP D'AILE ! | On the snap: WINGBEAT! |
| Ombre pâle sur du fort adverse pendant 1,5 s | Trop pâle pour ce sable. Descends. | Too pale for this sand. Go low. |
| Première entrée de son ombre dans l'ombre d'une tour | Ombre de tour : sable figé, et toi caché. | Tower shade: sand frozen, you're hidden. |
| Premier décalage oiseau-ombre > 15 m | Vise avec ton ombre. (le fil pulse) | Aim with your shadow. |
| Première couronne de la partie (tous) | La couronne : la piquer vole deux fois plus. | The crown: diving on it steals double. |
| Début de l'heure dorée (tous, bandeau) | Vole en travers des ombres pour balayer large. (flèche nord-sud) | Fly across the shadows to sweep wide. |
| Début de la Grande Ombre (tous, bandeau) | La nuit fige le sable. File vers l'est → | Night freezes the sand. Head east → |

5. Le narrateur, sous-titré, répète les mêmes idées aux mêmes moments (« Visez avec elles »).

---

## 16. Narrateur

### 16.1 Voix et ton

Conteur du désert : voix grave et posée, phrases courtes, un peu étrange, humour sec. Il ne commente jamais les contrôles. Chaque réplique dure moins de 3 s. Sous-titres toujours affichés, voix désactivable dans les réglages. Voix pré-générées pendant le développement (Piper, disponible via le shell `full` du flake ou le venv `venv-piper/`). Repli : texte seul si la qualité est insuffisante.

### 16.2 Les couleurs dans les répliques

Le joueur est désigné par **le nom de sa couleur, employé comme un nom propre, sans article** (« Corail prend la tête »). Les noms définitifs viennent de la bible artistique. Contraintes d'écriture, respectées par toutes les répliques ci-dessous :
- jamais d'article devant `{color}` (ni « le », ni « la », ni « l' ») ;
- jamais d'adjectif, de participe passé avec « être » ni de pronom (il, elle) qui renverrait à `{color}`. Le passé composé avec « avoir » est permis (« Corail a tout repeint »), pas les verbes pronominaux au passé (« s'est caché·e ») ;
- jamais de « de {color} » ni de « que {color} » (élision devant Indigo, Azur, Anis…). Prépositions permises : « à », « pour », « chez », « sur » ;
- une seule couleur par réplique (12 fichiers audio par modèle au lieu de 132) ;
- en anglais, le nom est aussi nu (« Coral takes the lead ») ; le possessif est `{color}'s`.

Contraintes pour la bible artistique : un seul mot par couleur, deux syllabes de préférence, pas deux noms qui commencent par la même syllabe, une traduction EN courante. Candidats compatibles (Drama) : Carmin/Carmine, Corail/Coral, Safran/Saffron, Anis/Anise, Jade/Jade, Lagon/Lagoon, Azur/Azure, Indigo/Indigo, Lilas/Lilac, Prune/Plum, Rose/Rose, Ardoise/Slate.

Génération : chaque modèle à couleur est pré-généré **phrase entière** pour chaque couleur et chaque langue, parce que recoller un nom au milieu d'une phrase casse la prosodie. 26 modèles à couleur × 12 couleurs × 2 langues = 624 clips, plus 12 répliques neutres × 2 langues = 24 clips. Soit 648 clips de moins de 3 s (≈ 6,5 Mo en Opus 32 kb/s). On ne charge que les couleurs présentes dans la partie.

### 16.3 Règles de fréquence

- Au moins 8 s entre deux répliques ; 3 s pour la priorité 1.
- Au plus 8 répliques par manche, sans compter l'ouverture et les résultats.
- File de priorité : une réplique non jouée 2,5 s après son événement est abandonnée (4 s pour la priorité 1). Un événement plus prioritaire survenu entre-temps passe devant.
- Aucune variante n'est rejouée dans une même partie ; chaque type d'événement a son plafond par manche (tableau).
- Silence pendant le compte à rebours et de 107 à 110 s (place au battement de cœur).
- À priorité égale, on préfère un événement qui concerne un humain ; un événement qui ne concerne que des bots perd un niveau de priorité.
- Musique et ambiance baissées de 6 dB pendant la voix (rampe 80 ms, relâche 400 ms).

### 16.4 Événements et répliques

Priorité 1 = passe toujours ; 5 = remplissage. « Plafond » = nombre maximal par manche (ou par partie, précisé).

| # | Événement (priorité, plafond) | Condition | FR | EN |
|---|---|---|---|---|
| 1 | Ouverture de partie (1) | manche 1, t = 0 | Midi. Le sable n'appartient encore à personne. | Noon. The sand belongs to no one. Yet. |
| 2 | Ouverture de manche (1) | manches suivantes, t = 0 | Le sable a tout oublié. Pas vous. | The sand forgot everything. You didn't. |
| 3 | Dernière manche (1) | avant le compte à rebours de la dernière | Dernier coucher de soleil. Il compte double, et il le sait. | Last sunset. It counts double, and it knows it. |
| 4 | Premier piqué réussi de la manche (3, 1) | | {color} ouvre la chasse. | {color} opens the hunt. |
| 5 | Piqué réussi (3, 2 ; 25 s d'écart) | variante 1 | {color} tombe du ciel. Pile sur quelqu'un. | {color} drops out of the sky. Right on someone. |
| 6 | | variante 2, dite de la victime | {color} goûte au sable. | {color} gets a taste of sand. |
| 7 | Doublé (2, 1) | 2 touches du même oiseau en 4 s | Deux oiseaux en une descente. {color} a de l'appétit. | Two birds, one dive. {color} is hungry. |
| 8 | Série de chasse (3, 1) | 3 touches du même oiseau en 20 s | {color} chasse. Tout le monde regarde le ciel, maintenant. | {color} is hunting. Everyone looks up now. |
| 9 | Esquive (4, 1) | coup d'aile qui fait planter le chasseur | {color} esquive. La serre ne referme que du vent. | {color} dodges. The talons close on air. |
| 10 | Piqué raté (4, 1) | le chasseur plante sans esquive adverse | {color} plante dans le sable. Ça arrive aux meilleurs. | {color} ploughs into the sand. It happens to the best. |
| 11 | Première couronne (2, 1 par partie) | premier meneur de la partie, tenu 2 s | {color} porte la couronne. Elle attire les serres. | {color} wears the crown. Crowns attract talons. |
| 12 | Changement de meneur (2, 3 ; 20 s d'écart) | nouveau meneur tenu 2 s, l'ancien avait tenu ≥ 8 s, t > 15 s | {color} prend la tête. Le sable a la mémoire courte. | {color} takes the lead. Sand has a short memory. |
| 13 | | variante | {color} passe devant. Le soleil, lui, s'en doutait. | {color} moves ahead. The sun saw it coming. |
| 14 | | variante | Le désert change de main. Il est à {color}, pour l'instant. | The desert changes hands. It's {color}'s, for now. |
| 15 | Couronne abattue (2, 1) | la victime d'une touche porte la couronne | Même les couronnes tombent. Demandez à {color}. | Even crowns fall. Ask {color}. |
| 16 | Gros vol (2, 2 ; 20 s d'écart) | ≥ 4 % de l'arène gagnés sur les autres en 3 s | {color} vient d'avaler un morceau de désert. | {color} just swallowed a piece of the desert. |
| 17 | | variante, dite de la plus grosse victime | Une ombre passe. Là-bas, {color} n'a plus grand-chose. | A shadow passes. Over there, {color} has little left. |
| 18 | Traînée volée (3, 1) | un vol de traînée ≥ 2 % de l'arène | Toute une traînée passe à {color}. | A whole trail turns {color}. |
| 19 | Balayage géant (2, 1) | un oiseau gagne ≥ 6 % en 3 s après 85 s | Une seule ombre est passée, et le désert a changé d'avis. | One shadow went by, and the desert changed its mind. |
| 20 | Écart énorme (5, 1) | meneur ≥ 1,8 × le deuxième, après 60 s | {color} prend ses aises. Quelqu'un devrait s'en occuper. | {color} is getting comfortable. Someone should see to that. |
| 21 | Caché longtemps (5, 1) | même oiseau caché ≥ 8 s d'affilée | {color} se repose à l'ombre d'une tour. Sagesse, ou sieste. | {color} rests in a tower's shade. Wisdom, or a nap. |
| 22 | Tempête (5, 1) | oiseau dans la bande du Simoun ≥ 3 s | {color} va voir la tempête de près. Elle ne rend jamais les visites. | {color} pays the storm a visit. The storm never visits back. |
| 23 | Immobile (5, 1 par joueur et par partie) | humain sans entrée depuis 10 s | {color} contemple l'horizon. C'est une stratégie. | {color} is contemplating the horizon. It's a strategy. |
| 24 | Heure dorée (2) | t = 55 s | L'heure dorée. Les ombres prennent de l'ambition. | Golden hour. The shadows are getting ambitious. |
| 25 | Couchant (2) | t = 85 s | Le soleil baisse. Vos ombres s'éloignent de vous. Visez avec elles. | The sun is sinking. Your shadows drift away. Aim with them. |
| 26 | Grande Ombre (1) | t = 98 s | La nuit descend de la falaise. Ce qu'elle touche ne bouge plus. | Night spills off the cliff. What it touches stays put. |
| 27 | Dix secondes (1) | t = 100 s | Dix secondes. Ensuite, plus rien ne bouge. | Ten seconds. Then nothing moves. |
| 28 | Photo-finish (2) | t = 104 s, deux premiers à ≤ 1,5 point | C'est serré. Le dernier rayon tranchera. | It's close. The last ray decides. |
| 29 | Victoire de manche (1) | nuit + 1,5 s ; variante 1 | La nuit est tombée. Le désert est à {color}. | Night has fallen. The desert belongs to {color}. |
| 30 | | variante 2 | Cette nuit, le désert est à {color}. Demain est un autre midi. | Tonight the desert is {color}'s. Tomorrow is another noon. |
| 31 | Victoire écrasante (1) | écart ≥ 12 points | {color} a tout repeint. Le désert n'a pas eu son mot à dire. | {color} repainted everything. The desert had no say. |
| 32 | Arrivée serrée (1) | écart < 1 point | Une poignée de sable d'écart. Les dunes en parleront longtemps. | A handful of sand between them. The dunes will talk about it for years. |
| 33 | Égalité (1) | même nombre de cellules | Égalité. Le désert refuse de choisir. | A tie. The desert refuses to choose. |
| 34 | Dernier rayon (2, résultats) | le vainqueur a fait le plus gros gain de la Grande Ombre | {color} a volé la dernière lumière. | {color} stole the last of the light. |
| 35 | Remontée (2, résultats) | dernier à 80 s, sur le podium à la nuit | {color} partait de loin. Le désert adore ces histoires. | {color} came from far behind. The desert loves that kind of story. |
| 36 | Mirage (2, résultats) | meneur à 98 s, pas vainqueur | {color} menait au couchant. Méfiez-vous des mirages. | {color} led at sunset. Beware of mirages. |
| 37 | Vainqueur de la partie (1) | podium | {color}. Le désert retiendra cette couleur. | {color}. The desert will remember that color. |
| 38 | Revanche (2) | revanche lancée | Le soleil revient toujours. Vous aussi, apparemment. | The sun always comes back. So do you, apparently. |

Aux résultats, une seule réplique parmi 29 à 36 (priorité : 33, 31, 32, 34, 35, 36, puis 29/30), plus éventuellement 37.

En pratique, on entend 5 à 8 répliques par manche.

---

## 17. Validation chiffrée

Script : `docs/research/gdd-validation/validate.mjs` (Node 22, sans dépendance). `node validate.mjs all` prend environ 4 min ; les résultats de référence sont dans `results.md`. Il implémente les règles de ce GDD : soleil, ombres d'oiseaux, peinture binaire avec sous-pas, ombres exactes des tours (enveloppes de cercles), cachette à 90 %, Grande Ombre, piqué (micro-simulation cinématique), vol de traînée, couronne, bots à politiques fixes.

### 17-A. Soleil, ombres et débit de peinture (arène 5-6, 59 093 m²)

| t (s) | e | S | Décalage BAS / HAUT | Longueur d'ombre BAS / HAUT | m²/s BAS travers / axe | m²/s HAUT travers / axe | % d'arène/s BAS / HAUT |
|---|---|---|---|---|---|---|---|
| 0 | 88,0° | 1,00 | 0 / 1 m | 10 / 22 m | 160 / 160 | 462 / 462 | 0,27 / 0,78 |
| 15 | 71,5° | 1,05 | 1 / 6 m | 11 / 23 m | 169 / 160 | 487 / 462 | 0,29 / 0,82 |
| 30 | 56,5° | 1,20 | 3 / 12 m | 12 / 26 m | 192 / 160 | 554 / 462 | 0,32 / 0,94 |
| 55 | 35,1° | 1,74 | 6 / 26 m | 17 / 38 m | 279 / 160 | 804 / 462 | 0,47 / 1,36 |
| 70 | 24,7° | 2,40 | 9 / 39 m | 24 / 53 m | 384 / 160 | 1 107 / 462 | 0,65 / 1,87 |
| 85 | 16,4° | 3,55 | 14 / 61 m | 35 / 78 m | 567 / 160 | 1 638 / 462 | 0,96 / 2,77 |
| 98 | 11,3° | 5,11 | 20 / 90 m | 51 / 112 m | 818 / 160 | 2 362 / 462 | 1,38 / 4,00 |
| 104 | 9,8° | 5,90 | 23 / 105 m | 59 / 130 m | 945 / 160 | 2 727 / 462 | 1,60 / 4,62 |
| 110 | 9,0° | 6,39 | 25 / 114 m | 64 / 141 m | 1 023 / 160 | 2 953 / 462 | 1,73 / 5,00 |

Glissement de l'ombre d'un oiseau haut dû au seul soleil : 0,4 m/s à 30 s, 1,9 m/s à 85 s, 2,5 m/s à 98 s. Coup de fouet : 15, 31, 75, 110 et 137 m/s en descente à 30, 55, 85, 98 et 108 s.

### 17-B. Arène : traversées

| N | Traversée E-O en haut / en bas | Traversée N-S en haut | Largeur cadrée max | Vitesse du front de nuit |
|---|---|---|---|---|
| 1-2 | 10,5 / 13,8 s | 7,2 s | 242 m | 18,3 m/s |
| 3 | 12,2 / 16,0 s | 8,4 s | 282 m | 21,3 m/s |
| 4 | 13,5 / 17,8 s | 9,3 s | 312 m | 23,7 m/s |
| 5-6 | 15,7 / 20,6 s | 10,9 s | 363 m | 27,5 m/s |
| 7-9 | 17,9 / 23,5 s | 12,4 s | 414 m | 31,3 m/s |
| 10-12 | 20,0 / 26,3 s | 13,8 s | 462 m | 35,0 m/s |

### 17-C. Ombres des tours : longueur de la pointe (depuis le pied)

| t (s) | e | H = 28 m | H = 36 m | H = 46 m | H = 58 m | H = 70 m | Géante 108 m | Vitesse de la pointe (46 m) |
|---|---|---|---|---|---|---|---|---|
| 0 | 88,0° | 1 m | 1 m | 2 m | 2 m | 2 m | 4 m | 0,9 m/s |
| 30 | 56,5° | 19 m | 24 m | 30 m | 38 m | 46 m | 72 m | 1,1 m/s |
| 55 | 35,1° | 40 m | 51 m | 66 m | 83 m | 100 m | 154 m | 1,8 m/s |
| 70 | 24,7° | 61 m | 78 m | 100 m | 126 m | 152 m | 235 m | 2,9 m/s |
| 85 | 16,4° | 95 m | 122 m | 156 m | 197 m | 238 m | 367 m | 4,8 m/s |
| 98 | 11,3° | 140 m | 180 m | 231 m | 291 m | 351 m | 541 m | 6,4 m/s |
| 110 | 9,0° | 177 m | 227 m | 290 m | 366 m | 442 m | 682 m | 0,9 m/s |

### 17-D. Part de l'arène sous l'ombre des tours

Voir le tableau du § 9.4 (4 cartes). À 104 s, la nuit s'y ajoute : 57 à 64 % de l'arène est figée. Selon la taille d'arène (carte Les Parasols mise à l'échelle), la couverture reste de 4,4 à 6,2 % à midi et de 15 à 19 % à 98 s. Cachettes : 1,5 à 3,2 % des positions pour un oiseau bas jusqu'à 85 s, 0,3 % à 98 s ; moins de 1 % pour un oiseau haut.

### 17-E. Piqué (micro-simulation cinématique, 2 000 piqués par mesure)

- Sans réaction de la cible : 95,8 % de touches. Durée moyenne d'un piqué, prise d'élan comprise : 0,87 s. Intervalle clac → contact : 0,44 à 0,53 s (médiane 0,49 s).
- Tourner en rond au virage maximal : 100 % de touches. Contre-virage 0,1 / 0,2 / 0,3 s après le clac : 0 / 6 / 45 %.
- Réaction au clac avec un coup d'aile, latence comprise :

| Réaction | 0,10 s | 0,20 s | 0,25 s | 0,30 s | 0,35 s | 0,40 s |
|---|---|---|---|---|---|---|
| P(touche) | 0 % | 2 % | 13 % | 52 % | 87 % | 96 % |

- Sensibilité (réaction de 0,30 s) : `flapImpulse` 18 m/s → 83 % de touches, 26 m/s → 25 % ; `diveCommitLead` 0,60 s → 83 %, 0,70 s → 15 % ; `diveHitRadius` 4,5 m → 82 %, 3,5 m → 12 %. **`diveCommitLead` est le levier le plus fin** pour régler la difficulté de l'esquive.

### 17-F. Manches complètes de bots (12 manches par ligne, positions tournantes, carte Les Parasols)

Politiques : `low` toujours bas, ne pique jamais ; `high` toujours haut, pique dès qu'il a une cible ; `mixed` choisit l'étage selon le terrain devant lui et remonte quand on le vise ; `hunter` haut, chasse les oiseaux bas ; `adapt` haut avant 55 s, bas après. Esquive des bots : 35 à 45 %.

| Composition | Part finale moyenne | Victoires |
|---|---|---|
| 6 oiseaux, une politique chacun | low 11,8 · high 16,6 · mixed 16,0 · hunter 11,9 · adapt 10,1 · mixed 16,0 % | mixed 33 + 33, low 17, high 17, hunter 0, adapt 0 % |
| 4 : low / high / mixed / hunter | 19,7 / 19,2 / 24,3 / 19,6 % | mixed 58 %, les autres 8 à 17 % |
| 4 : 3 high + 1 low | high 14,6-17,5 %, **low 37,2 %** | low 100 % |
| 4 : 3 low + 1 high | low 16,5-19,1 %, **high 27,8 %** | high 75 % |
| 4 : 3 low + 1 hunter | low 13,4-14,2 %, **hunter 22,3 %** | hunter 67 % |
| Duel low / high | 55,5 / 28,5 % | low 92 % |
| Duel low / mixed | 25,6 / 50,6 % | mixed 100 % |
| Duel high / mixed | 34,5 / 43,9 % | mixed 75 % |
| Duel mixed / hunter | 41,0 / 36,6 % | mixed 67 % |
| Duel low / hunter | 36,3 / 36,7 % | 50 / 50 % |

Lecture : aucune politique pure ne domine. **La stratégie minoritaire gagne** (un seul bas parmi trois hauts, un seul haut parmi trois bas), et le bot qui s'adapte au terrain est le meilleur. En duel, c'est un pierre-feuille-ciseaux : le bas bat le haut qui ne chasse pas, le chasseur tient le bas en respect, l'adaptatif bat les deux.

Tension, contact et piqués (tous `mixed` sauf un `hunter`) :

| Configuration | Neutre à 45 s | Meneur à 60 / 90 / 98 s vainqueur | Volé pendant la Grande Ombre | Écart final 1er-2e | Changements de meneur | Manches avec changement après 90 s | Plus proche voisin | Piqués / manche | Touches | Traînée par touche |
|---|---|---|---|---|---|---|---|---|---|---|
| 6 oiseaux | 35 % | 17 / 33 / 50 % | 28,9 % | 3,7 pt | 12,9 | 92 % | 40 m | 6,1 | 60 % | 1 149 m² |
| 4 oiseaux | 38 % | 42 / 42 / 17 % | 22,9 % | 3,5 pt | 11,7 | 100 % | 41 m | 5,8 | 57 % | 1 359 m² |
| 2 oiseaux | 37 % | 58 / 83 / 58 % | 17,5 % | 10,3 pt | 6,1 | 58 % | 54 m | 2,3 | 50 % | 1 369 m² |
| 4 oiseaux, 3 low + 1 hunter (borne haute) | 60 % | 42 / 42 / 58 % | 16,8 % | 5,9 pt | 6,4 | 67 % | 34 m | 24,6 | 65 % | 311 m² |
| 6 oiseaux, sans tours | 36 % | 8 / 17 / 42 % | 32,4 % | 5,8 pt | 12,1 | 92 % | 34 m | 3,3 | 41 % | 2 112 m² |
| 6 oiseaux, Le Cadran | 34 % | 17 / 50 / 67 % | 28,3 % | 4,3 pt | 11,2 | 75 % | 38 m | 2,8 | 52 % | 1 585 m² |
| 12 oiseaux | 30 % | 8 / 25 / 50 % | 31,1 % | 3,0 pt | 12,6 | 75 % | 35 m | 7,8 | 41 % | 1 112 m² |

Fréquence des piqués possibles. Un oiseau haut qui vole au hasard balaie une zone de verrouillage d'environ `2 × 26 m × sin 70° × 21 m/s ≈ 1 030 m²/s`, soit une rencontre par minute et par oiseau bas présent dans l'arène 5-6 (3 oiseaux bas : environ 3 cibles par minute). Un chasseur qui poursuit en trouve 24 par minute passée en haut et lance 25 piqués par manche (ligne « borne haute ») ; ses touches rapportent peu (311 m²) parce que des oiseaux qui restent bas repassent sur leur propre sable. Les bots `mixed` restent haut jusqu'à 60-70 s puis descendent : 2 à 8 piqués par manche. Des humains piqueront davantage ; la cible de playtest est de 8 à 15 piqués par manche à 6.

### 17-G. Leviers de la fin de manche (6 oiseaux, 12 manches par ligne)

| Variante | Meneur à 60 / 90 / 98 s vainqueur | Volé pendant la Grande Ombre | Territoire final déjà à son propriétaire à 60 s |
|---|---|---|---|
| **GDD** (fin à 9°, Grande Ombre de 12 s, Parasols) | 17 / 33 / 50 % | 28,9 % | 27 % |
| Fin à 12° (S max 4,8) | 17 / 50 / 67 % | 26,9 % | 30 % |
| Grande Ombre de 6 s | 8 / 25 / 25 % | 21,4 % | 26 % |
| Grande Ombre de 18 s | 17 / 17 / 42 % | 34,5 % | 27 % |
| Carte Les Géantes | 17 / 8 / 25 % | 27,1 % | 31 % |
| Traînée volée de 3 s | 17 / 42 / 25 % | 28,5 % | 27 % |
| Sans tours | 8 / 17 / 42 % | 32,4 % | 24 % |

Lecture : la fin est très ouverte (le meneur à 98 s gagne une manche sur deux à 6, trois fois le hasard), sans effacer le début (un quart du territoire final date d'avant 60 s, et les tours en ajoutent). Le bruit est de l'ordre de ±15 points sur 12 manches : ces leviers sont des directions de réglage, pas des mesures. Si les playtests trouvent que le début ne compte pas, on remonte d'abord `sunElevEndDeg` (fin à 11-12°), puis on choisit des cartes plus couvrantes.

**Limites** : bots simplistes (pas de coup d'aile, pas de cachette volontaire, esquive tirée au sort), pas de collisions. À refaire avec les vrais bots du jeu (50 manches par taille d'arène) avant de figer les valeurs.

---

## 18. Risques et critères de playtest

| Risque | Parade dans ce GDD |
|---|---|
| La fin efface tout, le début ne compte pas | Le fort résiste au pâle ; tours et nuit figent ; points au rang ; mesure : 27 % du territoire final est acquis avant 60 s. Leviers : `sunElevEndDeg`, cartes plus couvrantes. |
| Fin illisible (ombres loin de leur oiseau) | Fin à 9° (décalage ≤ 114 m), fil d'ombre, liseré de couleur, caméra qui cadre les ombres, réplique « Visez avec elles », indication « Vise avec ton ombre ». |
| Tout le monde reste haut | Le pâle ne touche pas au fort ; un seul oiseau bas prend tout (37 % contre 15 %). |
| Tout le monde reste bas | Un seul oiseau haut qui chasse gagne (hunter 67 % contre trois bas). |
| Enfant piqué en boucle | Immunité de 2,5 s (4 s avec l'aide au vol), haut toujours sûr, aide au vol visible, bots faciles qui visent d'autres cibles, 2 bots au plus par cible. |
| Piqué injuste à cause de la latence | Prise d'élan + clac (≥ 0,85 s de préavis), fenêtre de 0,3 s, grâce de latence (§ 8.6). |
| Camper dans l'ombre des tours | On n'y peint rien ; les refuges bougent et disparaissent au couchant (0,3 % de cachettes à 98 s) ; réplique moqueuse. |
| Joueurs éparpillés | Arène à l'écran, neutre qui s'épuise, couronne, Grande Ombre ; levier de réserve : resserrement du Simoun. |
| Chaos illisible à 12 | Arène plus grande, oiseaux ≥ 46 px, un chevron par cible, étiquettes seulement lors des événements, narrateur plafonné. |
| Débutant perdu | Ne rien faire = voler haut et peindre grand ; lobby à micro-objectifs ; 3 cartes ; indications contextuelles. |
| Règles cachées | Table des signes (§ 2) : chaque règle a un signe visible et un son. |
| Daltonisme | Motif de hachure par joueur (territoire, liseré, écharpe de l'oiseau), noms toujours écrits. |
| Ombres d'oiseaux physiquement fausses | Ombre de sphère assumée, identique au rendu et au gameplay. |

Critères à mesurer sur des parties complètes de bots Voyageur (automatisées) et en playtest :
- sable neutre < 40 % à 45 s (6 oiseaux) ;
- couverture des tours dans les fourchettes du § 9.3 ;
- meneur à 98 s vainqueur dans 45 à 70 % des manches ; territoire final acquis avant 60 s ≥ 25 % ;
- au moins un changement de meneur après 90 s dans 60 % des manches ;
- 8 à 15 piqués par manche à 6 oiseaux, 35 à 55 % de touches ; aucun oiseau touché plus de 5 fois dans une manche ;
- part du temps passée en bas entre 30 et 60 % (tous joueurs confondus) ; si un étage domine, rééquilibrer d'abord `speedLow` / `speedHigh`, puis `shadowRadiusHigh` ;
- distance moyenne au plus proche voisin (30-90 s) < 70 m ;
- 60 fps stables avec 12 oiseaux.

---

## 19. Constantes de tuning

À coder telles quelles dans `rules.ts` (simulation) ; les valeurs de la colonne font foi. Les instants sont donnés pour `T = 110 s` et se mettent à l'échelle `× T/110` pour les autres durées.

### 19.1 Temps, manche, partie

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `tickHz` | 30 | Hz | Tick fixe de la simulation ; rendu interpolé à 60 fps |
| `roundSunSeconds` | 110 | s | Manche d'environ 2 min ; valeur retenue par Party et Drama |
| `roundLengthPresets` | { short: 80, normal: 110, long: 150 } | s | Réglage de partie ; phases mises à l'échelle |
| `countdownSeconds` | 3 | s | « 3, 2, 1, Envol ! » |
| `nightHoldSeconds` | 2 | s | Gel et silence avant les résultats |
| `interludeMaxSeconds` | 15 | s | Écran entre manches, passable |
| `roundsDefault` | 3 | manches | Partie d'environ 7 min |
| `roundsOptions` | [1, 3, 5] | manches | Réglage de partie |
| `lastRoundMultiplier` | 2 | × | Garde la partie ouverte |
| `winnerBonusSuns` | 1 | soleil | Gagner vaut plus que finir deuxième |
| `rematchVoteSeconds` | 15 | s | Revanche automatique si au moins un vote |
| `playerDropToBotSeconds` | 3 | s | Remplacement d'un joueur déconnecté |

### 19.2 Soleil et phases

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `sunElevStartDeg` | 88 | ° | Les ombres ont une direction dès la première seconde |
| `sunElevEndDeg` | 9 | ° | Décalage max 114 m, cadrable ; soleil derrière la Falaise |
| `sunElevGamma` | 1,6 | — | `e = end + (start − end)(1 − u)^γ` : heure dorée à 35° à 55 s |
| `sunAzStartDeg` | 240 | ° | Soleil au sud-ouest, ombres vers le haut à droite |
| `sunAzEndDeg` | 270 | ° | Couchant plein ouest, ombres vers la droite |
| `sunAzEaseExp` | 2 | — | `az = end − (end − start)(1 − u)²` : les ombres cessent de tourner quand elles comptent |
| `phaseAfternoonAt` | 15 | s | Fin de la ruée de midi |
| `phaseGoldenAt` | 55 | s | S = 1,74 |
| `phaseSunsetAt` | 85 | s | S = 3,55 |
| `greatShadowAt` | 98 | s | Début du front de nuit (12 s) |
| `tenSecondsAt` | 100 | s | Annonce « Dix secondes » |
| `photoFinishAt` | 104 | s | Test du photo-finish |
| `greatShadowJagAmp` | 6 | m | Profil dentelé du front (silhouette de la mesa) |
| `lastSecondTimeScale` | 0,5 | × | Dernière seconde au ralenti |
| `stretchMax` | 6,5 | × | Sécurité ; `S` atteint 6,39 à 9° |

### 19.3 Arène et grille

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `arenaPresets` | [{maxBirds: 2, a: 110, b: 76, towers: 5}, {3, 128, 88, 5}, {4, 142, 98, 6}, {6, 165, 114, 7}, {9, 188, 130, 8}, {12, 210, 145, 9}] | m | 8 000 à 13 000 m² par oiseau ; arène entière à l'écran ; oiseau ≥ 46 px |
| `gridCols` | 512 | cellules | Contrainte technique du lead |
| `gridRows` | 352 | cellules | 512 × b/a arrondi à 8 |
| `stormSoftFrom` | 0,92 | rayon elliptique | Début du rappel vers le centre |
| `stormTurnDegPerS` | 115 | °/s | Rappel ferme sans téléportation |
| `stormHardAt` | 1,0 | rayon elliptique | Mur dur |
| `spawnRingFrac` | 0,45 | rayon elliptique | Premiers contacts dans les 10 premières secondes |
| `spawnSplashRadius` | 8 | m | Tache forte de départ, pour repérer sa couleur |
| `spawnMinTowerDist` | 25 | m | Pas d'apparition collée à un fût |
| `towerMinSpacing` | 45 | m | On slalome à deux entre deux fûts |
| `towerEdgeMargin` | 15 | m | Pas de fût dans le Simoun |
| `towerWideMinZ` | 24 | m | Rien de large en dessous : on ne heurte que des fûts |
| `towerLowMaxRadius` | 5 | m | Rayon maximal d'une tour sous `towerWideMinZ` |
| `towerWideRadiusScaleExp` | 0,5 | — | Rayons larges × (a/165)^0,5 selon le preset |
| `towerMaskHz` | 10 | Hz | Recalcul du masque des ombres de tours (pointe ≤ 6,4 m/s) |
| `simounShrinkEnabled` | false | — | Levier de réserve contre l'éparpillement |
| `simounShrinkTo` | 0,85 | rayon elliptique | Resserrement si activé, entre 40 et 98 s |

### 19.4 Oiseau

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `altLow` | 4 | m | Ras du sable : les ailes soulèvent du sable |
| `altHigh` | 18 | m | Plafond ; ombre de 11 m |
| `strongMaxAlt` | 11 | m | Seuil FORT / PÂLE, à mi-chemin |
| `descendRate` | 22 | m/s | Descente en 0,64 s : plonger est un réflexe |
| `climbRate` | 8 | m/s | Montée en 1,75 s : phase vulnérable |
| `speedLow` | 16 | m/s | Le bas plus lent équilibre haut et bas (§ 17-F) |
| `speedHigh` | 21 | m/s | Traversée de l'arène 5-6 en 16 s |
| `speedTau` | 0,25 | s | Lissage de la vitesse |
| `turnLowDegPerS` | 140 | °/s | Rayon ≈ 6,5 m en bas |
| `turnHighDegPerS` | 105 | °/s | Rayon ≈ 11,5 m en haut |
| `yawAccelDegPerS2` | 720 | °/s² | Réponse vive sans à-coup |
| `stickDeadzone` | 0,2 | fraction | Sous ce seuil, on garde le cap |
| `wingspan` | 11 | m | Visuel ; taille à l'écran |
| `birdRenderScaleMax` | 1,3 | × | Grossissement cosmétique au dézoom max |
| `bumpDist` | 6 | m | Collision entre oiseaux |
| `bumpDz` | 3 | m | Seulement à altitude voisine |
| `bumpImpulse` | 5 | m/s | Poussée sans effet de jeu |
| `towerCollisionMargin` | 2,5 | m | Ajoutée au rayon du fût |
| `towerSlideSlow` | 0,3 | fraction | Perte de vitesse au contact |
| `towerSlideTime` | 0,3 | s | Durée du ralentissement |
| `towerAvoidAssistDeg` | 15 | ° | Déviation automatique si impact imminent |
| `towerAvoidLookahead` | 0,5 | s | Horizon de l'aide d'évitement |
| `flapImpulse` | 22 | m/s | Esquive ≈ 6,6 m > rayon de touche (§ 17-E) |
| `flapDuration` | 0,3 | s | Durée de l'impulsion |
| `flapCooldown` | 3,0 | s | Un coup d'aile par piqué, pas de spam |
| `inputBufferSeconds` | 0,15 | s | Appui mis en tampon pendant une transition |

### 19.5 Ombre et peinture

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `shadowRadiusLow` | 5 | m | Débit de 160 m²/s au zénith |
| `shadowRadiusHigh` | 11 | m | Débit de 462 m²/s au zénith (× 2,9 le bas) |
| `shadowOpacityStrong` | 0,85 | — | Lecture FORT |
| `shadowOpacityPale` | 0,40 | — | Lecture PÂLE |
| `shadowSoftEdge` | 0,5 | m | Bord adouci ; la ligne à 50 % est le contour qui peint |
| `shadowRimWidth` | 0,5 | m | Liseré à la couleur du joueur |
| `shadowThreadMinOffset` | 8 | m | Fil oiseau → ombre au-delà de ce décalage |
| `paintMaxStepMeters` | 1,0 | m | Sous-pas : aucune cellule sautée (fouet à 137 m/s) |
| `levelPale` | 1 | — | Code de niveau |
| `levelStrong` | 2 | — | Code de niveau |
| `palePaintAlpha` | 0,45 | — | Teinte du territoire pâle |
| `hideCoverFrac` | 0,9 | fraction | Caché si 90 % de l'ombre est à l'ombre (tours ou nuit) |
| `hideSamplePoints` | 13 | points | Centre + 6 à mi-rayon + 6 au bord |
| `trailBufferSeconds` | 3,0 | s | Historique des empreintes (vol de traînée couronne) |

### 19.6 Piqué

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `diveLockDz` | 6 | m | Il faut dominer sa cible ; un oiseau qui remonte reste vulnérable jusqu'à 12 m |
| `diveLockRange` | 26 | m | Proximité ; ≈ 3 cibles/min pour un oiseau haut au hasard |
| `diveLockConeDeg` | 70 | ° | On pique devant soi |
| `diveLockNoConeDist` | 3 | m | Juste au-dessus, pas de cône |
| `diveWindup` | 0,2 | s | Prise d'élan : préavis visible et vibrant |
| `diveHSpeed` | 30 | m/s | Chute guidée ; piqué moyen de 0,87 s |
| `diveTurnDegPerS` | 150 | °/s | Guidage avant le clac |
| `diveCommitLead` | 0,65 | s | Clac ≈ 0,49 s avant le contact ; esquive réaliste (§ 17-E) |
| `diveMaxTime` | 1,4 | s | Au-delà, raté |
| `diveHitRadius` | 4,0 | m | Distance 3D entre centres |
| `diveHitMaxBelow` | 1 | m | Le chasseur doit arriver d'au-dessus |
| `stunHit` | 1,5 | s | Décrochage de la victime |
| `stunDriftSpeed` | 8 | m/s | Dérive pendant le décrochage |
| `immunityAfterStun` | 2,5 | s | Anti-acharnement |
| `trailStealSeconds` | 1,5 | s | Récompense : 240 m² à midi, ~1 500 m² au couchant |
| `trailStealCrownSeconds` | 3,0 | s | Piquer la couronne vole le double |
| `trailStealWaveSeconds` | 0,4 | s | Animation de la vague de couleur |
| `diveReboundDz` | 6 | m | Rebond du chasseur après une touche |
| `missStun` | 1,0 | s | « Raté, c'est toi qui décroches » |
| `diveCooldown` | 1,0 | s | Après toute fin de piqué |
| `latencyGraceMax` | 0,1 | s | Grâce de latence pour l'esquive d'un téléphone |
| `maxBotsPerTarget` | 2 | bots | Équité |
| `botTargetWindow` | 10 | s | Fenêtre de la règle précédente |
| `lockChevronsPerTarget` | 1 | chevron | Lisibilité à 12 |

### 19.7 Couronne, score, titres

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `crownHysteresis` | 2 | s | Pas de clignotement |
| `bigStealFrac` | 0,03 | fraction d'arène | Flash du segment du voleur dans la bande de sable |
| `titleRapaceMin` | 3 | touches | Seuil de titre |
| `titleGibierMin` | 3 | décrochages | Seuil de titre |
| `titleAnguilleMin` | 2 | esquives | Seuil de titre |
| `titleKamikazeMin` | 3 | ratés | Seuil de titre |
| `titlePilleurMinFrac` | 0,08 | fraction d'arène | Seuil de titre (cumul sur la partie) |
| `titleRaseMottesMinFrac` | 0,5 | fraction du temps | Seuil de titre |
| `titleNuageMinFrac` | 0,75 | fraction du temps | Seuil de titre |
| `titleBatisseurMinFrac` | 0,4 | fraction | Seuil de titre |
| `titleNotaireMinFrac` | 0,03 | fraction d'arène | Seuil de titre |
| `titleLezardMinSeconds` | 15 | s | Seuil de titre |
| `titleRevenantMinPlaces` | 2 | places | Seuil de titre |

### 19.8 Caméra, ralentis, HUD

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `camPitchStartDeg` | 58 | ° | L'ombre du midi apparaît sous l'oiseau |
| `camPitchEndDeg` | 42 | ° | Horizon et ciel au couchant |
| `camBirdWeight` | 0,7 | — | Poids des oiseaux dans le cadrage |
| `camShadowWeight` | 1,0 | — | Poids des centres d'ombre |
| `camMarginX` | 0,12 | fraction | Marges gauche et droite |
| `camMarginY` | 0,15 | fraction | Marges haut et bas |
| `camMinWidth` | 110 | m | Zoom maximal |
| `camMaxWidthFactor` | 1,1 | × largeur d'arène | Dézoom maximal |
| `camPosOmega` | 1,8 | rad/s | Ressort de position |
| `camZoomOmega` | 1,2 | rad/s | Ressort de zoom |
| `camDeadzone` | 4 | m | Pas de micro-mouvements |
| `camDiveZoom` | 0,08 | fraction | Zoom vers un piqué engagé |
| `camDiveZoomSeconds` | 0,6 | s | Durée de ce zoom |
| `camShakeAmp` | 0,15 | m | Tremblement à la touche |
| `camNightRiseSeconds` | 2,5 | s | Montée en vue carte |
| `hitSlowmoScale` | 0,35 | × | Ralenti de touche |
| `hitSlowmoSeconds` | 0,35 | s (réelles) | Durée du ralenti |
| `hitSlowmoRampSeconds` | 0,2 | s | Retour à la normale |
| `hitSlowmoMinGap` | 6 | s | Pas de ralentis en rafale |
| `noSlowmoLastSeconds` | 3 | s | Réservé au ralenti final |
| `hudDialHeightFrac` | 0,18 | fraction d'écran | Cadran solaire |
| `hudBarWidthFrac` | 0,46 | fraction d'écran | Bande de sable |
| `hudBarHeightPx` | 18 | px (1080p) | Bande de sable |
| `hudSegmentLabelMinFrac` | 0,03 | fraction | Pourcentage écrit dans le segment |
| `hudBarAnimMs` | 300 | ms | Animation de la bande |
| `phaseBannerSeconds` | 3 | s | Nom de phase |
| `nameTagSeconds` | 5 | s | Étiquettes au départ |
| `subtitleSeconds` | 3 | s | Sous-titre du narrateur |
| `subtitlePx` | 28 | px (1080p) | Taille du sous-titre |

### 19.9 Narrateur et indications

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `narratorMinGap` | 8 | s | Rare, jamais bavard |
| `narratorUrgentGap` | 3 | s | Priorité 1 |
| `narratorMaxPerRound` | 8 | répliques | Hors ouverture et résultats |
| `narratorStaleSeconds` | 2,5 | s | Une réplique en retard est abandonnée |
| `narratorUrgentStaleSeconds` | 4 | s | Priorité 1 |
| `narratorQuietFrom` | 107 | s | Silence avant la nuit |
| `narratorDuckDb` | −6 | dB | Musique sous la voix |
| `narratorDuckAttackMs` | 80 | ms | Rampe du ducking |
| `narratorDuckReleaseMs` | 400 | ms | Relâche du ducking |
| `leaderChangeStableSeconds` | 2 | s | Nouveau meneur confirmé |
| `leaderChangePrevHoldSeconds` | 8 | s | L'ancien meneur avait vraiment mené |
| `leaderChangeMinGap` | 20 | s | Entre deux annonces de meneur |
| `leaderChangeMaxPerRound` | 3 | répliques | Plafond |
| `bigStealFracNarr` | 0,04 | fraction d'arène en 3 s | « Gros vol » |
| `hugeSweepFrac` | 0,06 | fraction d'arène en 3 s | « Balayage géant », après 85 s |
| `trailStealNarrFrac` | 0,02 | fraction d'arène | « Traînée volée » |
| `diveHitNarrMinGap` | 25 | s | Entre deux piqués annoncés |
| `doubleHitWindow` | 4 | s | Doublé |
| `huntStreakHits` | 3 | touches | Série de chasse |
| `huntStreakWindow` | 20 | s | Série de chasse |
| `hiddenLongSeconds` | 8 | s | « Caché longtemps » |
| `stormLongSeconds` | 3 | s | « Tempête » |
| `idleSeconds` | 10 | s | « Immobile » |
| `runawayRatio` | 1,8 | × | « Écart énorme » après 60 s |
| `photoFinishGap` | 0,015 | fraction d'arène | Photo-finish à 104 s |
| `closeFinishGap` | 0,01 | fraction d'arène | Arrivée serrée |
| `landslideGap` | 0,12 | fraction d'arène | Victoire écrasante |
| `comebackFromLastAt` | 80 | s | « Remontée » : dernier à cet instant |
| `hintMinGap` | 8 | s | Une indication à la fois |
| `hintNoDiveAfter` | 6 | s | Indication « Maintiens PLONGER » |
| `hintLowTooLong` | 8 | s | Indication « Relâche » |
| `hintPaleOnStrongSeconds` | 1,5 | s | Indication « Trop pâle » |
| `hintShadowOffsetMin` | 15 | m | Indication « Vise avec ton ombre » |

### 19.10 Contrôles, réseau

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `joystickRadiusPx` | 70 | px CSS | Pouce adulte et enfant |
| `buttonDiveHeightFrac` | 0,38 | fraction de hauteur | PLONGER est maintenu : le plus gros |
| `buttonFlapHeightFrac` | 0,28 | fraction de hauteur | COUP D'AILE |
| `pauseLongPressSeconds` | 1 | s | Pas de pause accidentelle |
| `tiltDeadzoneDeg` | 5 | ° | Mode inclinaison |
| `tiltMaxDeg` | 20 | ° | Plein effet |
| `lockTickMinGapSeconds` | 2 | s | Vibration « verrouillé » |
| `inputSendHz` | 30 | Hz | Au changement, plus un battement à 1 Hz |
| `wsPingSeconds` | 25 | s | Sous le timeout de 300 s du proxy |

### 19.11 Aide au vol

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `assistLockRange` | 34 | m | Piqué plus facile pour les enfants |
| `assistLockConeDeg` | 85 | ° | Idem |
| `assistAvoidDeg` | 30 | ° | Évitement des tours et du Simoun |
| `assistImmunity` | 4 | s | Anti-acharnement renforcé |
| `assistAutoFlapChance` | 0,5 | probabilité | Coup d'aile automatique au clac |

### 19.12 Bots (valeurs par niveau : [Oisillon, Voyageur, Seigneur des sables])

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `botReactionMs` | [550, 300, 160] | ms | Temps de réaction perçu |
| `botDecisionSeconds` | [1,0, 0,6, 0,35] | s | Replanification |
| `botHeadingNoiseDeg` | [20, 8, 3] | ° | Imprécision |
| `botShadowAimComp` | [0,5, 0,85, 1,0] | fraction | Compensation du décalage de l'ombre |
| `botLockHoldSeconds` | [1,2, 0,6, 0,25] | s | Verrouillage tenu avant de piquer |
| `botBadDiveChance` | [0,3, 0,1, 0] | probabilité | Piqués hors de la bonne géométrie |
| `botFlapReactMeanS` | [0,45, 0,30, 0,26] | s | Réaction au clac (§ 17-E) : esquive ≈ 15 / 45 / 75 % |
| `botFlapReactSdS` | [0,15, 0,05, 0,03] | s | Dispersion |
| `botFlapForgetChance` | [0,35, 0,10, 0,03] | probabilité | Oubli d'esquiver |
| `botFeintChance` | [0, 0,15, 0,35] | probabilité | Feinte avant le clac |
| `botPaleOnStrongChance` | [0,4, 0,1, 0] | probabilité | Erreur « pâle sur fort » |
| `botNightLeaveAt` | [null, 95, 90] | s | Départ vers l'est avant le front |
| `botErrorEverySeconds` | [10, 25, 40] | s | Erreurs volontaires crédibles |
| `botCircleBeforeDiveSeconds` | 0,8 | s | Signature du Faucon |
| `botFurrowSpacing` | 10 | m | Signature du Laboureur |
| `botLeaderBias` | 0,5 | + fraction | Préférence pour la couronne |
| `botBlockSize` | 8 | m | Carte de valeur pour le cap lointain |
| `botValueNeutral` | 1,2 | — | Ruée sur le neutre |
| `botValueSteal` | 1,0 | — | Vol d'une cellule prenable |
| `botValueStealCrown` | 1,25 | — | Vol chez la couronne |
| `botValueUpgradeOwn` | 0,35 | — | Renforcer son pâle |

### 19.13 Lobby et onboarding

| Nom | Valeur | Unité | Justification |
|---|---|---|---|
| `lobbyArenaA` | 90 | m | Petit désert du lobby (demi-grand axe) |
| `lobbyArenaB` | 62 | m | Demi-petit axe |
| `lobbySunElevDeg` | 60 | ° | Soleil fixe |
| `lobbyResetSeconds` | 30 | s | Territoire remis à zéro |
| `lobbyGoalFlySeconds` | 2 | s | Micro-objectif « Vole » |
| `lobbyGoalDiveHoldSeconds` | 1 | s | Micro-objectif « Plonge » |
| `rulesCardsSeconds` | 8 | s | Les 3 cartes avant la manche 1 |
| `titleDemoSunSeconds` | 40 | s | Coucher accéléré de l'écran titre |

---

## 20. Décisions (pour DECISIONS.md)

1. **Base Drama, greffes Party et Depth** : meilleure note (64/80), dramaturgie et lisibilité déjà spécifiées.
2. **Cinq règles, toutes visibles** (§ 0) ; aucune autre, table des signes en § 2 : c'est l'exigence du brief « pas de règle cachée ».
3. **Deux altitudes de croisière, 4 m et 18 m, transitions continues** (descente 22 m/s, montée 8 m/s) : « haut ou bas » se lit sur un écran partagé, les transitions gardent la physique.
4. **PLONGER maintenu = bas, relâché = haut ; COUP D'AILE en second bouton** : ne rien faire reste jouable, relâcher met à l'abri, deux boutons au total.
5. **Peinture binaire FORT (≤ 11 m) / PÂLE, instantanée ; seule exception : le pâle ne recouvre pas le fort** : deux valeurs se comparent d'un coup d'œil.
6. **Ombre d'oiseau = ombre de sphère** (`r = 5 → 11 m`, étirée de `1/sin e`, décalée de `h·cot e`), identique au rendu et au gameplay : les ombres s'allongent comme l'exige le brief.
7. **Soleil : 110 s, `e = 9° + 79°(1−u)^1,6`, azimut 240° → 270°** : midi court, heure dorée longue, fin cadrable.
8. **Grande Ombre de 98 à 110 s** (ombre de la Falaise, ouest → est, sable figé) : climax long qui regroupe tout le monde à l'est.
9. **Piqué : cible ≥ 6 m plus bas, ≤ 26 m, ±70° ; prise d'élan 0,2 s ; clac 0,65 s avant l'interception ; touche à 4 m** : la micro-simulation montre qu'une esquive au clac demande un vrai réflexe (0,25 s → 13 % de touches) sans être impossible.
10. **Touche = décrochage de 1,5 s + vol de la traînée des 1,5 dernières secondes (3 s sur la couronne)** : récompense visible, qui grossit naturellement au couchant.
11. **Raté = l'attaquant décroche 1,0 s ; feinte possible avant le clac** : règle symétrique, profondeur pour les experts.
12. **Immunité de 2,5 s après un décrochage, 2 bots au plus par cible** : anti-acharnement.
13. **Ombres des tours : sable figé ; oiseau caché si 90 % de son ombre est à l'ombre (même règle pour la nuit)** : « si on ne voit plus ton ombre, on ne te voit plus » ; impossible de se cacher au couchant.
14. **Tours : rien de plus large que 5 m sous 24 m, tours hautes à l'ouest, géométrie exacte par enveloppes de cercles** : collisions simples, ombres calculables au pixel.
15. **Quatre cartes (Parasols, Aiguilles, Géantes, Cadran), Le Cadran toujours en dernier** : variété et final mémorable.
16. **Arène elliptique est-ouest en 6 tailles selon N, entièrement à l'écran, bord Simoun** : lisibilité et proximité.
17. **Couronne du meneur : le piquer vole 3 s de traînée** : rattrapage visible et convergence.
18. **Pas de thermique, de vent, de bonus ni d'événement aléatoire en v1** : le soleil est l'événement ; tout ajout concurrence la lecture des ombres.
19. **Score : un soleil par oiseau devancé + 1 au vainqueur ; 3 manches ; dernière × 2** : limite la boule de neige, garde la partie ouverte.
20. **12 titres, un par joueur, attribués par z-score au-dessus d'un seuil** : chacun repart avec quelque chose de vrai.
21. **Contrôle absolu à l'écran à vitesse constante ; caméra à lacet fixe** : un enfant et un adulte ont le même oiseau.
22. **Clavier par `KeyboardEvent.code`** : deux joueurs (WASD + Espace + Maj gauche ; IJKL + AltGr + M), AZERTY sans réglage.
23. **Aide au vol par joueur, visible (icône plume)** : accessibilité sans règle cachée.
24. **Caméra : cadre oiseaux et ombres, tangage 58° → 42°, ralenti de touche × 0,35** : dramatiser sans perdre la lecture.
25. **HUD : cadran solaire comme seul chronomètre, bande de sable triée** : on lit le temps dans le soleil.
26. **Six personnalités de bots plus l'Horloger, trois niveaux (Oisillon, Voyageur, Seigneur des sables)**, même couche d'entrée que les humains, sans triche ni élastique.
27. **Onboarding : écran titre joué par des bots, lobby jouable à trois micro-objectifs, 3 cartes, 10 indications contextuelles** : personne n'a besoin d'explication orale.
28. **Narrateur : couleurs en noms propres sans article, une couleur par réplique, clips générés phrase entière (648)** : aucun problème d'accord, prosodie intacte.
29. **Narrateur : 8 s entre répliques, 8 par manche au plus, abandon après 2,5 s, silence de 107 à 110 s** : rare et juste.
30. **Latence : le PC fait autorité, grâce de `min(0,1 s, RTT/2)` pour l'esquive d'un téléphone** : l'équité ne dépend pas du réseau.
31. **Toutes les constantes dans `rules.ts`** (§ 19), revalidées par 50 manches de bots par taille d'arène dès que la vraie simulation tourne (script de référence `docs/research/gdd-validation/validate.mjs`).
