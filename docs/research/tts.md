# TTS du narrateur : recherche, banc d'essai, recommandation

> Mission : trouver un TTS **gratuit, local, sous licence permissive** pour pré-générer pendant le dev les répliques du narrateur d'Ombres, en FR et en EN. On vise une voix posée, un peu mystérieuse, un « conteur du désert ». Rien n'est appelé au runtime.
> Livrables :
> - l'outil `tools/tts/`, avec son README ;
> - les échantillons `assets-staging/tts-samples/` (page d'écoute `index.html`) ;
> - ce document.
>
> Date : 25/09/2026. Machine de test : Ryzen 5 4600H (6C/12T), 14 Go de RAM, **CPU seul**. L'iGPU AMD n'est pas utilisable par ROCm, et d'autres agents partageaient le CPU pendant les mesures.

## TL;DR

- **Recommandation : Kyutai Pocket TTS 3.3 (100 M paramètres)**.
  - Voix **`bill_boerst`** dans les deux langues : un lecteur LibriVox, **CC0**. Le même personnage parle en FR et en EN.
  - Modèles `french` (6 couches, **pas** `french_24l`) et `english`, `temperature 0.3`.
  - Ralenti `atempo 0.92` : il ne coûte rien en qualité mesurée.
  - Génération avec **4 prises par réplique, la meilleure retenue par UTMOS, puis vérification ASR**, avec des mots-clés obligatoires (le nom de couleur).
  - Dans ce pipeline, l'UTMOS moyen passe de 3,99 à **4,12 en FR** et de 4,40 à **4,44 en EN**.
- **Licences** : code MIT, poids **CC-BY-4.0**, sans compte Hugging Face. La seule obligation est une ligne de crédits.
- **Coût** : environ 0,5 × le temps réel sur CPU. Mesuré avec l'outil : ~11 s par réplique en 4 prises avec ASR, soit **~20 min pour les ~110 répliques prévues** (FR+EN), et ~2 min en prise unique.
- **Résultats mesurés (CER = taux d'erreur par caractère après transcription Whisper)** :
  - FR : **UTMOS 3,99 ± 0,24 sur 20 prises ; 19 sur 20 transcrites sans erreur**. La 20ᵉ avale le dernier mot (« de l'Ocre »), ce que le tri ASR élimine.
  - EN : **UTMOS 4,40 ± 0,05, 20 prises sur 20 sans erreur**, au niveau de Kokoro, référence EN du TTS Arena.
- **Alternatives** :
  - `peter_yearsley` (CC0) : plus grave (F0 ≈ 90 Hz) et plus « conteur », un peu moins stable en FR.
  - **Supertonic 3 voix M4** : le dauphin, intégré à l'outil (`narrator_supertonic`). Intelligibilité FR parfaite (25/25 clips), UTMOS EN 4,48, rapide. Mais modèle OpenRAIL-M, dépôt archivé et voix « studio » génériques.
  - Kokoro-82M : meilleur en EN, mais sa seule voix FR est **féminine** (`ff_siwis`).
  - Chatterbox v3 : clonage de n'importe quelle voix libre, mais **15× le temps réel** sur ce CPU et un écrêtage à corriger.
- **Exclus pour licence non commerciale** : F5-TTS, XTTS-v2, Fish/OpenAudio S1, Voxtral TTS, plus les voix Piper `ryan`/`lessac` et les voix Kyutai `expresso`/`ears`.
- **Plan B**, à implémenter **de toute façon** : chaque réplique s'affiche aussi en **sous-titre**. Réglage Narrateur : `Voix + texte` / `Texte seul` / `Désactivé`. Si un MP3 manque, on bascule automatiquement sur le texte.

---

## 1. Critères

| critère | exigence |
|---|---|
| Coût | 0 € : pas d'API, pas de compte payant, génération hors-ligne après le téléchargement du modèle |
| Licence | code **et poids** permissifs (MIT, Apache-2.0, CC-BY, CC0) ; **voix de référence** aussi ; exclusion de toute clause NC |
| Langues | FR natif (pas un accent anglais) et EN, idéalement **la même voix** dans les deux |
| Qualité | naturel, intelligible sur les noms de couleur, débit posé (~12-14 caractères/s), peu d'artefacts |
| Pratique | tourne sur le CPU de dev (NixOS, sans CUDA), déterministe (graine), scriptable |

## 2. État de l'art 2025-2026 et licences vérifiées

Licences relevées sur les cartes Hugging Face (API `cardData.license`) et sur les dépôts, en septembre 2026.

| modèle (date) | taille | FR ? | licence code / **poids** | CPU ? | statut |
|---|---|---|---|---|---|
| **Kyutai Pocket TTS** 3.3 (EN janv. 2026 ; FR en v2.0 avril 2026) | 100 M (6 couches) / 24 couches en préversion | **oui** | MIT / **CC-BY-4.0**. Dépôt `pocket-tts-without-voice-cloning` non restreint ; le clonage `.wav` demande le dépôt restreint (acceptation automatique des CGU) | **oui**, RTF 0,44-0,53 | **testé, recommandé** |
| **Kokoro-82M** v1.0 | 82 M | 1 voix (`ff_siwis`, féminine, note B-, jeu SIWIS CC-BY) | Apache-2.0 / Apache-2.0 | oui, RTF 0,42 | **testé** ; référence EN légère (TTS Arena V2, juillet 2026 : rang 48, ~1055 Elo ; Chatterbox ~1020) |
| **Chatterbox Multilingual v3** (Resemble AI) | 500 M | oui (23 langues) | MIT / MIT, avec watermark PerTh inaudible | lent : RTF **14,5** | **testé** |
| **Supertonic 3** (Supertone, avril 2026 ; dépôt archivé) | petit modèle ONNX (~66 M annoncés pour la v1) | oui (31 langues), 10 voix M1-M5/F1-F5 | MIT / **OpenRAIL-M** (restrictions d'usage, commercial permis) | oui, RTF ≈ 0,95 à 16 étapes | **testé** |
| **Piper** (rhasspy puis OHF) | 15-30 M (VITS) | oui : siwis (CC-BY), upmc (**CC-BY-SA**), gilles (CC0), mls (CC-BY), tom (**AGPL**) | MIT (rhasspy) / GPL-3.0 (piper-tts ≥ 1.3) ; licence propre à chaque voix | oui, RTF ≈ 0,3 | **testé** ; génération datée |
| **Qwen3-TTS** 12 Hz (Alibaba, janv. 2026) | 0,6 B / 1,7 B | oui (10 langues), *voice design* par description | Apache-2.0 / Apache-2.0 | très lent | **testé** (VoiceDesign 1,7B, cf. §4.4) |
| Kyutai TTS 1.6B en_fr (juil. 2025) | 1,8 B | oui (natif) | MIT/Apache / CC-BY-4.0 | GPU conseillé | non testé : même famille que Pocket, sans version CPU efficace |
| MeloTTS (MyShell) | ~50 M | 1 voix | MIT / MIT | oui | non testé : même génération VITS que Piper (2024) |
| Parler-TTS mini multilingual v1.1 | 0,9 B | oui | Apache-2.0 | lent | non testé : qualité en retrait |
| Zonos v0.1 (Zyphra) | 1,6 B | oui (via espeak) | Apache-2.0 | variante hybride en CUDA seulement | non testé : GPU requis |
| Fun-CosyVoice3-0.5B | 0,5 B | oui | Apache-2.0 | GPU conseillé | non testé |
| NeuTTS Nano French (Neuphonic) | ~120 M | oui | licence « other » (NeuTTS), dépôt restreint | oui | non retenu : licence propriétaire |
| Orpheus 3B FR (research release) | 3 B | oui | carte Apache-2.0 mais base Llama-3.2 (licence Llama) ; restreint | GPU | exclu : taille, licence ambiguë |
| Dia / Dia2, Sesame CSM-1B, StyleTTS2, VibeVoice, IndexTTS-2, VoxCPM | — | **non** (EN, ou zh/en) | variées (VibeVoice retiré par Microsoft ; IndexTTS : licence bilibili) | — | exclus |
| **F5-TTS** | 336 M | via fine-tunes | MIT / **CC-BY-NC-4.0** (Emilia) | — | **exclu : NC**, y compris les fine-tunes |
| **XTTS-v2** (Coqui) | 467 M | oui | **CPML non commerciale** (Coqui a fermé, aucune licence commerciale n'est obtenable) | — | **exclu** |
| **Fish-Speech / OpenAudio S1-mini** | 0,5 B | oui | Apache / **CC-BY-NC-SA-4.0** | — | **exclu** |
| **Mistral Voxtral TTS** 4B (mars 2026) | 4 B | oui | **CC-BY-NC-4.0** (le commercial passe par l'API payante) | — | **exclu** |

Point de vigilance sur les licences : d'après la PR #321, le modèle FR de Pocket a été « poli » sur Emilia-FR, un jeu de données NC. Kyutai publie néanmoins les poids en CC-BY-4.0, et c'est cette licence qui s'applique à l'utilisateur. Le risque résiduel est négligeable pour un jeu gratuit, mais on le note. Côté voix, on n'utilise que du CC0 ou du CC-BY (tableau §5.3).

## 3. Protocole

- **Même corpus pour tous les systèmes** : 5 phrases FR et 5 phrases EN, dont les 5 imposées par le brief de mission.

  | id | FR | EN |
  |---|---|---|
  | `lead` | « Le Corail prend la tête ! » | « Coral takes the lead! » |
  | `sun` | « Le soleil touche l'horizon. » | « The sun is touching the horizon. » |
  | `ten` | « Dix secondes. Tout peut encore basculer. » | « Ten seconds. Everything can still change. » |
  | `steal` | « L'Indigo vient d'avaler la moitié du désert de l'Ocre. » | « Indigo just swallowed half of Ochre's desert. » |
  | `long` | « Le vent se lève sur les dunes. Que les ombres s'allongent, et que le désert choisisse son maître. » | « The wind rises over the dunes… » |

- **Intelligibilité** : aller-retour ASR avec faster-whisper `large-v3-turbo` (int8, beam 5).
  - Le **CER est calculé sans espaces ni ponctuation ni accents**, parce que « l'ocre » et « locre » se prononcent pareil ; « 10 » et « dix » sont assimilés.
  - Les clips d'une même voix sont concaténés pour transcrire plus vite. Tout clip avec un CER supérieur à 5 % est ensuite **re-transcrit seul**, pour éliminer les erreurs d'attribution de mots aux frontières.
- **Naturel** : **UTMOS22-strong** (prédicteur de MOS, SpeechMOS). Il est entraîné sur l'anglais : **on ne compare les scores qu'au sein d'une même langue**. Pour une même voix, il donne systématiquement 0,3 à 0,5 point de moins en FR qu'en EN.
- **Signal** :
  - durée, silence de tête et de queue, plus longue pause interne ;
  - débit en caractères (hors espaces) par seconde de parole ;
  - F0 médiane (librosa yin) ;
  - crête et échantillons écrêtés (|x| ≥ 0,999) ;
  - spectrogrammes (sox) examinés visuellement.
- **RTF** = temps de calcul / durée audio, sur CPU partagé : les valeurs sont pessimistes.
- **Variance** : pour les 3 meilleures voix Pocket, 3 graines supplémentaires par phrase (n = 20 prises par voix et par langue).
- **Limites** : je ne peux pas écouter. Le « mystère », l'accent et le jeu d'acteur ne sont **pas mesurables** par ces métriques. **Une écoute humaine de la page `assets-staging/tts-samples/index.html` (5 minutes) reste conseillée** avant de figer la voix.

## 4. Résultats

### 4.1 Français (5 phrases, 1 prise, sauf mention)

| système / voix | UTMOS moy. (min) | CER moy. | prises fautives | débit car/s | F0 méd. | RTF | licence voix |
|---|---|---|---|---|---|---|---|
| Pocket `french` / **george** (VCTK) | **4,12** (3,90) · 20 prises : **4,16 ± 0,14** | 0 | 0/20 | 17,7 (rapide) | 123 Hz | 0,44 | CC-BY-4.0 |
| Pocket `french` / **bill_boerst** | 3,83 (3,45) · 20 prises : **3,99 ± 0,24** | 0,024 | 1/20 : « …désert de ~~l'Ocre~~ » | 15,8 (14,6 avec atempo 0,92) | 123 Hz | 0,44 | **CC0** |
| Pocket `french_24l` / bill_boerst | 4,01 (3,74) | **0,129** | **1 inintelligible** : « or coree pronotate » | 16,5 | 119 Hz | **2,9-4,4** | CC0 |
| Pocket `french_24l` / peter_yearsley | 3,90 (3,62) | 0,005 | 0 | 16,0 | 90 Hz | 2,4 | CC0 |
| Kokoro / **ff_siwis** speed 0,9 | 3,83 (3,50) | 0,008 | 0 (« choisisse » entendu « choisit ») | 14,0 | **211 Hz (voix féminine)** | 0,42 | CC-BY-4.0 (SIWIS) |
| Chatterbox v3 / clone CML-TTS 1406 | 3,92 (3,75) | 0,042 | 1 : « **Discompte** » pour « Dix secondes » | 15,8 | 101 Hz | 11,9 | CC-BY-4.0 |
| Chatterbox v3 / clone CML-TTS 4193 (ex 0,5 cfg 0,5) | 3,86 (3,66) | 0,008 | 0 | **12,0 (posé)** | **86 Hz** | ~15 | CC-BY-4.0 |
| Chatterbox v3 / clone 4193 (ex 0,4 cfg 0,3) | 3,79 (3,70) | 0,008 | 0 | 11,6 | 86 Hz | 14,4 | CC-BY-4.0 |
| Pocket `french` / **peter_yearsley** | 3,71 (3,11) · 20 prises : 3,83 ± 0,30 | 0 | 0/20 | 14,9 | **85-97 Hz (grave)** | 0,44 | **CC0** |
| Piper siwis-medium | 3,56 (3,38) | 0,008 | 0 | 15,0 | 192 Hz (F) | ~0,3 | CC-BY-4.0 |
| Pocket `french` / estelle | 3,31 (3,03) | 0,021 | 1 | 15,3 | 241 Hz (F) | 0,64 | CC0 |
| Piper upmc (pierre) | 3,19 (2,65) | 0,005 | 0 | 14,6 | 127 Hz | ~0,3 | **CC-BY-SA** |
| Piper gilles-low | 3,11 (**1,68**) | 0,011 | 1 cassée (10 s, dont 2,9 s de silence) ; nasales manquantes (« Missing phoneme ̃ ») | 9,1 | 95 Hz | ~0,3 | CC0 |
| Piper tom-medium | 2,98 | 0 | 0 | 11,9 | 132 Hz | ~0,3 | **AGPL-3.0** |
| Pocket javert / marius (dons amateurs) | 2,60 / 2,32 | 0 | 0 | — | — | 0,44 | CC0 : voix bruitées ou hésitantes, à éviter |
| Piper mls-medium | 2,02 | **0,62** | 5/5 | — | — | — | inutilisable |

### 4.2 Anglais (5 phrases)

| système / voix | UTMOS moy. (min) | CER | débit car/s | F0 | RTF |
|---|---|---|---|---|---|
| Kokoro af_heart (F) | 4,51 (4,49) | 0 | 14,5 | 197 | 0,48 |
| Kokoro am_fenrir | 4,45 (4,35) | 0 | 15,4 | 137 | 0,41 |
| **Pocket `english` / bill_boerst** | **4,43 (4,37)** · 20 prises : **4,40 ± 0,05** | 0 (0/20) | 14,2 (13,1 avec atempo 0,92) | 127 | 0,50 |
| Kokoro am_onyx | 4,36 (4,31) | 0 | **11,1** | **89** | 0,51 |
| Chatterbox v3 / clone bill_boerst | 4,35 (4,20) | 0 | 14,7 | 113 | 17,2 |
| Kokoro bm_george | 4,33 (4,26) | 0 | 11,1 | 149 | 0,46 |
| Kokoro am_michael | 4,32 | 0 | 12,8 | 125 | 0,50 |
| Kokoro bm_fable | 4,31 (4,15) | 0,02 (« lead » entendu « Laid ») | 10,3 | 119 | 0,43 |
| Pocket george | 4,25 · 20 prises : 4,36 ± 0,15 | 0 (0/20) | 16,0 | 129 | 0,57 |
| Pocket **peter_yearsley** | 4,27 · 20 prises : 4,27 ± 0,10 | 1/20 (« Ochre » entendu « Oka ») | 13,1 | **94** | 0,47 |
| Piper northern_english_male | 4,13 | 0,02 (« Orca's ») | 15,4 | 113 | ~0,3 |
| Piper alan | 4,03 | 0 | 11,3 | 101 | ~0,3 |
| Pocket javert / marius | 3,40 / 2,97 | 0 | — | — | — |

### 4.3 Expériences complémentaires

- **Ralenti `atempo 0.92`** (ffmpeg, algorithme WSOLA), testé sur 5 voix Pocket :
  - UTMOS inchangé (écarts de −0,02 à +0,02) ;
  - débit −8 % (FR bill_boerst : 15,8 → 14,6 car/s ; EN : 14,2 → 13,1).
  - Pocket n'a pas de paramètre de vitesse : c'est donc **le** levier « voix posée ».
- **Ponctuation et pauses** (Pocket FR, 3 graines) :
  - « . » donne une pause de ~0,5 s ;
  - « … », « ... » et « , » ne l'allongent pas (0,1 à 0,6 s, très variable).
  - D'où le marqueur **`[pause 700]`** de l'outil : synthèse par morceaux et silence exact.
- **Fin de phrase avalée** : sur « …du désert de l'Ocre. », `bill_boerst` sous-articule le dernier mot. Sur 16 transcriptions (4 prises de base ou à graine, plus 4 graines × `frames_after_eos` ∈ {défaut, 4, 8}), Whisper entend « locre » (correct) 3 fois, « Locke » ou « rock » 9 fois, et rien 4 fois. Supertonic le prononce de façon intelligible 5 fois sur 5.
  - Le spectrogramme montre un /lɔ/ faible puis un /kʁ/ soufflé.
  - Ce n'est **pas** une troncature : `frames_after_eos` à 4 ou 8 ne change rien.
  - Règle d'écriture qui en découle : ne pas finir une phrase sur un nom de couleur court, ou vérifier par ASR.
- **UTMOS ne détecte pas les prises inintelligibles** : la prise « or coree pronotate » a obtenu un UTMOS de **4,19**. D'où l'ASR obligatoire (`--asr`) dans l'outil.
- **Écrêtage** : Chatterbox dépasse 0 dBFS (jusqu'à 86 échantillons écrêtés par clip) et Piper sort à 0 dBFS. L'outil ramène la crête à −1 dBFS avant l'export PCM puis normalise.
- **Spectrogrammes** (« Le vent se lève… ») :
  - Pocket bill_boerst et Kokoro : propres, harmoniques nettes, vraies pauses de phrasé chez Pocket (~0,6 s) ;
  - Pocket george : léger plancher de bruit (prise de son VCTK) ;
  - Piper : souffle large bande du vocodeur, visible entre les mots ;
  - Chatterbox : dense, plancher de bruit modéré.
- **Normalisation de l'outil**, vérifiée sur les 10 répliques d'exemple : **−16,0 LUFS ± 0,2**, true-peak entre −2,6 et −1,5 dBTP. Sans pré-limiteur, loudnorm linéaire laissait des écarts jusqu'à −17,9 LUFS sur des clips à crête marquée.

### 4.4 Supertonic 3 et Qwen3-TTS VoiceDesign

**Supertonic 3** : voix M1 à M5 (masculines), `speed 0.95`, 16 étapes de flow-matching, 5 phrases par langue et par voix, RTF ≈ 0,95 sous contention.

| voix | UTMOS FR (min) | UTMOS EN (min) | CER FR / EN | débit FR car/s | F0 |
|---|---|---|---|---|---|
| **M4** | **3,92** (3,80) | **4,48** (4,45) | 0 / 0,01 | 15,9 | 122 Hz |
| M5 | 3,78 (3,58) | 4,38 (4,29) | 0 / 0,01 | 14,7 | **88-95 Hz** |
| M1 | 3,71 (3,54) | 4,34 (4,13) | 0 / 0,01 | 15,5 | 126-139 Hz |
| M2 | 3,70 (3,67) | 4,36 (4,32) | 0 / 0,01 | 15,8 | 90 Hz |
| M3 | 3,51 (3,18) | 4,32 (4,20) | 0 / 0,01 | 18,0 | 96-107 Hz |

- En FR, l'intelligibilité est **parfaite sur les 25 clips**. C'est le seul système à rendre « choisisse » et « de l'Ocre » correctement à chaque fois.
- En EN, « Ochre » est prononcé « Okra » par les 5 voix : ne pas utiliser ce nom en anglais.
- Silences de tête et de queue de 0,3-0,7 s (retirés par l'outil).
- Côté licence, le modèle est sous **OpenRAIL-M** : usage commercial permis, mais avec des restrictions d'usage (pas de désinformation, pas d'usurpation…), et le dépôt est **archivé** (plus de maintenance).
- Moteur intégré à l'outil : preset `narrator_supertonic` (M4, vitesse 0,9).

**Qwen3-TTS 1.7B VoiceDesign** : voix créée par la description « voix d'homme mûr, grave et posée, un peu rauque : un vieux conteur du désert qui parle lentement, à voix basse, avec un ton calme et mystérieux » (équivalent EN pour l'anglais).

- C'est conceptuellement le plus proche du brief, mais c'est **inutilisable sur ce CPU** :
  - RTF **50-65 en bf16** (bf16 émulé sur Zen 2) : 209 s pour 3,2 s d'audio ;
  - **11 à 20 en fp32**, qui demande 7,2 Go de RAM et fait swapper la machine (51 s pour 4,6 s d'audio dans le meilleur cas).
- Clips produits en fp32 ou bf16, avant l'arrêt pour cause de swap : 4 FR, 1 EN.
  - UTMOS : EN 4,12 ; FR 1,96 / 3,30 / 3,55.
  - **La voix change d'une réplique à l'autre** : F0 de 269 Hz sur « Le Corail… » contre 78-93 Hz sur les autres. Le *voice design* re-tire la voix à chaque appel. Il faudrait « concevoir puis cloner » avec le modèle Base, soit une étape et 4 Go de plus.
  - Une erreur de mot : « Ne peut encore basculer ».
  - Débit très posé (10-13 car/s) et voix grave quand elle est tenue : c'est ce qu'on cherche, mais pas sur ce matériel.

### 4.5 Sorties finales de l'outil (ce que le jeu recevrait)

Protocole : `tools/tts/tts.sh lines.example.json --takes 4 --asr` (whisper `small`), sur 10 répliques FR+EN et 3 presets. Les résultats sont dans `assets-staging/tts-samples/final-*`, en tête de `index.html`.

| preset | UTMOS moyen FR / EN | loudness mesurée | alertes ASR | temps |
|---|---|---|---|---|
| `narrator` (Pocket, bill_boerst, tempo 0,92) | **4,12 / 4,44** | −16,0 ± 0,2 LUFS | 1 : « l'Ocre » entendu « Locke », signalé via `keywords` | 109 s pour 10 répliques |
| `narrator_deep` (Pocket, peter_yearsley, tempo 0,95) | 4,03 / 4,35 | −16,0 à −16,6 | « Ochre » entendu « Okra » en EN | 108 s |
| `narrator_supertonic` (M4, vitesse 0,9) | 4,10 / 4,49 | −16,0 | « Ochre » entendu « Okra » en EN | 105 s |

Le garde-fou `keywords` fonctionne comme prévu : sur « …du désert de l'Ocre. », aucune des 4 prises Pocket ne fait entendre « Ocre ». L'outil retient la moins mauvaise, écrit `⚠ … mots-clés non entendus : ['ocre'] → reformuler ou changer de voix` et met `asr_ok: false` dans le manifest. C'est exactement le signal attendu pour l'agent qui écrit les répliques.

### 4.6 Les 12 couleurs de joueur (ART_BIBLE §joueurs), via le pipeline `narrator`

Réplique : « Le/L'<Couleur> prend la tête ! » / « <Color> takes the lead! », en 4 prises, avec ASR `small` et `keywords` = [couleur]. Temps : 205 s pour les 24 répliques. Clips dans `assets-staging/tts-samples/final-colors/`.

| résultat | FR | EN |
|---|---|---|
| OK du premier coup | Corail, Lagon, Indigo, Safran, Azur, Prune, Anis, Rose, Jade (9/12) | Coral, Lagoon, Indigo, Carmine, Plum, Anise, Teal, Rose, Lilac, Jade (10/12) |
| **vrai défaut de prononciation** (vérifié par contre-test) | **Carmin** entendu « Carmen » 4 prises sur 4 (Supertonic : OK) ; **« Le Sarcelle »** entendu « sorcelle » (Supertonic : « Sarcell », donc OK) | — |
| faux positif (orthographe Whisper d'un homophone) | Lilas entendu « lila » | Saffron entendu « Safran » ; Azure entendu « as your » |

Corrections testées dans le pipeline, avec 4 prises et ASR :

- `say: "Le Carmain prend la tête !"` → entendu « Le Carmain », OK. Le sous-titre garde « Carmin ».
- « **La** Sarcelle prend la tête ! » (article féminin, naturel en français) → OK. « Sarcelle prend la tête ! », sans article, a échoué (« Sa salle »).
- Ces cas ont motivé le champ `say` (graphie prononcée) et les variantes `|` dans `keywords`, tous deux ajoutés à l'outil.

## 5. Recommandation

### 5.1 Outil et réglages

| | valeur |
|---|---|
| Moteur | **Pocket TTS 3.3.0** (`pip install pocket-tts==3.3.0`), torch 2.14 CPU |
| Modèle FR | `french` (6 couches). **Pas `french_24l`** : c'est une préversion, 5 à 10 fois plus lente, avec une prise inintelligible dans nos tests ; la PR #321 donne un WER de 4,56 % au 6 couches contre 4,70 % au 24 couches. |
| Modèle EN | `english` (alias de `english_2026-09`) |
| Voix FR et EN | **`bill_boerst`**, la même dans les deux langues : lecteur LibriVox (diction de conteur), CC0 |
| Température | 0,3 (défaut Kyutai ; meilleur WER et UTMOS selon leurs évaluations) |
| Tempo | `atempo 0.92`, soit ~14,6 car/s en FR et ~13,1 en EN |
| Sélection | `--takes 4 --asr` (whisper `small`, CER ≤ 0,12) et `"keywords": ["<Couleur>"]` sur chaque réplique nominative. Pour le lot final, `--asr large-v3-turbo`. |
| Sortie | MP3 mono 44,1 kHz VBR q3, −16 LUFS, TP ≤ −1,5 dBTP, 40 ms de silence en tête et 200 ms en queue |

Commande :

```bash
tools/tts/tts.sh assets-src/narrator/lines.json --out public/audio/narrator --takes 4 --asr
```

Variantes prêtes dans `voices.json` :

- `narrator_deep` = `peter_yearsley`, tempo 0,95. C'est plus « vieux conteur » (F0 ≈ 90 Hz), mais l'UTMOS FR est plus variable (σ 0,30) : garder `--takes 4`.
- `narrator_bright` = `george`, tempo 0,9 : meilleur UTMOS FR, mais débit rapide et voix VCTK en CC-BY.
- `narrator_kokoro` = Kokoro : `ff_siwis` en FR (féminine), `bm_george` en EN.

**Choix final de voix** : faire une écoute A/B de 2 minutes entre `bill_boerst` et `peter_yearsley` sur la page d'échantillons. Passer de l'une à l'autre ne demande qu'un changement de preset.

### 5.2 Pourquoi pas les autres

- **Kokoro** : excellent en EN (UTMOS 4,3-4,5), mais sa seule voix FR est féminine et de note B-. Surtout, on perdrait la continuité du personnage entre les deux langues.
- **Chatterbox v3** : il clone n'importe quelle référence libre. La référence CML-TTS 4193 donne même le débit le plus posé (12 car/s, F0 86 Hz). Mais :
  - RTF 12 à 17 sur ce CPU, donc 40 à 110 s par réplique ;
  - erreurs de mots (« Discompte ») et écrêtage ;
  - venv séparé (torch 2.6 épinglé) ;
  - watermark imposé.
  
  Il reste le **plan de secours premium**, si l'écoute juge Pocket trop « lecture de livre ».
- **Piper** : bruit de vocodeur, voix FR masculines en CC-BY-SA ou AGPL, une prise cassée. C'est un cran en dessous.
- **Supertonic 3 (M4)** : c'est le **dauphin**.
  - Pour lui : intelligibilité FR impeccable, UTMOS au niveau de Pocket : FR 3,92 contre 3,99 et EN 4,48 contre 4,40 en prise unique ; 4,10 / 4,49 contre 4,12 / 4,44 dans le pipeline à 4 prises, paramètre de vitesse natif, rapide.
  - Contre lui :
    - la licence OpenRAIL-M, moins simple que CC-BY ;
    - le dépôt archivé, sans correctifs à attendre ;
    - des voix de synthèse génériques, sans l'identité de « vrai conteur » d'un lecteur LibriVox ;
    - la mauvaise prononciation de « Ochre » en EN.
  - Bascule en une ligne : `"voice": "narrator_supertonic"`. À considérer si l'écoute juge Pocket trop irrégulier.
- **Qwen3-TTS VoiceDesign** : c'est la meilleure idée (une voix décrite par un texte), mais il faut un GPU. Sur ce CPU, le RTF de 11 à 65 et la voix qui change à chaque appel le rendent inutilisable pour itérer.

### 5.3 Licences et crédits à afficher

| élément | licence | crédit |
|---|---|---|
| Pocket TTS, poids FR et EN | CC-BY-4.0 | « Synthèse vocale : Pocket TTS, Kyutai (CC BY 4.0) » |
| Voix `bill_boerst` (ou `peter_yearsley`) | CC0 (LibriVox → Voice-Zero → kyutai/tts-voices) | facultatif : « Voix d'origine : Bill Boerst, LibriVox » |
| Voix VCTK (`george`…), si utilisées | CC-BY-4.0 | « CSTR VCTK Corpus, University of Edinburgh » |
| Références Chatterbox testées | CML-TTS FR (CC-BY-4.0), fichiers `cml-tts/fr/*_enhanced.wav` de kyutai/tts-voices ; voice-zero (CC0) | si utilisées : « CML-TTS dataset (CC BY 4.0) » |

À ne pas utiliser :

- les voix Pocket `cosette` (Expresso) et `jean` (EARS), qui sont **CC-BY-NC** ;
- les voix Piper `ryan` (CC-BY-NC-SA), `lessac` (licence Blizzard) et `tom` (AGPL).

## 6. Écrire pour le TTS (règles pour l'agent narration)

1. **Une réplique = un fichier, avec la couleur dedans.** Pas de collage « Le » + « Corail » + « prend la tête » : les jointures s'entendent. Chaque réplique existe en 12 variantes de couleur.
   - Estimation : changement de leader (12) + gros vol (12) + vainqueur (12) + ~20 génériques ≈ **56 répliques par langue, ~110 au total, ~5 min d'audio, ~1,5-2 Mo par langue** en MP3 q3 (82 kb/s mesurés).
2. **Nombres en lettres** : « Dix secondes ».
3. **Nom de couleur en début de phrase ou suivi d'un mot**, pas en tout dernier mot : Pocket sous-articule parfois le mot final.
   - ✗ « …du désert de l'Ocre. »
   - ✓ « L'Ocre vient de perdre la moitié de son désert. »
4. **Chaque réplique nominative porte `"keywords": ["<Couleur>"]`** (validation ASR). Règles issues du test des 12 couleurs (§4.6) :
   - **Carmin** : `"say": "… Carmain …"` (sinon « Carmen »).
   - **Sarcelle** : toujours « **la** Sarcelle ». Plus généralement, **mettre l'article naturel**, et ne pas utiliser « le » devant un nom féminin.
   - **Lilas** : `keywords: ["Lilas|lila"]`. **Saffron** : `["Saffron|Safran"]`. **Azure** : alerte ASR attendue (« as your »), à valider à l'oreille.
   - « Ocre » en fin de phrase et « Ochre » en EN sont fragiles. Ils ne font pas partie des 12 couleurs du jeu, mais la règle vaut pour tout nom court en fin de phrase.
5. Phrases de **4 à 12 mots** (1,5 à 3,5 s). Pour un suspense : « Dix secondes. [pause 600] Tout peut encore basculer. »
6. Pas de guillemets ni de parenthèses : Pocket FR les supprime ou les remplace.
7. Le « ! » ne rend pas la voix plus énergique de façon fiable. Le ton vient de la voix de référence (lecteur calme), ce qui colle au « conteur ».

## 7. Intégration runtime (suggestions pour l'agent audio)

- Charger `manifest.json` et **la seule langue active**. On peut décoder à la volée (Web Audio `decodeAudioData`) : ~30 Ko par réplique.
- **Ducking** musique et ambiance : −6 dB pendant la réplique (attaque 120 ms, relâche 400 ms).
- **Rareté** :
  - au plus 1 réplique toutes les 8 à 12 s ;
  - file à priorité (résultats > dernières secondes > leader > vol > soleil) ;
  - on jette un événement vieux de plus de 1,5 s ;
  - pas deux fois la même variante d'affilée.
- **Sous-titre synchronisé** : durée d'affichage = `duration_s` + 0,6 s.
- Réglages : volume « Voix » séparé, mode `Voix + texte` / `Texte seul` / `Désactivé`.

## 8. Limites et risques

- **Pas d'écoute humaine** : l'accent de `george` (anglophone) en FR, le « mystère » et l'intonation ne sont pas mesurés. D'où l'écoute A/B recommandée (5 min).
- **UTMOS est biaisé vers l'anglais** : il ne sert qu'à classer des prises d'une même voix. **L'ASR est le seul filet contre les prises inintelligibles.**
- **Variance de Pocket** : σ UTMOS de 0,24 en FR. Environ 1 prise sur 20 est fautive en FR (mot final avalé), et bien davantage quand la phrase finit sur « l'Ocre ». Test dédié sur « …du désert de l'Ocre. » : 13 transcriptions ratées sur 16 (mot absent, ou entendu « Locke »/« rock »). `--takes 4 --asr` rend ce risque négligeable, mais il faut relire le log `⚠`.
- **Clonage de voix `.wav` avec Pocket** : il demande d'accepter les CGU du dépôt restreint `kyutai/pocket-tts` et un `hf auth login`. **Non nécessaire** avec les voix prédéfinies.
- **NixOS** : les wheels torch demandent `LD_LIBRARY_PATH=$NIX_LD_LIBRARY_PATH` (géré par `tts.sh`). espeak-ng (Kokoro) casse si le chemin du venv dépasse ~160 caractères (contourné dans l'outil).
- **Temps CPU** : faster-whisper `large-v3-turbo` coûte ~15-35 s par clip sur ce CPU. D'où `small` par défaut dans l'outil.

## 9. Plan B : texte à l'écran

À implémenter **quel que soit le choix TTS**, c'est aussi de l'accessibilité : pièce bruyante, joueurs sourds ou malentendants.

- **Bandeau narrateur** en bas d'écran, typographie du jeu (ligne claire), fond pastel semi-opaque, apparition en fondu et léger glissement (200 ms).
  - Durée : `duration_s + 0,6 s` avec voix.
  - En texte seul : `clamp(1,8 s ; 0,9 s + 0,06 s × caractères ; 5 s)`.
- **Nom de couleur coloré** dans le texte (pastille ou mot teinté), pour le lien immédiat avec le joueur.
- Même file de priorité et même cooldown que la voix : le texte seul reste rare.
- **Repli automatique** : si le MP3 de la langue courante manque au chargement, ou si l'audio est bloqué par la politique d'autoplay, on affiche le texte seul.

## 10. Livrables

- `tools/tts/` :
  - `gen.py` : moteurs pocket, supertonic, kokoro et chatterbox ; prises multiples + UTMOS + ASR avec `keywords` (variantes `|`) ; `say` (graphie prononcée distincte du sous-titre) ; `[pause N]` ; hash ID3 idempotent ; protection des fichiers externes ; manifest ; écritures atomiques ;
  - `tts.sh` : NixOS et ffmpeg via `nix-shell` ;
  - `setup.sh`, `requirements.txt`, `requirements-chatterbox.txt`, `voices.json` (5 presets), `lines.example.json`, `README.md`.
- `assets-staging/tts-samples/` :
  - `index.html` : page d'écoute, avec les sorties finales en tête puis le banc d'essai, les métriques et les licences ;
  - `final-{narrator,narrator_deep,narrator_supertonic}/` : sorties de l'outil, avec leur `manifest.json` ; `final-colors/` : les 12 couleurs × 2 langues ;
  - `{pocket,kokoro,piper,chatterbox,supertonic,qwen3-tts}/` : 259 clips du banc d'essai, normalisés à −16 LUFS (~11 Mo au total).

## Décisions proposées

1. **TTS du narrateur = Kyutai Pocket TTS 3.3.0**, en local sur CPU. Poids CC-BY-4.0 ; crédit « Pocket TTS, Kyutai » dans les crédits du jeu.
2. **Voix unique FR+EN = `bill_boerst`** (CC0), tempo 0,92. Alternative `peter_yearsley` après une écoute A/B de 5 min par le lead. Pas de voix NC, pas de clonage.
3. **Modèles `french` (6 couches) et `english`**, température 0,3. `french_24l` est interdit (préversion lente, prises inintelligibles). **Repli documenté** : preset `narrator_supertonic` (Supertonic 3, voix M4), si l'écoute ou le log ASR montrent trop de prises FR ratées.
4. **Génération : `tools/tts/tts.sh <lines.json> --out public/audio/narrator --takes 4 --asr`**, avec `keywords` = le nom de couleur sur chaque réplique nominative, et **zéro `asr_ok: false` toléré** dans le manifest final. Les MP3 générés sont commités, avec leur `manifest.json`. Le lot final est vérifié avec `--asr large-v3-turbo`.
5. **Format audio narrateur** : MP3 mono 44,1 kHz VBR q3, **−16 LUFS intégrés, true-peak ≤ −1,5 dBTP**, 40 ms de silence en tête et 200 ms en queue. Arborescence `public/audio/narrator/<lang>/<id>.mp3`.
6. **Une réplique par couleur** (pas de collage), nombres en lettres, couleur jamais en dernier mot, `[pause N]` pour le suspense. Environ 56 répliques par langue. **Carmin → `say` « Carmain » ; « la Sarcelle » avec article féminin** ; `keywords` avec variantes pour Lilas et Saffron (§4.6).
7. **Sous-titres toujours disponibles**. Réglage Narrateur `Voix + texte` (défaut) / `Texte seul` / `Désactivé`, repli automatique sur le texte si l'audio manque.
8. **Runtime** : ducking −6 dB de la musique, cooldown de 8 à 12 s, file à priorité, chargement de la seule langue active.
9. **flake.nix** : le devShell contient déjà `ffmpeg` et `sox`. On peut ajouter `python311` et `uv` pour que `tools/tts/setup.sh` fonctionne sans prérequis. Le venv reste local (`tools/tts/.venv/`, déjà ignoré par git).

## Sources

- Pocket TTS : [github.com/kyutai-labs/pocket-tts](https://github.com/kyutai-labs/pocket-tts), [HF kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts), [PR #321 (modèles FR 6L/24L, WER 4,56 %)](https://github.com/kyutai-labs/pocket-tts/pull/321), [annonce multilingue](https://x.com/kyutai_labs/status/2051317316713894368), [licences des voix kyutai/tts-voices](https://huggingface.co/kyutai/tts-voices/blob/main/README.md)
- Kokoro : [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), [VOICES.md (grades)](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)
- Chatterbox : [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox), [Multilingual v3](https://www.resemble.ai/resources/chatterbox-multilingual-v3-tts-with-embedded-watermarking-for-25-languages)
- Qwen3-TTS : [blog](https://qwen.ai/blog?id=qwen3tts-0115), [rapport technique](https://arxiv.org/html/2601.15621v1)
- Supertonic : [supertone-inc/supertonic](https://github.com/supertone-inc/supertonic), [HF Supertone/supertonic-2](https://huggingface.co/Supertone/supertonic-2)
- Piper : [rhasspy/piper-voices (fr_FR)](https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR) : fichiers MODEL_CARD par voix
- Licences exclues : [F5-TTS (CC-BY-NC)](https://huggingface.co/SWivid/F5-TTS), [discussion F5 commercial](https://github.com/SWivid/F5-TTS/discussions/997), [OpenAudio S1-mini (CC-BY-NC-SA)](https://huggingface.co/fishaudio/openaudio-s1-mini), [Voxtral TTS (CC-BY-NC)](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603), [XTTS-v2 (CPML)](https://huggingface.co/coqui/XTTS-v2)
- Autres : [Kyutai TTS 1.6B en_fr](https://huggingface.co/kyutai/tts-1.6b-en_fr), [Zonos](https://github.com/Zyphra/Zonos), [Fun-CosyVoice3](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512), [NeuTTS Nano French](https://huggingface.co/neuphonic/neutts-nano-french), [Orpheus FR](https://huggingface.co/canopylabs/3b-fr-ft-research_release), [TTS Arena 2026](https://offlinetts.com/blog/tts-arena-leaderboard-2026/)
- Évaluation : [SpeechMOS / UTMOS22](https://github.com/tarepan/SpeechMOS), [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
