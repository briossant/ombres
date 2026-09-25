# Style visuel Moebius (Jean Giraud) : recherche pour « Ombres »

> Rôle du document : fixer **ce qui fait Moebius** (et ce qui ne le fait pas) et le traduire en règles de rendu chiffrées pour un jeu 3D temps réel (R3F/three.js).
> Complété par `moebius-palettes.json` (palettes machine-lisibles) et `moebius-keyframes.png` (maquette schématique des 6 keyframes, générée par nous, sans droits tiers).
> Les références visuelles téléchargées sont réservées à l'étude interne. Elles restent **hors dépôt** (voir §1.2).

---

## 0. TL;DR (à lire si on ne lit que ça)

1. **High-key avant tout.** Dans ses déserts de jour, 60 à 90 % des pixels ont une luminance > 0,6 (médiane mesurée entre 0,73 et 0,83). Les ombres ne sont **jamais sombres** : OK-L(ombre) ≈ 0,70 à 0,86 × OK-L(lumière). Le noir ne sert qu'au trait.
2. **Le trait fait la forme, la couleur fait la lumière.** Contour d'encre fin et régulier, un peu plus épais sur la silhouette et au premier plan, plus fin au loin et à l'intérieur des formes. L'encre est un brun-aubergine très sombre, **pas du noir pur**.
3. **Deux tons par objet** (aplat éclairé + aplat d'ombre à bord net). Les dégradés sont réservés au **ciel** et aux halos.
4. **Les ombres portées sont des aplats plats, nets, sans contour**, de couleur lavande-gris peu saturée (teinte OKLCH ≈ 280-340, chroma 0,01 à 0,06), plus froide et plus violette avec la distance et quand le soleil descend. De près et en plein jour, elles restent tièdes (même teinte que le sable, luminance × 0,8).
5. **Les hachures sont rares et localisées.** On les met sur la face à l'ombre des objets du premier plan (rochers, tours, ventre de l'oiseau), orientées selon la forme, avec des croisées à 90° seulement dans les creux. **Jamais** sur le ciel, le sable plat, les ombres portées ni le territoire peint.
6. **Le sol plat est presque vide.** On y sème quelques petits tirets et points d'encre (cailloux), plus denses vers l'horizon, ce qui donne la perspective. Le vide est un choix de composition.
7. **Le ciel est un dégradé vertical** qui s'éclaircit vers l'horizon (turquoise→blanc de brume à midi, bleu→jaune pâle au golden hour). S'y ajoutent des bandes horizontales de strates près de l'horizon et des cumulus plats au contour festonné.
8. **Coucher de soleil « à la Moebius » :** ciel orange ou jaune en aplat, **sol qui bascule dans le gris-lavande**, seules les faces tournées vers le soleil restent corail. Ce n'est pas « tout orange ».
9. **L'oiseau est blanc os** (#EDEDDF, ombre #C4C6BA), à la manière de l'oiseau d'Arzach. La couleur du joueur va sur l'accessoire : cape, tapis de selle, fanion. C'est exactement ainsi que Moebius sépare le héros du monde.
10. **Minuscules figures dans l'immensité**, horizon bas quand on voit le ciel, 60 à 70 % du cadre vide en plan large. Détail concentré sur le point focal, rien ailleurs.

---

## 1. Corpus et méthode

### 1.1 Œuvres étudiées et ce qu'on en tire

| Œuvre (année) | Technique | Ce qui nous sert |
|---|---|---|
| **Arzach** (1975-76, *Métal Hurlant*) | Muet, **couleurs directes** (aquarelle + acrylique), hachures fines | L'oiseau blanc « ptérodactyle de pierre », le cavalier minuscule, les déserts roses et lavande, la cape jaune qui détache le héros du décor |
| **Le Garage hermétique** (1976-79) | Noir et blanc, trait souple, hachures + pointillés | Vocabulaire du trait : variation d'épaisseur, pointillé qui prolonge la hachure, économie |
| **L'Incal** (1980-88, avec Jodorowsky) | Trait sur « bleus », coloriés à la gouache (Linel/Pébéo) avec aérographe pour halos et dégradés (I. Beaumenay-Joannet) | Couleur d'**atmosphère** plutôt que d'objet ; halos lumineux |
| **Sur l'étoile** (1983) → **Le Monde d'Edena** (1988-2001) | Ligne claire épurée à l'extrême, puis retour modéré des hachures dans *Les Jardins d'Edena* (1988) | Aplats pastel, ombres « douces mais saillantes », rendu *solarisé, plat mais plein* |
| **Major Fatal / illustrations 80-2000** | Couleurs directes, gouache mate sur papier grain | Ciels en aplat orange, sol gris, reflets en formes cernées |
| **40 Days dans le désert B** (1999) | Dessin quotidien, couverture et planches peintes | Ciel turquoise, désert crème, horizon bas, crépuscule ocre sur sol violet |
| **Starwatcher / Arzak l'arpenteur** (tardif) | Illustration couleur, ligne très fine | Trait homogène fin, grands vides |
| **Jodorowsky's Dune** (1974-76, env. 3000 cases de storyboard) | Crayon et encre, « dessinateur-caméra » | Cadrages de cinéma, zooms continus de l'espace vers l'intime, échelle extrême |
| *Blueberry* (Giraud, pas Moebius) | Encre + couleurs | Couchers de soleil de western : ciel jaune-orange en aplat, silhouettes brun-noir |

Chronologie utile (source : *Par la bande*, série « Les carrières de Jean Giraud ») : à la fin des années 70, hachures « quasi maniaques » ; vers 1983-85, suppression presque totale (*Sur l'étoile*, « les traits se simplifient à l'extrême ») ; à partir de 1988, retour modéré, « une voie intermédiaire » sans revenir aux graphismes « touffus des années 1970 ». **Notre cible, c'est cette voie intermédiaire** : ligne claire colorée plus hachures ponctuelles.

### 1.2 Références visuelles téléchargées (étude interne uniquement, hors dépôt)

Dossier : `/tmp/claude-1001/-home-bcr-session-vibe-2026-09-05/5edd7b3f-1d22-4bd7-beef-3301f2b3bcd4/scratchpad/style/refs/` (planche-contact : `../refs_contact_sheet.jpg`).

