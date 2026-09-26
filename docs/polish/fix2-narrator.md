# Correcteur narrator (vague 2) : la voix

Périmètre : `tools/tts/**`, `public/audio/narrator/**`, `src/shared/strings/narrator.ts` ; par autorisation de l'ordre, la page `dev/narrator.html` (`src/dev/narrator/main.tsx`) ; un script neuf `tools/polish/narrator/check.mjs`. Ordres : (1) clips suspects, (2) `narrator.doubleHit` EN, (3) ré-encodage 48 kb/s + présence. Preuves : `shots/polish2/narrator/`, journaux `tools/tts/out/`, manifest complet `tools/tts/narrator.manifest.json`.

## Méthode : ce que « en contexte » veut dire ici

Personne ne peut écouter 722 clips. Whisper small sert d'auditeur, comme pour le lot d'origine, mais dans trois conditions au lieu d'une (`tools/tts/gen.py --asr-strict`) :

| | condition | exigé |
|---|---|---|
| **P** | clip seul, amorce des 12 noms de couleur (le gate d'origine) | CER ≤ 0,12, nom de couleur entendu |
| **N** | clip seul, **sans** amorce | CER ≤ 0,15 ; le nom n'est exigé que pour Lagon et Safran, les deux que les critiques ont entendus de travers (sans amorce, Whisper écrit « Corée » pour un « Corail » bien dit : N n'est alors que noté) |
| **C** | clip posé dans le **fond réel du jeu** (`tools/tts/asr-bed.ogg`), avec amorce | CER ≤ 0,15, nom entendu |

- **Le fond** : 110 s de la sortie réelle du jeu (musique, ambiance, bruitages, interface, ducking actif), extraites de l'enregistrement `after2` du correcteur audio (partie à 12 oiseaux) pendant ses 40 répliques. Le clip y est posé après 0,8 s de fond, à un écart de sonie mesuré en partie : en manche, voix − reste = +9,5 LU en médiane, **+6,2 au 10ᵉ centile** → C à **+6 LU** ; sur les écrans de résultats et au podium, jamais sous +7,8 → **+8 LU**. Le segment du fond dépend de l'id du clip : toutes ses prises sont jugées sur le même fond.
- **Homophones parfaits** ramenés à une même forme avant le CER : « l'heure dorée » / « leur doré », « son ombre » / « son nombre », « en voit » / « envoie », « Azure » / « as your ». Ce sont les mêmes sons ; Whisper ne les départage qu'au sens.
- **Durée** : une prise de plus de 3 s parlées est refusée (`--max-speech-s 3.0`, règle GDD §16.1).
- Chaque prise est jugée **après encodage** (ce que le joueur entend), 4 prises par clip, départagées par UTMOS puis par ces conditions ; un refus donne une nouvelle graine (`narrator-retry.ts`) et on recommence.

## (1) Clips suspects · FAIT

### Les suspects nommés