| Fichier | Contenu | Utilité |
|---|---|---|
| r01_bird_over_town_pastel | Oiseau d'Arzach au-dessus d'une ville de terre, sol lavande | Ombres violettes, cailloux, oiseau blanc |
| r02_turquoise_sky_desert | Couverture de *40 days* : ciel turquoise, désert crème, horizon bas | **Zénith** |
| r03_warm_ochre_desert | Désert ocre chaud, dôme bleu | Après-midi chaud |
| r04_white_bird_pink_ground | L'oiseau blanc posé, sol rose fissuré | Couleurs de l'oiseau, ombre portée en lavis |
| r05_ligne_claire_beach | Ligne claire tardive, ciel pâle | Finesse du trait, vide |
| r06_figure_highkey_desert | Personnage, désert presque blanc, ombres gris-bleu | High-key extrême |
| r07_flat_blue_sky | Ciel bleu en aplat, ruban blanc | Aplat de ciel pur |
| r08_floating_city_green_sky | Cité flottante, ciel vert-jaune, cumulus festonnés | Nuages |
| r09_car_orange_sky_grey_ground | Gouache originale : **ciel orange plat, sol gris** | **Coucher** |
| r10_canyon_ship_banded_horizon | Canyon, vaisseau blanc, horizon en bandes | **Référence n° 1** : trait, strates, cailloux, ombres lointaines |
| r11_temple_pale_turquoise | Ruine rouge, ciel turquoise délavé, sable pêche | Brume de chaleur à l'horizon |
| r12_walker_lavender_horizon | Marcheur, bande lavande à l'horizon | Bandes d'horizon |
| r13_night_crystal | Nuit bleue, sol lavande plus clair que le ciel | **Nuit** |
| r14_arzach_cover_moon | Couverture d'Arzach : ciel bleu→jaune pâle, lune | **Golden hour**, oiseau |
| r15_arzach_night_tower | Tour violette nocturne, oiseau blanc | Nuit, silhouettes |
| r16_edena_red_rock | Edena : roche rouge pointillée, ciel pâle | Pointillé, ombres bleues |
| r17_edena_golden | Edena : champs dorés, ciel pâle froid | Golden hour |
| r18_40days_dusk_print | *40 days* : ciel brun, bande ocre, sol violet ardoise | **Crépuscule** |
| r20_blueberry_sunset | Blueberry : soleil disque, ciel jaune-orange | Coucher western |
| r21_garage_page_line | Planche du *Garage hermétique* | Trait N&B |
| r22_desert_city_blue_sky | Ville-canyon, ciel indigo | Architecture |
| r23_dome_orange_stipple | Dôme orange, pointillé | Texture en points |
| r24_arzak_book_turquoise | Arzak (livre) : ciel turquoise, sol corail | Oiseau et monture |

Sources des images : WikiArt (fiches « Jean Giraud »), 2dgalleries, doorofperception, AnOther, 50 Watts, Pinterest/Tumblr (originaux). **Attention :** une image très partagée comme « Moebius sunset dunes » (dunes orange, créatures à cornes, ciel texturé) s'est révélée être une **génération IA**. Elle a été écartée. Elle illustre bien le « faux Moebius » à éviter (§8).

### 1.3 Méthode d'extraction des couleurs

- Palettes par zone : `magick img -crop … -resize 150x150 -colors 6 -format %c histogram:info:-` (scripts dans `/tmp/claude-1001/-home-bcr-session-vibe-2026-09-05/5edd7b3f-1d22-4bd7-beef-3301f2b3bcd4/scratchpad/style/` : `pal.py`).
- Valeurs : distribution de luminance et couleur des 2 % de pixels les plus sombres, pour estimer l'encre (`ink.py`).
- Comparaisons lumière/ombre en **OKLCH** (`ok.py`), pour raisonner en ratio de luminance et en décalage de teinte.
- Limites : ce sont des scans et photos d'impressions. La saturation d'impression varie, le papier jaunit, le JPEG mélange les traits fins avec le fond. Les hex finaux (§5) sont **dérivés et harmonisés** à partir des mesures, pas recopiés tels quels.

---

## 2. Ce que disent les analystes et Moebius lui-même

- **Tonalité claire** : Moebius encre « dans la zone 0-40 % de l'échelle de gris, avec un minimum d'ombres et d'aplats noirs », d'où un rendu « solarisé » qui évoque la lumière du désert (M. Singh, *The Hunting of the Snark*, analyse du *Garage hermétique*). Ailleurs il parle de valeurs « 20-30 % ».
- **Hiérarchie du trait** : « plus épais vers le premier plan et les bords, plus fin vers le fond et le centre des formes » (*ibid.*). Règle affichée : **« Toujours délicat »**.
- **Hachure** : surtout **linéaire** (peu de croisées). Il bute des traits moyens bout à bout (« butting »), avec des passages croisés à **90°** « judicieux » et un motif court « piqué » pour les volumes sphériques. Le pointillé prolonge la hachure. Il y a une progression naturelle *pointillé → hachure → hachure croisée*.
- **Pétillance** : le rapport entre l'épaisseur du trait et celle du blanc voisin crée un scintillement optique. Cela ne marche que si l'on évite trop de ton.
- **Volume en bas-relief** : il indique le volume par le bord extérieur, ou laisse la forme blanche et travaille l'espace autour.
- **Détail et vide** : « précis et onirique à la fois », avec une profondeur de champ infinie par endroits et de grands vides ailleurs.
- **Couleur** (conseil n° 14 de ses « 18 conseils », 1996) : « La couleur est un langage que le dessinateur utilise pour manipuler l'attention du lecteur et créer de la beauté. Il y a une couleur objective et une couleur subjective, […] l'éclairage peut changer d'une case à l'autre selon l'espace représenté et l'heure du jour. » Il décrivait la couleur à ses coloristes « en termes d'environnement, de lumière et d'atmosphère, comme un cinéaste » (rapporté par *The Comics Journal*).
- **Composition** (conseil n° 10) : « la verticale excite, **l'horizontale calme**, l'oblique vers la droite porte l'action vers le futur […] des points dispersent l'énergie, quelque chose placé au centre la concentre ». La page « est un visage qui regarde le lecteur ».
- **Couleurs signatures** (W. Stout, qui a travaillé avec lui) : **violets grisés**, turquoise primaire avec accents jaune-orange, **turquoise + rose** pour donner une légèreté aux situations dangereuses, bruns très travaillés, verts relevés d'accents rouges ou orange.

---

## 3. Caractéristiques précises du style

### 3.1 La ligne

- **Couleur** : les 2 % de pixels les plus sombres de ses couleurs de jour sont des bruns-rouges ou aubergines très sombres (#382D28, #2E190F, #280905, #2F141C, #3D231E, #3F1E10, #2A1A22). En nocturne, ils virent au bleu-noir (#243043, #04031F). À l'écran, un trait noir fin sur du pastel se lit comme un brun chaud. **Encre de jeu : #2B1D23**, qui vire vers #181322 la nuit.
- **Épaisseur** : quasi monolinéaire en ligne claire tardive (r05, r10). Sur les originaux à la plume, la variation reste faible, avec un renflement de 1 à 1,5× dans les courbes. Hiérarchie constante : silhouette > arêtes internes > textures (strates, fissures, cailloux).
- **Contours externes et internes** : la silhouette est toujours cernée. Les lignes internes sont peu nombreuses et seulement là où il y a un vrai pli ou une arête (plis de cou de l'oiseau, arêtes de falaise). L'intérieur des volumes lisses reste **vide** (corps de l'oiseau r04 : 94 % d'une seule couleur #EDEDDF).
- **Lignes de silhouette et de strates** : en plan lointain, les formations sont des silhouettes nettes remplies d'aplat, avec quelques **petits tirets verticaux** au bord supérieur des falaises (strates) et quelques traits horizontaux (r10, zoom).
- **Distance** : plus fin et plus rare au loin. Les plans les plus lointains perdent leurs traits internes et deviennent de simples formes plates (mesas de r10 : aplat crème + ombre gris-lavande, contour fin).
- **Main visible** : léger tremblé, levées de plume, petites irrégularités. Tout cela reste **délicat**, jamais le gribouillis d'un « sketch shader ».

### 3.2 Hachures, pointillés, textures

| Type | Où Moebius les met | Où il ne les met pas |
|---|---|---|
| **Parallèles** (dominantes) | Face à l'ombre des rochers et falaises du premier plan, dans l'axe de la forme (verticales sur les pitons, r10) ; troncs (verticales, r17) ; herbe (traits serrés, r08) ; ventre et dessous des ailes de l'oiseau (r14) | Sable plat, ciel, grands aplats pastel, plans lointains |
| **Croisées à 90°** | Creux les plus profonds, fissures, dessous très sombres ; « dans des passages judicieux » | Partout ailleurs |
| **Pointillé** (stippling) | Texture de roche rouge à l'ombre (Edena r16), dômes et surfaces granuleuses (r23), transition hachure→lumière | Surfaces lisses (oiseau, dômes lisses) |
| **Tirets et points épars** | **Sol de désert** : cailloux et petits tirets surtout horizontaux, plus denses vers l'horizon (r10, r01, r06, r11) | Près des objets focaux, où l'on laisse le vide |
| **Fissures** | Sol craquelé en réseau de polygones irréguliers (r04, r12, r06) | Dunes |

En couleur, **les ombres portées ne sont pas hachurées** : ce sont des lavis ou aplats plats (r02, r04, r10). Dans certaines pages d'Arzach, il n'y a même aucune ombre portée : le volume est porté par le trait seul (analyse formelle d'*Arzach*).

### 3.3 Aplats et couleur

- **Couleurs directes** (Arzach, 40 days, illustrations) : lavis d'aquarelle et acrylique. Les aplats sont presque uniformes avec un léger grain, un bord de lavis net et parfois un petit liseré plus foncé.
- **Gouache mate** (r09) : aplats parfaitement plats sur papier grain. Le reflet sur la carrosserie est une **forme claire cernée d'encre**, pas un dégradé spéculaire.
- **2 tons par objet**, rarement 3 : lumière + ombre propre à bord net. Le 3e ton, un creux sombre, n'apparaît qu'au premier plan, souvent remplacé par la hachure.
- **Dégradés** : dans le ciel (r02, r14, r16, r08), dans les halos (aérographe dans *L'Incal*) et, discrètement, dans la brume vers l'horizon. Presque jamais sur les volumes.
- **Chroma modérée, accents vifs localisés** : fond pastel (chroma OKLCH ≈ 0,04 à 0,07) et quelques accents saturés sur le point focal (cape jaune d'Arzach, dôme turquoise, grand manteau vert de r02).

### 3.4 Lumière et ombres (mesures)

Paires lumière → ombre relevées sur les références (OKLCH) :

| Réf. | Lumière | Ombre | ratio L | ΔH | Lecture |
|---|---|---|---|---|---|
| r02 sable / ombre portée (zénith) | #DFC8B0 | #AE8E77 | 0,79 | −11° | Ombre **tiède** : même teinte, plus sombre, un peu plus saturée |
| r11 sable / ombre | #F1D0B1 | #C69871 | 0,81 | −4° | Idem |
| r12 sol terracotta / ombre | #D28763 | #A57163 | 0,86 | −10° | Idem |
| r10 plaine / ombres lointaines | #DECBB4 | #7E7F85 | 0,70 | → 279° | Ombre **froide neutre** au loin |
| r01 sol / ombre des rochers | #DDD8D8 | #967A89 | 0,69 | → 345° | **Lavande-mauve** |
| r01 roche éclairée / ombre | #CD9479 | #A993A2 | 0,96 | → 338° | Changement de **teinte** plus que de valeur |
| r06 sol / ombre | #DBDEDC | #9DA3A7 | 0,79 | → 237° | Gris-bleu |
| r22 sol / ombre | #D6A18C | #7F7589 | 0,77 | → 308° | Violet |
| r09 ciel coucher / sol | #EDA557 | #9C9A98 | 0,88 | chroma 0 | **Sol gris neutre sous ciel orange** |
| r18 horizon crépuscule / sol | #DAAD57 | #655E6A | 0,64 | → 311° | Sol ardoise violet |

Conclusions :
- **Deux familles d'ombres coexistent** : tièdes (même teinte, L × 0,8) près du spectateur et en plein jour ; **lavande-grises désaturées** (teinte 280-345°, chroma 0,01-0,04) au loin, dans les pièces plus graphiques, et de plus en plus quand le soleil baisse.
- **L'ombre reste claire** : en plein jour, L(ombre) ≥ 0,6 (OKLab). Le ratio descend à 0,6-0,65 seulement au crépuscule.
- **Les ombres portées ont un bord net.** Pas de pénombre floue en couleur directe, seulement un bord de lavis.
- **Pas de spéculaire brillant.** Les reflets sont des formes claires cernées (r09), et il n'y a pas de rim light.

### 3.5 Sable, sol et dunes

- **Plaine** : aplat presque uniforme très clair (sable zénith mesuré #DFC8B0 à #F1D0B1, voire #DDD8D8 et #DBDEDC en version blanchie). Pas de texture de grain : la perspective est donnée par la **densité croissante des cailloux et tirets vers l'horizon** et par la brume.
- **Cailloux** : petits ovales cernés avec une minuscule ombre portée du côté opposé au soleil (r01, r11, r04). Ces ombres **s'allongeraient au coucher**, et c'est un détail parfait pour notre thème.
- **Sol craquelé** : réseau de fissures polygonales (r04 rose, r12 terracotta, r06 gris). À réserver à certaines zones (cuvettes, sols durs) pour varier les biomes.
- **Dunes** (chez lui, plutôt des buttes et plateaux ; les dunes de sable pur sont rares) : une **ligne de crête** tracée (arête), deux aplats (face au soleil / face opposée), 2 à 5 traits de ride de vent parallèles près du spectateur seulement.
- **Mesas et canyons au loin** : bandes horizontales empilées de crème, ocre, gris-lavande et bleu. L'horizon est construit en **strates** (r10, r12).

### 3.6 Ciels

- **Dégradé vertical 2-3 stops**, plus clair et plus désaturé vers l'horizon :
  - Zénith : turquoise (#88D9BB, #75D3BC en haut) → vert d'eau pâle (#AEE6C7) → presque blanc (r02). Variante bleu pâle (#B4CCCB, #B8D2E4, r05/r06) ou turquoise délavé (#B0CEC9, r11).
  - Golden hour : bleu profond (#3D5296) → **jaune crème** (#F1F6CF) à l'horizon (couverture d'Arzach r14) ; ou ciel pâle froid au-dessus de champs dorés (#DEE8F9 sur #F1B120, Edena r17).
  - Coucher : **aplat orange** (#EDA557, r09) ou jaune-orange (#E5A633, Blueberry r20).
  - Crépuscule : haut brun-violet sombre (#34241B/#512F1C) avec une **bande ocre lumineuse** à l'horizon (#DAAD57, #EAC772, r18).
  - Nuit : indigo (#223A61, #355993, #222652) avec des étoiles en points. Le **sol lavande (#9890A7) est plus clair que le ciel** (r13).
- **Bandes d'horizon** : 1 à 3 bandes horizontales (strates, brume, montagnes lointaines) de bleu plus foncé ou de lavande, cernées d'un trait fin (r10 : #60E0DF / #399ACF / #2760A5 / #B2BBC0 superposés).
- **Nuages** : cumulus **plats** à contour festonné tracé à l'encre, 2 tons (dessus clair, dessous lavande-rose), posés en rangées horizontales (r08, r05). Ou strates en longues bandes. Aucun nuage volumétrique ni bruité.
- **Astres** : disque plat, parfois énorme (lune craquelée de r14), cerné ou non, avec un halo en aplat. Pas de lens flare.

### 3.7 Architecture organique

- **Formes** : tours effilées et pitons, **dômes et bulbes** (oignons, champignons de roche r11), empilements de cylindres, ruines massives de terre, cités posées sur des mesas (r22), antennes et haubans fins, mâts à pendeloques (r02, r03).
- **Traitement** : silhouette nette, 2 tons, hachures verticales sur la face à l'ombre, petites fenêtres = trous d'encre, **usure** (fissures, éclats, sable accumulé au pied).
- **Couleurs** : terre crème, ocre, terracotta (#C8765A, #BE545A), avec **dômes turquoise/cobalt** en accent (r03, r22).
- **Pour « Ombres »** : les tours doivent avoir une **silhouette lisible d'en haut** (ce sont les ombres qu'elles projettent qui comptent). On privilégie des profils à renflements (bulbe en haut, fût étranglé, base évasée) dont l'ombre allongée reste reconnaissable, et des arches ou percées qui projettent des « trous » de lumière dans l'ombre.

### 3.8 Créatures et montures : l'oiseau d'Arzach

- Grand oiseau **blanc os**, tête allongée au long bec, longues ailes étroites et rigides en vol plané. Les commentateurs le décrivent comme un « oiseau de pierre », un « ptérodactyle couleur d'os ». Sega l'a repris pour les monstres blancs « comme de la pierre » de *Panzer Dragoon*.
- Couleurs mesurées : corps #EDEDDF (94 % de la surface), ombre #C4C6BA / #DBDBDC (aile), creux #ACADA3. De nuit : #D0C5D9 avec une ombre #685E9B.
- **Presque aucune ligne interne** : silhouette, quelques plis au cou et à l'attache des ailes. Ventre et dessous des ailes en tons chauds hachurés sur la couverture (r14), sinon lavis gris léger.
- Le **harnais, la selle et la cape** portent toute la couleur et tout le détail : cuir brun hachuré, sacoches, cape **jaune** (r14 : « le blanc de l'oiseau et le jaune de la cape créent une distance forte entre le héros et le monde », analyse formelle d'Arzach).

### 3.9 Personnages minuscules, composition, échelle

- **Figures minuscules** : cavaliers, marcheurs et caravanes de 1 à 3 % de la hauteur de l'image (r01, r10, r11). Le vaisseau blanc de r10 occupe moins de 2 % de l'aire.
- **Horizon** : bas (r02, r09, r14 : 50-60 % du bas) quand le sujet est le ciel ou la solitude ; très haut ou hors champ en vue plongeante (r01, r10 : de 5 à 10 % du haut). Il n'est jamais dans une zone floue et hésitante.
- **Vide** : en plan large, 50 à 70 % de l'aire est occupée par un aplat quasi uniforme (sable ou ciel).
- **Profondeur par plans** : 4 à 5 plans parallèles (premier plan détaillé et hachuré, plan moyen en ligne claire, fond en aplats, strates d'horizon, ciel). Le contraste et la densité de trait **décroissent** avec la distance.
- **Rythme** : horizontales pour le calme (début de manche), obliques et longues diagonales pour la tension (ombres allongées de fin de manche), point central pour concentrer (duel, piqué).

---

## 4. Ce que les œuvres inspirées de Moebius en ont retenu

| Œuvre | Ce qu'elle retient | Leçon pour nous |
|---|---|---|
| **Sable** (Shedworks, 2021 ; GDC 2022 « The Art of Sable ») | Contours fins noirs, formes en **tons doux sans ombrage** hormis un pointillé occasionnel. Ombres **portées** gardées pour que le joueur situe les objets sur le sol. **Brouillard « vraiment, vraiment clé »** pour la lisibilité à moyenne et longue distance, réglé par biome et pilotant le cycle jour-nuit. **Opacité des contours qui diminue avec la distance** pour cacher l'apparition des objets. Désert pensé comme une **mer** avec des îles de contenu. | Flat shading = perte de profondeur : la compenser par l'ombre portée, le brouillard et le fondu des lignes avec la distance. |
| **Panzer Dragoon** (Sega, 1995) | Directement inspiré d'Arzach : cavalier solitaire sur une créature ailée, monstres blancs « de pierre », ruines d'une civilisation disparue, motifs de lignes asymétriques. Moebius a signé l'illustration promotionnelle. | Notre prémisse (chevaucher un oiseau géant au-dessus d'un désert) est l'héritage direct d'Arzach : il faut assumer l'oiseau blanc. |
| **Breath of the Wild** | Souvent rapproché de Moebius par la critique, mais **Nintendo cite l'animation japonaise et la gouache « en plein air »**, pas Moebius. | Retenir seulement les aplats gouachés, les ciels à dégradé et la lisibilité par silhouettes. |
| **Jodorowsky's Dune** | Moebius « dessinateur-caméra » : 3000 dessins, plans-séquences, zooms depuis l'espace. | Caméra : alterner très larges (échelle) et plans serrés (drame du piqué). |
| **Shaders « Moebius » communautaires** (M. Heckel, UselessGameDev, colesloow/Unity, windokk/UE5, godotshaders) | Sobel sur la profondeur et les normales pour les contours, déplacement sinusoïdal pour le tremblé, **hachures en espace écran par seuils de luminance** (horizontal ≤ 0,65, vertical ≤ 0,55, diagonal ≤ 0,45 de luma, période 8 px), spéculaire blanc cerné. | Bon socle technique pour le trait. Mais les hachures écran par seuil de luminance donnent une **trame de journal** qui « nage » en mouvement et couvre tout ce qui est sombre, ce qui **n'est pas** Moebius (voir §3.2 et §8). |

---

## 5. Palettes (keyframes)

Fichier machine : `docs/research/moebius-palettes.json` (hex + OKLCH). Maquette : `docs/research/moebius-keyframes.png`.

**Principe** : les keyframes sont indexées sur l'**élévation du soleil** (pas sur le temps), et on interpole **en OKLab** entre les deux keyframes voisines. Jamais en sRGB, qui salit les mélanges orange→violet.

Rôles :
- `skyTop` / `skyMid` (à 60 % de la hauteur du dôme) / `skyHorizon` : dégradé vertical du ciel.
- `sandLit` : sable face au soleil (N·L élevé). `sandShade` : sable en ombre propre (face opposée d'une dune, N·L ≤ 0).
- `groundFlat` : valeur **indicative** d'un sol plat, qui dépend de N·L. Au coucher, le sol plat bascule vers `sandShade` (voir R6).
- `castShadow` : ombre portée neutre (tours, cailloux), base de l'ombre du joueur.
- `ink` : trait. `sun` : disque solaire (halo = même couleur à 35 % d'opacité). `haze` : brume et brouillard de distance.

| Keyframe | élév. | skyTop | skyMid | skyHorizon | sandLit | sandShade | castShadow | ink | sun | haze |
|---|---|---|---|---|---|---|---|---|---|---|
| **K0 Zénith** | 80° | `#8DD3D2` | `#B5E3D9` | `#E6F3E3` | `#F1DABE` | `#CCB0A7` | `#A18EA1` | `#2B1D23` | `#FFFCF0` | `#EBE8DA` |
| **K1 Après-midi** | 45° | `#4DB4CC` | `#8DD2DA` | `#CBE8E9` | `#EDCFA5` | `#BF9F97` | `#897D97` | `#2B1D23` | `#FFF9E1` | `#E5D9C5` |
| **K2 Golden hour** | 16° | `#6886BD` | `#90CACD` | `#F7E9A7` | `#F4BC74` | `#AE7E80` | `#6F6089` | `#2D1C22` | `#FFF2C3` | `#F2CE99` |
| **K3 Coucher** | 3,5° | `#795C87` | `#EC9C63` | `#FFD16B` | `#EF945F` | `#7D768C` | `#554C70` | `#261721` | `#FFE6A9` | `#E8A587` |
| **K4 Crépuscule** | −4° | `#272950` | `#775774` | `#D69F58` | `#706C7F`* | `#575568` | `#45455D` | `#181322` | `#F6B669`** | `#816C85` |
| **K5 Nuit (résultats)** | −15° | `#162C55` | `#294875` | `#5B678C` | `#9B94AB`* | `#7B778D` | `#626079` | `#131423` | `#E3F0FE`*** | `#69708F` |

\* sans soleil direct, `sandLit` est le sol éclairé par le ciel (ou la lune pour K5). \*\* lueur résiduelle sous l'horizon, pas de disque. \*\*\* lune.

Justification par keyframe (valeurs mesurées → choix) :
- **K0 Zénith** : ciel turquoise de *40 days* (r02 #88D9BB→#AEE6C7) et de r11 (#B0CEC9), horizon blanchi par la brume de chaleur. Sable crème pêche entre r02 (#DFC8B0), r10 (#DECBB4) et r11 (#F1D0B1), poussé à L = 0,90 pour le high-key. Ombre portée lavande claire (L 0,67, ratio 0,74) entre la tiède de r02 et la mauve de r01 (#967A89). **Ombres petites et nettes** : c'est le moment le plus clair et le plus calme.
- **K1 Après-midi** : ciel plus profond, turquoise-cyan de r10 (#60E0DF, #399ACF). Sable qui se dore (r10 plan lointain #EDD19D). Ombre qui devient gris-violet (r10 #7E7F85, légèrement violacée).
- **K2 Golden hour** : le schéma de la **couverture d'Arzach** (r14 : haut #3D5296, horizon #F1F6CF) et le sol doré d'Edena (#F1B120, adouci pour garder le pastel). La face à l'ombre vire au **rose poudré** (#AE7E80), l'ombre portée au **violet** (#6F6089) : c'est le contraste complémentaire or/violet.
- **K3 Coucher** : r09 (ciel orange #EDA557 **et sol gris** #9C9A98), Blueberry r20 (#E5A633) et la bande de r18. Le haut du ciel est mauve (violets grisés de Moebius, selon Stout). **Seules les faces tournées vers le soleil restent corail** (#EF945F). Le sol plat, en lumière rasante, bascule dans le gris-lavande (#7D768C), et les ombres portées très longues passent en violet profond (#554C70). C'est **le moment le plus spectaculaire** : ciel chaud et sol froid, avec le territoire peint qui ressort dessus.
- **K4 Crépuscule** : r18 (sol ardoise #655E6A/#767186, bande d'horizon ocre #DAAD57) et haut indigo (r13/r15). Les ombres se fondent. L'encre se refroidit.
- **K5 Nuit** (écran de résultats, facultatif) : r13, où **le sol lavande est plus clair que le ciel indigo**. Le territoire peint reste lisible.

**Oiseau** (commun à toutes les keyframes, puis éclairé) : corps `#EDEDDF`, ombre `#C4C6BA` (jour) / `#B8B0C4` (soir), creux `#ACADA3`. De nuit, on multiplie par la lumière de la keyframe, ce qui donne ≈ #D0C5D9 / #685E9B mesurés.

**Tours** (neutres, pour ne pas concurrencer les joueurs) : crème `#EFE2C8`, ocre `#D9A45B`, terracotta `#C8765A`, dôme turquoise `#4FB3AE` ou cobalt `#3C5FA8` en **petites surfaces** seulement. Ombre propre = `sandShade` de la keyframe, décalée de +10° de teinte vers le violet.

**Territoire peint (proposition)** : un pigment façon lavis, pas un alpha blend.
- `L_paint = 0,5 × L_solLocal + 0,35` (le territoire reste au voisinage de la valeur du sol, comme un lavis).
- `C_paint = 0,10` en journée (élévation > 10°) → `0,13` au coucher et au crépuscule (couleur « subjective » : on la renforce quand la lumière s'éteint pour garder la lecture).
- `H_paint = teinte du joueur`.
- Bord du lavis : liseré de 2 à 4 px à `L_paint − 0,10`, c'est l'accumulation de pigment de l'aquarelle.
- Pas de contour d'encre.
- Contrainte pour la palette joueurs : **chroma ≥ 0,10**, pour ne jamais se confondre avec le sable (chroma < 0,07) ni avec l'ombre neutre lavande (chroma < 0,06, teinte 280-340°). Validé sur la maquette : lisible sur toutes les keyframes.

---

## 6. Règles de rendu (numérotées, à implémenter)

Unités : les px sont donnés **pour 1080p**, à multiplier par `hauteurÉcran / 1080`. « L » = luminance OKLab.

**Trait**
- **R1 — Encre** : couleur `ink` de la keyframe (#2B1D23 de jour), **jamais #000**. Avec la distance, `lineColor = mix(ink, haze, fog × 0,8)`.
- **R2 — Épaisseurs** : silhouettes (discontinuité de profondeur) **2,0 px** ; oiseaux et cavaliers **2,5 px** (focaux) ; arêtes internes (angle entre normales > 40°, soit dot < 0,77) **1,0 px** ; textures (strates, fissures, cailloux) **0,75-1,0 px**. Largeur × `lerp(1,0 ; 0,5 ; smoothstep(proche, loin, profondeurVue))`, soit « plus épais devant, plus fin au fond ».
- **R3 — Sources des contours** : profondeur (silhouettes) + normales (plis) + **ID d'objet ou de matériau** (séparer la cape de l'oiseau, le dôme du fût). **Pas** de contours sur les frontières de luminance : ni terminateur d'ombre, ni bord d'ombre portée, ni bord de territoire.
- **R4 — Fondu des lignes avec la distance** (repris de Sable) : opacité des lignes = `1 − smoothstep(0,35 ; 0,85 ; fog)`. Au-delà de fog 0,5 : plus de lignes internes ni de hachures, seulement la silhouette. Au-delà de 0,85 : aplats seuls (mesas de r10).
- **R5 — Tremblé** : déplacement basse fréquence de 0,5-1 px, **ancré dans le monde** (bruit sur la position monde ou l'UV), pour que les lignes ne « nagent » pas quand la caméra bouge. Pas de « boil » animé en jeu. Autorisé à 8 fps sur l'écran titre seulement.

**Ombrage**
- **R6 — Deux tons** : objets (tours, oiseaux, rochers) avec un terminateur **net** à N·L ≈ 0,05 (antialiasé via `fwidth`, largeur ≤ 1,5 px). Sol et dunes avec une rampe douce `smoothstep(0,02 ; 0,35 ; N·L)` entre `sandShade` et `sandLit`, pour éviter qu'une plaine entière ne bascule d'un coup au coucher. **Pas de Lambert continu** sur les volumes.
- **R7 — Valeur des ombres** : en journée (élévation > 10°), L(ombre) ≥ 0,60 et ratio L(ombre)/L(lumière) entre 0,70 et 0,86. Au crépuscule, ratio ≥ 0,60. On ne multiplie **jamais** par du noir : on **mélange en OKLab** vers la couleur d'ombre de la keyframe.
- **R8 — Teinte des ombres** : ombre propre proche = teinte du matériau −5 à −15° (tiède). Ombre lointaine ou ombre portée = mélange vers `castShadow` (lavande), avec un poids qui augmente avec la distance (0 → 0,7) et quand le soleil baisse (0,3 à K0 → 0,9 à K3).
- **R9 — Ombres portées** : aplat **plat, net, sans contour ni hachure**, couleur `castShadow`. L'ombre de l'oiseau d'un joueur = `castShadow` teintée de sa couleur (même L, chroma 0,05-0,07, teinte du joueur), pour que chacun reconnaisse **son** ombre active. Le lavis de territoire (§5) reste derrière elle.
- **R10 — Pas de spéculaire ni de rim light.** Les rares reflets (œil de l'oiseau, verrières, dômes vernis) sont des **formes claires seuillées et cernées** (spéculaire posterisé > 0,6 → `#FFFCF0` + contour 1 px), à utiliser avec parcimonie.

**Hachures et textures**
- **R11 — Hachures localisées** : seulement sur (a) la face à l'ombre des tours et rochers, (b) le dessous de l'oiseau à l'ombre, (c) les creux (AO < 0,5). Pas au-delà de ~40 % de la distance de brouillard (fondu sur 20 %).
- **R12 — Hachures orientées selon la forme** : en espace objet ou UV, **pas en espace écran**. Verticales sur les fûts de tour, méridiennes sur les dômes, le long de la corde de l'aile sur l'oiseau. Espacement écran 5-7 px, trait 0,8-1,2 px, 1 couche à l'ombre, **2 couches croisées à 90°** dans les creux (N·L < −0,3 ou AO < 0,35). Densité stabilisée à l'écran par des niveaux de type tonal art maps pour éviter l'aliasing.
- **R13 — Jamais de hachures** sur le ciel, le sable plat, les ombres portées ni le territoire peint.
- **R14 — Pointillé** : sur les surfaces rocheuses et granuleuses à l'ombre (pierre de tour, roche rouge), points de 1-1,5 px dont la densité suit l'ombre, en transition avant la hachure.
- **R15 — Cailloux et tirets du sable** : instances (GPU) de petits tirets et ovales d'encre, 2-6 px de long à l'écran, surtout horizontaux, encre à 50-60 % d'opacité, **150-300 marques par écran** en plan large. Leur densité monde est plus élevée loin du centre d'action et nulle sur les zones focales. Chacun porte une **micro-ombre portée** `castShadow` qui s'allonge avec le soleil. Des milliers d'ombres minuscules qui s'étirent : le thème du jeu à l'échelle du caillou.
- **R16 — Dunes** : ligne de crête tracée (arête de normales, 1 px), 2 à 5 rides de vent parallèles **près de la caméra seulement**, pas de texture de grain.

**Ciel, atmosphère, papier**
- **R17 — Ciel** : dôme en dégradé vertical 3 stops (`skyTop` → `skyMid` à 60 % → `skyHorizon`). On ajoute 1 à 3 **bandes de strates** horizontales près de l'horizon (couleur `skyTop` à 50 %, trait fin à 50 %). Cumulus : 0 à 4 billboards **plats**, contour festonné à l'encre, 2 tons (dessus `skyHorizon` éclairci, dessous `castShadow` éclairci), dérive lente. Pas de nuages volumétriques ni de bruit.
- **R18 — Soleil** : disque plat `sun` avec un contour d'encre de 1 px à 50 %, plus **un** halo en aplat (rayon ×2, opacité 35 %). **Pas de bloom, de lens flare ni de god rays.**
- **R19 — Brume** : brouillard exponentiel vers `haze`. Les objets lointains s'aplatissent (R4) et perdent leur contraste, comme les plans lointains de r10.
- **R20 — High-key mesurable** : sur une capture de jeu en journée (élévation > 10°), ≥ 60 % des pixels à L > 0,6 et L médian ≥ 0,70. Au coucher, L médian ≥ 0,50. Seuls les traits descendent sous 0,3. **À intégrer au QA automatisé** (histogramme des captures Playwright).
- **R21 — Papier** : grain de papier statique en multiply, amplitude 3-5 % de luminance, écran ou monde mais **non animé**. Fond de papier et teinte UI #F7F0E3.
- **R22 — Post-process interdit** : pas de DOF, d'aberration chromatique, de motion blur de caméra, de vignettage > 5 %, de LUT « cinéma » saturée. Les couleurs viennent des keyframes, pas d'un grading.

**Objets et composition**
- **R23 — Oiseau** : corps blanc os, lignes = silhouette + 3-6 plis maximum. Hachures seulement sous le ventre à l'ombre. **Couleur joueur** sur tapis de selle, cape, fanion, **bande peinte en travers de chaque aile (dessus, lisible d'en haut)** et ruban de traînée. Il ne faut jamais peindre tout l'oiseau.
- **R24 — Tours** : 2 tons, hachures verticales côté ombre, fenêtres = trous d'encre, dômes turquoise ou cobalt en petites surfaces, usure au pied. Silhouette conçue pour projeter une ombre **reconnaissable** et allongeable (bulbe, fût étranglé, arches).
- **R25 — Composition** : en plan large, 50 à 70 % de l'image en aplat (sable ou ciel) et les oiseaux à 2-4 % de la hauteur d'écran. Quand le ciel est visible (titre, transitions, coucher), l'horizon est dans le tiers supérieur en plongée, ou dans le tiers inférieur en contre-plongée, **jamais au centre**. FOV conseillé 35-50°.

---

## 7. Typographie et UI

**Le lettrage de Moebius** : capitales tracées à la main au stylo technique, **monolinéaires**, légèrement condensées et penchées, terminaisons arrondies, ligne de base un peu vivante (bulles d'Edena, *Garage*). Les titres sont des logotypes dessinés (Arzach, Incal), jamais une police générique.

Polices libres (OFL, Google Fonts / @fontsource) testées en rendu sur fond sable (`/tmp/claude-1001/-home-bcr-session-vibe-2026-09-05/5edd7b3f-1d22-4bd7-beef-3301f2b3bcd4/scratchpad/style/fonts_sheet.png`) :

| Usage | Police (OFL) | Pourquoi | Écartées |
|---|---|---|---|
| **Titres, en-têtes, noms d'écran** | **Julius Sans One** | Capitales larges et fines, trait unique : l'élégance de la ligne claire et des titrages SF français 70-80 | Orbitron, Audiowide, Michroma (SF générique) |
| **Logo « OMBRES »** | Logotype **dessiné** (SVG), à construire à partir de Julius Sans One ou de **Syne ExtraBold** | Contour encre 2-3 px, remplissage pastel, et **une ombre portée qui s'allonge** sur l'écran titre, soit le concept du jeu dans le logo | Megrim, Codystar (gadgets) |
| **Texte UI, récitatifs du narrateur, étiquettes** | **Patrick Hand SC** | Petites capitales manuscrites monolinéaires, proches du lettrage de bulles | Comic Neue (trop « Comic Sans »), Gochi Hand, Gluten (trop rondes) |
| Alternative manuscrite | **Architects Daughter** | Écriture d'architecte au stylo technique | Kalam (trop cursive) |
| Chiffres HUD (%, temps) | Julius Sans One ou Syne SemiBold, **à tester** en tabulaire | Lisibilité à distance sur une TV | Police mono « terminal » |

**Traitement UI inspiré de la BD** :
- Panneaux = **cases** : fond papier #F7F0E3, bordure d'encre 2 px au tracé légèrement irrégulier, **ombre portée en aplat décalée** (4-6 px, `castShadow` à 60 %, sans flou).
- Narrateur = **récitatif** (cartouche rectangulaire de BD), capitales manuscrites, 1 à 2 lignes. On le préfère à la bulle, puisque le narrateur n'est pas un personnage.
- Icônes au trait 1,5-2 px encre, 2 tons maximum. Boutons : aplat pastel + contour encre, état pressé = l'ombre portée disparaît et le bouton descend de 3 px.
- **Pas** de glassmorphism, d'ombres floues, de dégradés sur les boutons ni d'arrondis « app mobile » de 16 px et plus (rayon 2-6 px, ou coins légèrement irréguliers).
- Couleurs joueurs dans l'UI : pastille de la teinte du joueur (L 0,62-0,70) cernée d'encre. Le nom du joueur est écrit en encre, pas en couleur, pour la lisibilité.

---

## 8. Pièges à éviter (ce qui fait « toon générique » ou « faux Moebius »)

1. **Contours noirs épais et uniformes partout** (look *Borderlands*). Moebius, c'est fin, brun-noir, hiérarchisé et délicat.
2. **Hachures en espace écran selon la luminance** (le « Moebius shader » des tutoriels) : ça couvre toutes les zones sombres d'une trame de gravure, ça fourmille en mouvement et ça hachure le sable et les ombres portées. Moebius hachure **peu, localement, selon la forme**.
3. **Cel-shading anime** à 3 bandes et plus, saturé, avec rim light et spéculaire brillant.
4. **Ombres sombres** (L < 0,45 en plein jour) ou noires : on perd le high-key solarisé, qui est la marque n° 1.
5. **Dégradés Lambert lisses sur les volumes** : ça donne un look plastique 3D. Les dégradés sont réservés au ciel.
6. **Textures bruitées, PBR, normal maps détaillées, grain de sable photographique.**
7. **Bloom, lens flare, god rays, DOF, aberration chromatique** : tous les tics du « beau » moderne, anti-Moebius.
8. **Coucher de soleil Instagram** : magenta et orange fluo partout, sol orange saturé. Chez Moebius, **ciel chaud, sol froid et gris-violet**.
9. **Détail uniforme** : tout texturé et tout cerné donne du bruit. Moebius concentre le détail au point focal et laisse le reste vide.
10. **Horizon centré, grand angle > 60°** : perspective de jeu vidéo et non de planche.
11. **Pastiche IA** : peinture lisse sans trait, dunes-vagues orange, nuages texturés « peinture numérique », créatures à cornes aléatoires. C'est l'image « Moebius sunset » écartée en §1.2. Sans trait d'encre, ce n'est pas du Moebius.
12. **Cerner les ombres portées ou le territoire** : l'ombre et le lavis sont de la **couleur**, pas du trait.
13. **Papier trop présent ou animé** et **line boil permanent** : fatigue visuelle, lisibilité en baisse.
14. **Tout en lavande** : garder des ombres tièdes près du spectateur en plein jour. La lavande monte avec la distance et avec l'heure. C'est la progression qui raconte le coucher.
15. **Couleurs joueurs pastel-grises** : sur du sable pastel et des ombres lavande, un joueur à chroma < 0,10 disparaît. Les accents vifs sont justement la méthode de Moebius (la cape jaune).

---

## 9. Décisions proposées

- **D1 — Palettes** : adopter les 6 keyframes de `moebius-palettes.json` (K0 80°, K1 45°, K2 16°, K3 3,5°, K4 −4°, K5 −15° pour les résultats), interpolées **en OKLab selon l'élévation du soleil**. La courbe de descente du soleil au fil de la manche est réglable par le game design, mais le passage K2→K3→K4 doit tomber dans les 25-30 dernières % de la manche, c'est le climax.
- **D2 — Encre** : `#2B1D23` → `#261721` (coucher) → `#181322` (crépuscule). Jamais de noir pur, et un mélange vers `haze` avec la distance.
- **D3 — Ombrage 2 tons** : terminateur net sur les objets, rampe douce `smoothstep(0,02 ; 0,35)` sur le sol, mélange OKLab vers les couleurs d'ombre (pas de multiplication par le noir).
- **D4 — Hachures** : uniquement en espace objet ou UV, orientées selon la forme, sur la face à l'ombre des tours, rochers et ventres d'oiseaux au premier plan. Jamais sur le sable, le ciel, les ombres portées ni le territoire.
- **D5 — Ombres portées** : aplats nets sans contour, couleur `castShadow`. L'ombre active d'un joueur est teintée de sa couleur (même L, chroma 0,05-0,07).
- **D6 — Territoire** : lavis pigmentaire (L = 0,5·L_sol + 0,35 ; C 0,10 → 0,13 au coucher ; liseré de bord −0,10 L sur 2-4 px ; grain de papier), sans contour.
- **D7 — Palette joueurs** (à valider par l'agent couleurs/daltonisme) : chroma ≥ 0,10 et L entre 0,60 et 0,75. Éviter les teintes 60-80° à faible chroma (sable) et 280-340° à faible chroma (ombres).
- **D8 — Oiseau** : blanc os `#EDEDDF` pour tous. L'identité joueur passe par la selle, la cape, le fanion, les bandes d'ailes et la traînée.
- **D9 — Tours** : terre crème, ocre et terracotta, accents turquoise ou cobalt en petites surfaces. Silhouettes à bulbe, fût étranglé et arches, pensées pour l'ombre projetée.
- **D10 — Sol** : cailloux et tirets d'encre instanciés avec micro-ombres qui s'allongent. Zones craquelées pour varier. Pas de texture de grain.
- **D11 — Ciel** : dégradé 3 stops + 1 à 3 bandes de strates + 0 à 4 cumulus plats festonnés. Soleil en disque plat avec un seul halo. Zéro bloom.
- **D12 — Trait** : silhouettes 2 px, oiseau 2,5 px, plis 1 px (à 1080p, proportionnels), fondu avec le brouillard (Sable), tremblé ancré dans le monde, pas de boil en jeu.
- **D13 — High-key en QA** : vérifier automatiquement sur les captures que ≥ 60 % des pixels sont à L > 0,6 en journée et que le L médian est ≥ 0,70.
- **D14 — Typo** : Julius Sans One (titres), Patrick Hand SC (UI et récitatifs), logotype « OMBRES » dessiné avec une ombre portée animée. Toutes en OFL, via @fontsource.
- **D15 — UI** : panneaux en « cases » de BD sur papier #F7F0E3, bordure encre de 2 px, ombre portée en aplat décalée, pas de flou.
- **D16 — Caméra** (à arbitrer avec l'agent caméra) : plongée haute et cadrage horizontal calme en début de manche. Au golden hour et au coucher, abaisser l'inclinaison pour **faire entrer la bande de ciel** dans le quart supérieur de l'image et laisser les longues ombres former des diagonales.

---

## 10. Sources

- Par la bande, « Les carrières de Jean Giraud – Moebius en quelques phases » (3) 1973-1980 : http://par-la-bande.blogspot.com/2018/08/les-carrieres-de-jean-giraud-moebius-en_16.html ; (4) 1980-1990 : http://par-la-bande.blogspot.com/2018/08/la-quete-de-lepure-es-carrieres-de-jean.html
- M. Singh, *The Hunting of the Snark*, série « Moebius & The Airtight Garage » n° 1-4 : https://justtheplaceforasnark.blogspot.com/2012/03/moebius-airtight-garage-no1-i-ink.html · http://justtheplaceforasnark.blogspot.com/2012/04/moebius-airtight-garage-no-2-on-clear.html · https://justtheplaceforasnark.blogspot.com/2012/04/moebius-airtight-garage-no-3-i-ink-body.html · https://justtheplaceforasnark.blogspot.com/2012/04/moebius-airtight-garage-no-4-ink.html
- Cité BD, « Du Ben Day au bleu : entretien avec Isabelle Beaumenay-Joannet » : https://www.citebd.org/neuvieme-art/du-ben-day-au-bleu-entretien-avec-isabelle-beaumenay-joannet
- The Comics Journal, « The Comet of Chaland » : https://www.tcj.com/the-comet-of-chaland/
- Moebius, « 18 conseils aux dessinateurs » (*La Jornada Semanal*, 18/08/1996), transcription : https://royalboiler.tumblr.com/post/89351806433/18-tips-for-comics-artists-by-moebius-brief
- William Stout, commentaire du conseil n° 14 : https://www.williamstout.com/news/journal/2014/07/17/18-tips-for-comic-book-artists-by-jean-%E2%80%9Cmoebius%E2%80%9D-giraud-14/
- Analyse formelle d'Arzach : https://albertopanblog.wordpress.com/2016/09/15/formal-element-analysis-of-arzach-by-moebius/
- Reactor, « The Real Magic of Moebius' Edena » : https://reactormag.com/the-real-magic-of-moebius-edena/
- Game Developer, « How Shedworks refined the art of Sable in pursuit of readability » : https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability · GDC Vault « The Art of Sable » : https://gdcvault.com/play/1027721/The-Art-of-Sable-Imperfection · Cook & Becker, « Sable: Exploration Through Line-Art » : https://www.cookandbecker.com/en/article/170/sable-exploration-through-line-art.html
- Panzer Dragoon Legacy, « Moebius' Arzach » : https://panzerdragoonlegacy.com/literature/356-moebius-arzach
- Zelda Dungeon, « Breath of the Wild's Art Style is Inspired by Japanese Animation » : https://www.zeldadungeon.net/breath-of-the-wilds-art-style-is-inspired-by-japanese-animation-according-t/
- Open Culture, storyboards de *Jodorowsky's Dune* : https://www.openculture.com/2014/08/moebius-storyboards-concept-art-for-jodorowskys-dune.html
- Shaders communautaires : M. Heckel https://blog.maximeheckel.com/posts/moebius-style-post-processing/ · UselessGameDev https://www.uselessgamedev.com/articles/moebius-style-rendering.html · colesloow https://github.com/colesloow/moebius_shaders
- Images : WikiArt (fiches « jean-giraud »), 2dgalleries.com, doorofperception.com, anothermag.com, 50wattsbooks.com, bedetheque.com, Pinterest et Tumblr (originaux). Étude interne uniquement.