| clip | avant (Whisper) | fait | après (P / N / C) |
|---|---|---|---|
| « Lagon » entendu « La gomme » (`firstCrown.1`) | N « La gomme porte la couronne », P « Lagon, Potlacourne », C « Lagon pour la Coran » | modèle réécrit (voir plus bas) | **« La couronne est à Lagon. Elle se voit de loin. »** P et C « …à Lagon et se voit de loin » (N, à la génération : « …à l'agon… », même son) |
| même défaut ailleurs | audit N des 28 clips Lagon et des 28 Safran FR : `leaderChange4.1` « La gomme et la danse », `roundWin3.3` « S'offrant à le dernier mot » | nouvelles graines | P « Lagon mène la danse », N « Lagont mène… » ; P et C « Safran a le dernier mot » |
| « Safran » (`lastRay.3`, `matchWin.3`) | N « Saffron a volé… » | rien : c'est l'orthographe anglaise du même son, P et C entendent « Safran » ; mot-clé N `saffron` accepté | P et C « Safran… », 0 erreur |
| « L'heure dorée » (`golden1`) | « Leur doré, les ombres en de l'ambition » (critique : « Leur doré ») | réplique réécrite : **« C'est l'heure dorée. Les ombres voient grand. »** + homophone | P et C « C'est leur doré, les ombres voient grand » (même son ; N, à la génération : « C'est l'heure dorée ») |
| « fige » (`greatShadow1`) | « elle fiche tout » dans les 3 conditions, sur toutes les graines : devant « tout », le /ʒ/ s'assourdit, comme chez un humain qui parle vite | réécrite : **« La nuit tombe de la falaise. Elle glace tout. »** (mot-clé « glace ») | P « …elle glace tout », C « …et glace tout » |
| « Déserve » (`matchWin.8`, relevé par le correcteur audio) | « Sarcelle, le Déserve retiendra cette couleur » | nouvelle graine | « Sarcelle, le désert retiendra cette couleur », P et C 0 |
| « départera » (`photoFinish2`) | « Coude à coude, la nuit départera » | nouvelle graine | « …la nuit départagera », P et C 0 |
| Enregistrements des critiques (voix seule en partie) : `golden2` « Ursulaidesa, Rose-Hombre », `golden3`, `storm.7`, `firstHit.7`, `roundOpen3`, `runaway.1`, `leaderChange1.1`, `hitHunter.7`… | | tous repris par l'audit ci-dessous | tous passent P + C (`golden2` : « Le soleil descend, vos ombres grandissent » dans les 3 conditions) |

### Audit de tout le lot, puis reprise

Après le ré-encodage (3), **les 722 clips** ont été relus en P et C (`narrator.sh --parallel --verify --asr-strict C`) : **119 refusés** (FR 102/361, EN 17/361), dont 17 en P (le gate d'origine : prises limites que l'encodage a fait basculer, voir (3)) et 102 en contexte. En FR, les refus se concentraient sur quelques modèles, cassés dans le bruit quelle que soit la couleur : `miss` 10/12, `bigStealVictim` 9, `hitHunter` 8, `storm` 8, `leaderChange1` 7, `firstCrown` 5, `runaway` 5, `hiddenLong` 4. On n'y gagnait rien à changer de graine : **9 modèles FR réécrits**, chaque variante essayée d'abord sur 3 couleurs difficiles, dans les 3 conditions (scratchpad `cand4` à `cand11`) :

| modèle | avant | après | pourquoi |
|---|---|---|---|
| `miss` | {color} mord la poussière. On n'a rien vu. | **{color} finit dans le sable.** On n'a rien vu. | « Morda-poussière », « m'aura l'apprécié » ; « Rose mord » → « Orze » |
| `dodge` | {color} esquive. Les serres attrapent du vent. | {color} esquive. **Le chasseur n'attrape que du vent.** | « dessert à trappe du ventre » |
| `hitHunter` | {color} tombe du ciel. Pile sur quelqu'un. | {color} tombe du ciel. **Quelqu'un a mal.** | « pire sur quelqu'un », seconde phrase perdue dans le bruit |
| `storm` | {color} défie la tempête. Pari perdu. | {color} défie la tempête. **Mauvaise idée.** | « Paris perdue », fin avalée (même chute que l'anglais « Bad idea ») |
| `leaderChange1` | {color} prend la tête. Le sable oublie vite. | {color} prend la tête. **Le désert** oublie vite. | « le sabre de Vivite » |
| `firstCrown` | {color} porte la couronne. Tout le monde la voit. | **La couronne est à {color}. Elle se voit de loin.** | « Potlacourne, Toulmonde-Lavoie » |
| `bigStealVictim` | Une ombre passe. {color} perd gros. | Une ombre passe, **et {color} perd du terrain.** | « Pergo », « Percro » |
| `runaway` | {color} s'installe. Qui s'en occupe ? | {color} s'installe. **Quelqu'un va réagir ?** | « Qui sonne le cube ? » |
| `hiddenLong` | {color} reste à l'ombre, sagement. | {color} **reste à l'abri. C'est plus prudent.** | « reste à l'homme, sage mort », « Vestalombe, Sajmo » |

Les règles d'écriture tiennent (`narrator-lines.ts --check` : une couleur, jamais en dernier mot, sans article, « à {color} » est une préposition permise). Le ton reste sec (« Quelqu'un a mal. », « C'est plus prudent. »). Les autres refus ont reçu de nouvelles graines. Il a fallu cinq tours et deux graphies prononcées (`SAY_CLIP`) : `hiddenLong.9` « Rôse reste à l'abri » (« Rose » en tête de phrase donne « Orze » ou « Ours ») et `huntStreak.0` « Corail, chasse encore » (« Chasanto », « Shazam »). Passe finale sur les répliques de résultats les plus entendues, encore limites : `photoFinish2`, `matchWin.8`, `landslide.2`, `roundWin3.7`, `comeback.9`, `roundWin1.9` repris. Tous les clips repris passent **P + N + C**.

Au total : **189 prises nouvelles** (FR 160, EN 29), **134 sous-titres changés**. UTMOS moyen : FR 4,10 → 4,07, EN 4,42 → 4,42. Durée parlée max 2,96 s (moyenne 2,42 s).

## (2) `narrator.doubleHit` EN · FAIT

- « Two in one dive. {color} is hungry. » → **« Two birds, one strike. {color} is hungry. »** Glossaire §9 (l'attaque se dit *strike*), et c'est la tournure du GDD (§16.4 n° 7 : « Two birds, one dive »), un clin d'œil à « two birds, one stone » dans un jeu d'oiseaux.
- La virgule faisait marquer à Pocket une pause qui poussait la réplique à 3,0-3,3 s parlées (Coral 3,11 s, Indigo 3,04 s). La voix dit donc « Two birds one strike » (`SAY_TPL` dans `narrator-lines.ts`), et le sous-titre garde la virgule : 2,33 à 2,66 s. Mot-clé « strike » exigé.
- 12 clips régénérés : **12/12 passent P, N et C**, et Whisper transcrit mot pour mot dans les trois conditions (sauf « striker » pour Indigo dans le bruit).
- Au passage : `matchWin` EN « Remember that color » → « **colour** » (anglais britannique, comme l'interface). La voix est identique : la graphie prononcée garde « color », donc aucune re-synthèse.

## (3) Ré-encodage 48 kb/s mono + présence · FAIT (gain net modéré, sûr)

- **Réglage** : MP3 mono 24 kHz (fréquence native de Pocket), ABR 32 → **48 kb/s**, plateau de présence **+2 dB au-dessus de 3 kHz** (`highshelf f=3000, pente 1`, +1 dB à 3 kHz, +2 dB au-delà de 5 kHz), appliqué **avant** la normalisation. Refait depuis le cache des prises (aucune re-synthèse), puis `--verify`.
- **Sonie** : −17,1 à −16,2 LUFS (inchangé, cible −16). **Crête** : 8 clips sortaient à −1,2/−1,4 dBTP (l'encodeur dépasse un peu avec la présence) ; `encode_normalized_mp3` resserre maintenant le limiteur de l'écart constaté et ré-encode : **toutes ≤ −1,5 dBTP**.
- **Spectre** (`shots/polish2/narrator/encodage-avant-apres.png`, 200 clips tirés au hasard) : la coupure passe de **8,3 à 11,2 kHz**, les sifflantes (/s/ de « Safran », « hostilités ») ne sont plus tronquées, et c'est ce qui rendait la voix « étouffée » à côté des bruitages en 44,1 kHz (critique audio). Énergie relative 2-4 kHz +0,8 dB, 4-8 kHz +1,6 dB.
- **Dans le fond du jeu à +6 LU**, rapport voix / fond par bande (98 clips) : 1-2 kHz +1,5 → +1,5 dB ; **2-4 kHz −3,4 → −2,5 dB ; 4-8 kHz −3,6 → −2,0 dB**. Ce sont les consonnes qui gagnent.
- **Whisper en contexte, échantillon aléatoire non biaisé** (110 clips FR + 60 EN, mêmes prises, seul l'encodage change) : CER moyen FR **0,111 → 0,104**, EN **0,031 → 0,025** ; clips au-delà de 0,3 : FR 13 → 11, EN 1 → 0 ; au-delà de 0,15 : FR 31 → 33, EN 3 → 2. Le gain est faible et reste dans le bruit de mesure, dans un sens comme dans l'autre : Whisper n'a pas besoin des aigus. Je garde le réglage pour la bande passante et pour le rapport voix / fond dans les consonnes, qui comptent pour une oreille humaine, et parce que rien ne se dégrade en moyenne.
- **Sûreté** : le ré-encodage a fait basculer en P 17 prises qui passaient de justesse à 32 kb/s. C'est connu (director.md §5 : « le même audio encodé à 32, 46 ou 48 kb/s peut passer ou échouer ») et c'est un effet de sélection : ces prises avaient été choisies parce qu'elles passaient à 32 kb/s. Toutes ont été reprises.
- **Poids** : 8,29 → **12,31 Mo** (+48 %). Au jeu, on ne charge que la langue et les couleurs présentes : environ 2,2 Mo à 4 joueurs au lieu de 1,5, au lancement de la partie.

## Vérifications

- **`--verify` final sur les 722 MP3** (`narrator.sh --parallel --verify --asr-strict C`, puis `--only` pour les 8 clips repris pendant cette passe) : **722/722 acceptés en P et en contexte**, 0 au-delà de 3 s parlées. Avant reprise (même encodage) → après :

  | | CER en contexte, moyenne | clips > 0,15 | clips > 0,3 | CER P, moyenne | P > 0,12 |
  |---|---|---|---|---|---|
  | FR | 0,101 → **0,031** | 92 → **0** | 34 → **0** | 0,026 → **0,012** (lot d'origine à 32 kb/s : 0,021) | 15 → **0** |
  | EN | 0,022 → **0,014** | 13 → **0** | 0 → 0 | 0,004 → **0,003** | 2 → **0** |
- `tools/polish/narrator/check.mjs` (Chrome, port 8856) : **722/722 décodés par Web Audio**, durée = manifest à 1 ms près, 12,31 Mo, aucune ressource en erreur (seul `favicon.ico` des pages de dev manque, comme avant). Neuf répliques jouées par le vrai lecteur (`playNarratorLine`, mode voix) : voix entendue (RMS du bus voix de −12,1 à −16,7 dB), ducking 0,5, sous-titre = nouveau texte (« La couronne est à Lagon. Elle se voit de loin. », « Rose reste à l'abri. C'est plus prudent. », « Two birds, one strike. Saffron is hungry. », « Teal wins. Remember that colour. »…). Captures : `dev-narrator-fr.jpg`, `dev-narrator-en.jpg` (en-tête : 722/722 clips, ASR ⚠ 0, parlé > 3 s : 0, max 2,96 s ; transcription « en contexte », et « sans amorce » quand elle existe, affichées sous une réplique si elles diffèrent), `recitatif-fr-firstCrown.jpg` (nom en encre au milieu de la phrase).
- `pnpm typecheck` : 0 erreur. `vitest` `src/director` + `src/shared` + `src/dev` : 77 tests verts. `narrator-lines.ts --check` : OK.

## Fichiers

- `tools/tts/gen.py` : `--presence-db/--presence-hz`, `--asr-strict [NC]`, `--asr-bed/--asr-bed-snr` (`ContextBed`, écart par ligne `asr_bed_snr`), `--max-speech-s`, `keywords_np`, homophones `AsrChecker.SAME`, `asr_judge`, crête resserrée à l'encodage, `--verify` qui renseigne `asr_np_*`/`asr_ctx_*`/`asr_verified`, `--merge` qui garde la vérification la plus récente.
- `tools/tts/narrator.sh` : réglages du lot (48k, présence, `--max-speech-s 3`, fond), vérification stricte des prises nouvelles, `--parallel --verify`.
- `tools/tts/narrator-lines.ts` : `SAY_TPL`, `LINE_KEYWORDS`, `HEARD_NP` (mots-clés N), `asr_bed_snr` (8 LU aux résultats et au podium), `SAY_CLIP` `hiddenLong.9` et `huntStreak.0`, `sameWords` tolère accents et « colour ».
- `tools/tts/asr-bed.ogg` (nouveau, 348 Ko), `narrator.seeds.json`, `narrator.lines.json`, `narrator.manifest.json`, `README.md`.
- `public/audio/narrator/**` : 722 MP3 ré-encodés (dont 189 prises nouvelles), `manifest.json`.
- `src/shared/strings/narrator.ts` : 11 répliques FR, 2 EN.
- `src/dev/narrator/main.tsx` : transcriptions « en contexte » et « sans amorce » sous chaque réplique.
- `tools/polish/narrator/check.mjs` (nouveau). `docs/agent-notes/director.md` (§ Polish vague 2), `docs/agent-notes/REQUESTS.md`.

## Non fait, limites

- **Aucune écoute humaine.** Tout est jugé par Whisper small et UTMOS. Le critère C (+6 LU) est sévère : il représente les pires 10 % des moments de partie mesurés. Les 5 minutes d'écoute à faire en priorité : page `dev/narrator.html`, bouton ×12 sur `miss`, `hitHunter`, `firstCrown`, `hiddenLong` (FR), `doubleHit` (EN).
- **Le CER tolère encore des fautes de sens en contexte** (C 0,15 max) : `landslide.*` « Le désert s'inquiète » pour « s'incline », `mirage.*` « mené » pour « menait » (quasi-homophone), `closeFinish2` « un grain sable » (le « de » élidé, comme on le dit : « un grain d'sable »), `golden3` « les ondes » pour « les ombres » dans le bruit.
- **Whisper n'est pas déterministe d'un réglage de fils à l'autre** : une prise limite peut basculer entre deux vérifications. `huntStreak.0` (« Corail chasse encore ») était acceptée au tour 2 et a été refusée en contexte à la vérification finale. Après trois graines de plus, elle passe avec une virgule dite (« Corail, chasse encore. », `SAY_CLIP`), puis a été revérifiée. Une relance de `--verify` peut encore faire basculer un ou deux clips limites ; `narrator-retry.ts` puis `narrator.sh` les reprennent en quelques minutes.
- Les transcriptions N (sans amorce) ne restent dans le manifest que pour les clips dont la dernière vérification les a faites ; `--verify --asr-strict C` ne refait que P et C.
- Le poids (12,3 Mo) dépasse l'ancienne cible de 8 Mo ; `--bitrate 40k` la rapprocherait (ré-encodage depuis le cache en ~18 min, puis `--verify`).
