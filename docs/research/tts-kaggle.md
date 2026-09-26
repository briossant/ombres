# TTS du narrateur : les gros modèles sur GPU Kaggle

> Mission : vérifier si un modèle plus lourd que Pocket TTS, exécuté sur les GPU gratuits de Kaggle, donne un meilleur « conteur du désert » (voix grave et posée, calme, un peu étrange, répliques de moins de 3 s, FR et EN), sous licence libre.
> Livrables : ce document ; les kernels et scripts reproductibles dans `tools/tts-kaggle/` ; des échantillons d'écoute (5,7 Mo, page `index.html`) dans le dossier de travail de la session, `…/scratchpad/tts-kaggle/samples/`.
> Date : 26/09/2026. Suite de `docs/research/tts.md` (banc CPU d'origine). Pas de clé Gemini : l'API Gemini n'a pas été testée.

## En bref

- **Français : passer à Qwen3-TTS 1.7B** (Alibaba, Apache-2.0), avec une voix conçue par description puis clonée, accélérée de 20 % (`atempo 1.2`).
  - 30 prises sur 30 intelligibles, contre 27 sur 30 pour Pocket brut. Pocket dit « elle fiche tout » à chaque prise ; Qwen3 dit « fige ».
  - UTMOSv2 3,47 contre 2,89 pour le lot actuel ; UTMOS22 au même niveau (4,00 contre 4,03), DNSMOS un peu meilleur (3,39 contre 3,31).
  - Voix plus grave (F0 87 Hz contre 122 Hz) et plus posée (3,8 syllabes/s contre 4,0), la plus stable d'une prise à l'autre (cohérence 0,96).
  - Avec la règle « 3 s parlées au plus » et le tri ASR du lot, chacune des 10 répliques FR garde au moins une bonne prise.
  - Aucune voix humaine n'est clonée : la référence est une sortie de VoiceDesign (`tools/tts-kaggle/data/voices/qwen3_design.wav`).
- **Anglais : garder Pocket.** Rien ne le bat nettement une fois les prises triées : Qwen3 et Chatterbox gagnent 0,3 point d'UTMOSv2, mais UTMOS22 bouge à peine (4,43 contre 4,36) et le lot trié est déjà intelligible à 100 %. Si l'on veut le même personnage dans les deux langues, la voix conçue de Qwen3 marche aussi en anglais (UTMOSv2 3,57) mais garde un léger accent français (Whisper ne reconnaît l'anglais qu'à 68 %) : à trancher à l'oreille.
- Coût : Qwen3-TTS tourne à 2,3 fois le temps réel sur une T4 en float32. Le lot FR complet (361 clips × 4 prises) demande environ 1 h 45 sur les 2 T4 d'un kernel, plus 25 min de tri ASR. Le quota réel du compte est de 6 h de GPU par semaine (pas 30 h) ; le banc en a consommé 1 h 56, il en reste environ 4 h jusqu'au samedi 3 octobre.
- Écartés : VoxCPM2 (qualité en retrait en FR, UTMOS 3,35), Kyutai TTS 1.6B (les voix libres utilisables plafonnent à un UTMOS de 3,4, et l'embedding de la voix `frm` lui fait réciter sa phrase de référence), CosyVoice3 (répliques trop longues, accent avec une référence anglaise). Chatterbox v3 reste un bon plan B pour garder la voix `bill_boerst` en FR, mais il est lent (18 × le temps réel sur CPU).
- Avant de régénérer : 2 minutes d'écoute de `samples/index.html`, lignes `pocket-lot` et `qwen3-design@1.2`. Les métriques ne mesurent ni le charme ni l'étrangeté.

---

## 1. Point de départ

Le lot actuel compte 722 clips générés sur CPU avec Pocket TTS 3.3 et la voix `bill_boerst` (lecteur LibriVox, CC0). Il passe tous les contrôles, mais au prix de contournements : « Carmin » s'écrit « Carmain » pour être bien dit, « elle fige tout » est devenu « elle glace tout » parce que Pocket disait « fiche », et une trentaine de tournures ont été réécrites (`docs/agent-notes/director.md` §5). La voix elle-même est un lecteur de livres audio anglophone, F0 ≈ 120 Hz : correct, pas spécialement grave.

La question posée ici : un modèle récent, trop lourd pour le CPU de dev mais à la portée d'une T4, fait-il mieux, et dans quelle langue ?

## 2. Candidats et licences (septembre 2026)

Licences relevées sur les cartes Hugging Face (`cardData.license`) et les dépôts le 26/09/2026. On exige une licence libre pour les poids et pour la voix de référence, sans clause NC.

| modèle | taille | FR | licence des poids | voix utilisée | statut |
|---|---|---|---|---|---|
| Qwen3-TTS 12 Hz 1.7B Base + VoiceDesign (Alibaba, janv. 2026) | 1,9 B | oui (10 langues) | Apache-2.0 | clone d'une référence libre, ou voix conçue par description | testé, retenu en FR |
| VoxCPM2 (OpenBMB, avril 2026) | 2,3 B | oui (30 langues), sortie 48 kHz | Apache-2.0 | clone, ou voix conçue | testé |
| Chatterbox Multilingual v3 (Resemble AI) | 0,5 B | oui (23 langues) | MIT ; watermark PerTh inaudible dans chaque sortie | clone | testé, plan B |
| Fun-CosyVoice3 0.5B 2512 (Alibaba) | 0,5 B | oui (9 langues) | Apache-2.0 | clone | testé |
| Kyutai TTS 1.6B en_fr (juil. 2025) | 1,8 B | natif FR/EN | CC-BY-4.0 | seulement les voix de `kyutai/tts-voices` livrées avec un embedding (pas de clonage d'un wav) | testé |
| Pocket TTS 3.3 (référence) | 0,1 B | oui | CC-BY-4.0 | `bill_boerst` (CC0) | lot actuel |
| MOSS-TTS v1.5 et Local-Transformer v1.5 (OpenMOSS, mai-juin 2026) | 8,5 B / 4,6 B | oui (31 langues) | Apache-2.0 | clone | non testé : ne tient pas sur une T4 en float32 ; à essayer en float16 si Qwen3 déçoit à l'écoute |
| Magpie-TTS Multilingual 357M (NVIDIA) | 0,36 B | oui | NVIDIA Open Model License (usage commercial permis, sous conditions) | voix fixes | non testé : pile NeMo, voix imposées |
| Breeze TTS 2 (BreezeBlue, 2026) | 3 B | 50 langues | BreezeBlue Research and Non-Commercial | — | exclu (NC), bien qu'en tête des modèles ouverts de l'arène Artificial Analysis (Elo 1206) |
| Fish Audio S2 Pro | — | oui | Fish Audio Research License (non commerciale) | — | exclu |
| OmniVoice (k2-fsa, avril 2026) | 0,6 B | 600+ langues | poids CC-BY-NC (données Emilia) | — | exclu |
| Voxtral TTS 4B (Mistral) | 4 B | oui | CC-BY-NC-4.0 | — | exclu |
| Orpheus 3B FR (Canopy) | 3 B | oui | carte Apache-2.0, base Llama 3.2, dépôt restreint « research release » | — | exclu : licence ambiguë |
| Higgs Audio v2/v3 (Boson AI) | 3 B+ | pas de FR annoncé | licence communautaire Boson (dérivée de Llama 3) | — | non retenu |

Réputation, faute de pouvoir écouter. Dans l'arène « Provider Voices » d'Artificial Analysis (fin août 2026), les modèles à poids ouverts les mieux classés sont Breeze TTS 2 (1206), Fish S2 Pro (1119), Step Audio EditX (1095), Voxtral TTS (1079), Kokoro (1065) et Magpie-Multilingual (1063) ; Chatterbox est à 1023. Qwen3-TTS, VoxCPM2 et Kyutai 1.6B n'y figurent pas. Le rapport technique de Qwen3-TTS annonce le WER le plus bas en français parmi les systèmes comparés (dont ElevenLabs et MiniMax) et la meilleure similarité de locuteur sur ses 10 langues ; celui de VoxCPM2 annonce 1,68 % de WER moyen sur 30 langues. Ce sont des chiffres de fournisseur, sur de longues phrases : le banc ci-dessous est là pour les vérifier sur nos répliques.

## 3. Protocole

Matériel. Kernels Kaggle privés préfixés `ombres-tts-`, image Python 3.12 / torch 2.10. Qwen3-TTS, VoxCPM2 et les évaluations ont tourné sur 2 × T4 (float32 : la T4 n'a pas de bf16 natif). La file d'attente T4 a dépassé une heure ce samedi soir et le compte n'admet que 2 sessions GPU, dont l'une est restée prise par une session fantôme pendant plusieurs heures (voir `tools/tts-kaggle/README.md`). Chatterbox, CosyVoice3, Kyutai 1.6B et Pocket ont donc tourné sur les kernels CPU (4 vCPU, sans quota) : leur facteur temps réel (RTF) est un chiffre CPU, pas GPU. La qualité produite, elle, ne dépend pas du matériel.

Corpus. 18 répliques réelles du jeu (`tools/tts-kaggle/corpus.json`), 10 FR et 8 EN, avec les couleurs difficiles et les tournures déjà signalées :

| FR | EN |
|---|---|
| C'est l'heure dorée. Les ombres voient grand. | Ten seconds. The desert holds its breath. |
| La nuit tombe de la falaise. Elle fige tout. (texte d'origine ; le lot dit « glace ») | Golden hour. The shadows are getting ambitious. |
| Dix secondes. Tout peut encore basculer. | Azure takes the lead. Sand forgets. |
| Lagon prend la tête. Le sable oublie vite. | Anise wears the crown. Mind the talons. |
| Safran porte la couronne. Tout le monde la voit. | Lilac just swallowed a piece of the desert. |
| Carmin vient d'avaler un morceau de désert. (graphie normale ; le lot fait dire « Carmain ») | Indigo moves ahead. The sun saw it coming. |
| Sarcelle esquive. Les serres attrapent du vent. | Saffron dodges. Talons close on air. |
| Azur chasse encore. Surveillez le ciel. | Carmine stole the last of the light. |
| Le désert s'endort chez Lilas, ce soir. | |
| Anis mène la danse. Les dunes suivent. | |

Prises. 3 par réplique et par système, graines 1000, 1101 et 1202, sans aucun tri. Chaque prise est ensuite traitée comme le ferait le lot : bords rognés, pauses internes ramenées à 420 ms. La ligne « Pocket, lot actuel » reprend les MP3 livrés (une prise par réplique, déjà triée par UTMOS et ASR, avec les textes « glace » et « Carmain »).

Voix de référence :

- `bill` : `voice-zero/bill_boerst.wav` (10,8 s, CC0), la voix du lot. L'extrait est l'avertissement LibriVox (« This is a LibriVox recording… »).
- `frm` : `cml-tts/fr/4193_3103_000004-0001_enhanced.wav` (6,5 s, CC-BY-4.0, CML-TTS, nettoyé par Kyutai). Lecteur francophone, F0 89 Hz, 11,4 caractères/s ; la phrase vient de *Vingt mille lieues sous les mers*.
- Voix conçues : Qwen3 VoiceDesign et VoxCPM2 fabriquent une référence de 10 à 12 s à partir de la description « vieux conteur, voix grave, un peu rauque, lente, presque murmurée, mystérieuse, humour sec, francophone ». Le modèle de clonage la reprend ensuite pour toutes les répliques, ce qui fixe la voix. Sur 3 essais, j'ai gardé le plus grave dans une plage plausible : F0 83 Hz pour Qwen3, 113 Hz pour VoxCPM2.
- Kyutai 1.6B n'accepte que les voix livrées avec un embedding, et `bill_boerst` n'en a pas. J'ai trié les 269 voix libres du dépôt sans les écouter (`tools/tts-kaggle/screen_voices.py` : F0 médiane, langue et transcription Whisper ; résultat dans `data/voices_screen.json`) et retenu `frm`, `erick` (don de voix CC0, francophone, 104 Hz) et `jeff` (don CC0, anglophone, 82 Hz). Une variante `frm-slow` teste le paramètre `padding_bonus` qui ralentit le débit.

Mesures, toutes sur GPU (Whisper large-v3 en fp16) :

- intelligibilité : CER après transcription avec l'amorce des 12 noms de couleur (condition P, celle du lot) et sans amorce ; une prise est « intelligible » si son CER ne dépasse pas 0,12 et si les mots-clés sont entendus (le nom de couleur, « fige », « l'heure dorée », « dix secondes », « golden hour ») ;
- p(langue) : probabilité que Whisper, laissé libre, reconnaisse la bonne langue. Un accent étranger marqué la fait chuter ; c'est le seul indicateur d'accent disponible sans écoute ;
- naturel : UTMOS22-strong (entraîné sur de l'anglais), UTMOSv2 et DNSMOS OVRL (propreté du signal, peu sensible à la langue) ;
- durée parlée et part des prises de 3 s au plus ; débit en syllabes par seconde de parole ; F0 médiane ;
- voix : embeddings WavLM-base-plus-SV. « Cohérence » est le cosinus moyen entre toutes les prises d'une langue ; FR↔EN compare les deux langues.

Les variantes « atempo » sont les mêmes prises accélérées par ffmpeg (WSOLA, le filtre du lot), pour voir si les voix lentes tiennent sous 3 s sans y perdre.

## 4. Résultats en français

30 prises par système (10 répliques × 3), classées par UTMOSv2. Le RTF est le temps de calcul divisé par la durée audio, sur T4 ou sur CPU selon la mention.

| système | intelligible (P / sans amorce) | p(langue) | UTMOS | UTMOSv2 | DNSMOS | parole moy. / max | ≤ 3 s | syll/s | F0 | cohérence | RTF |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Qwen3-TTS / clone bill | 63 % / 37 % | 0,22 | 4,39 | 3,50 | 3,33 | 2,7 / 3,1 s | 87 % | 3,6 | 119 Hz | 0,94 | 2,4 T4 |
| Qwen3-TTS / clone frm | 100 % / 90 % | 1,00 | 3,88 | 3,49 | 3,22 | 2,9 / 3,5 s | 63 % | 3,5 | 79 Hz | 0,95 | 2,3 T4 |
| Qwen3-TTS 1.7B / voix conçue | 100 % / 90 % | 0,99 | 4,08 | 3,49 | 3,44 | 3,2 / 3,7 s | 23 % | 3,2 | 86 Hz | 0,97 | 2,3 T4 |
| Qwen3-TTS / clone frm, atempo 1,12 | 100 % / 90 % | 1,00 | 3,83 | 3,47 | 3,23 | 2,6 / 3,1 s | 93 % | 3,8 | 79 Hz | 0,94 | — |
| Qwen3-TTS / voix conçue, atempo 1,2 | 100 % / 93 % | 0,99 | 4,00 | 3,47 | 3,39 | 2,7 / 3,1 s | 87 % | 3,8 | 87 Hz | 0,96 | — |
| Chatterbox v3 / clone frm | 90 % / 77 % | 1,00 | 3,77 | 3,44 | 3,14 | 2,9 / 4,9 s | 70 % | 3,5 | 88 Hz | 0,94 | 13,8 CPU |
| CosyVoice3 / clone frm | 100 % / 87 % | 1,00 | 3,78 | 3,29 | 3,28 | 3,3 / 4,0 s | 30 % | 3,0 | 95 Hz | 0,94 | 13,6 CPU |
| Chatterbox v3 / clone bill | 100 % / 97 % | 1,00 | 4,07 | 3,26 | 3,35 | 2,4 / 2,9 s | 100 % | 4,2 | 120 Hz | 0,93 | 18,3 CPU |
| CosyVoice3 / clone bill | 47 % / 40 % | 0,45 | 4,20 | 3,17 | 3,33 | 4,1 / 6,5 s | 10 % | 2,5 | 127 Hz | 0,91 | 15,1 CPU |
| VoxCPM2 / clone frm, atempo 1,1 | 100 % / 80 % | 1,00 | 3,35 | 3,06 | 2,88 | 2,7 / 3,8 s | 77 % | 3,8 | 80 Hz | 0,95 | — |
| Kyutai 1.6B / erick | 80 % / 53 % | 1,00 | 3,36 | 3,05 | 3,27 | 2,9 / 3,7 s | 73 % | 3,5 | 107 Hz | 0,92 | 11,1 CPU |
| VoxCPM2 / clone frm | 100 % / 83 % | 1,00 | 3,35 | 3,04 | 2,90 | 2,9 / 4,2 s | 53 % | 3,5 | 80 Hz | 0,95 | 2,3 T4 |
| Pocket, lot actuel (1 prise triée) | 100 % / 70 % | 0,99 | 4,03 | 2,89 | 3,31 | 2,5 / 2,8 s | 100 % | 4,0 | 122 Hz | 0,95 | — |
| VoxCPM2 / clone bill | 67 % / 40 % | 0,56 | 3,84 | 2,89 | 3,34 | 3,0 / 4,0 s | 67 % | 3,3 | 122 Hz | 0,94 | 2,6 T4 |
| Pocket 3.3 / bill_boerst, tempo 0,92 | 90 % / 60 % | 0,98 | 3,92 | 2,85 | 3,36 | 2,4 / 2,8 s | 100 % | 4,1 | 116 Hz | 0,94 | 0,6 CPU |
| VoxCPM2 / voix conçue | 100 % / 87 % | 1,00 | 2,98 | 2,72 | 3,08 | 3,4 / 4,1 s | 20 % | 3,0 | 112 Hz | 0,96 | 2,4 T4 |
| VoxCPM2 / voix conçue, atempo 1,15 | 100 % / 87 % | 1,00 | 2,88 | 2,70 | 3,13 | 3,0 / 3,6 s | 53 % | 3,4 | 112 Hz | 0,96 | — |
| Kyutai 1.6B / frm | 77 % / 60 % | 1,00 | 3,19 | 2,70 | 2,58 | 3,1 / 4,0 s | 43 % | 3,3 | 78 Hz | 0,95 | 11,1 CPU |
| Kyutai 1.6B / jeff | 57 % / 53 % | 0,61 | 2,53 | 2,68 | 2,58 | 3,0 / 4,1 s | 63 % | 3,4 | 82 Hz | 0,93 | 11,0 CPU |
| Kyutai 1.6B / frm, débit lent | 87 % / 50 % | 1,00 | 3,03 | 2,54 | 2,53 | 4,2 / 5,8 s | 13 % | 2,5 | 77 Hz | 0,96 | 10,3 CPU |

Ce que j'en retiens :

1. UTMOS22 récompense l'accent anglais. Les deux premiers au classement UTMOS22 sont Qwen3 et CosyVoice3 clonant `bill`, un lecteur anglophone : 4,39 et 4,20. Ce sont aussi les deux pires en intelligibilité (63 % et 47 %) et Whisper n'y reconnaît le français qu'à 22 % et 45 %. Le prédicteur, entraîné sur de l'anglais, préfère un français à l'accent anglais. UTMOS22 ne sert donc qu'à départager des prises d'une même voix, comme dans le lot.
2. UTMOSv2 sépare nettement deux groupes. Qwen3 (3,47 à 3,50) et Chatterbox avec une référence francophone (3,44) dominent ; Pocket (2,85 à 2,89) est dans le groupe du bas, avec VoxCPM2 et Kyutai. DNSMOS, qui juge surtout la propreté, place la voix conçue de Qwen3 en tête (3,44) et Pocket dans la moyenne (3,31 à 3,36).
3. Le clonage d'une voix anglophone donne un accent en français, sauf chez Chatterbox. Qwen3, VoxCPM2 et CosyVoice3 transportent l'accent de `bill` ; Chatterbox le gomme (p(français) 1,00, 100 % intelligible). Pocket aussi, puisque son modèle `french` n'emprunte que le timbre.
4. Les voix graves et posées dépassent 3 s. La voix conçue de Qwen3 parle à 3,2 syllabes/s : seules 23 % de ses prises tiennent en 3 s. Accélérée de 20 %, elle passe à 3,8 syllabes/s et 87 % de prises courtes, pour une perte d'UTMOS de 0,08 et d'UTMOSv2 de 0,02. Elle reste plus lente que Pocket (4,0 à 4,1).
5. Kyutai 1.6B déçoit. Les voix libres qui ont un embedding viennent de lectures amateurs ou de CML-TTS : UTMOS 2,5 à 3,4. Pire, avec l'embedding de `frm`, deux prises récitent la phrase de référence (« C'est l'eau n'est pas absolument incompressible… »). Le paramètre `padding_bonus` ralentit bien le débit (2,5 syllabes/s), mais jusqu'à 5,8 s pour une réplique.

## 5. Résultats en anglais

24 prises par système (8 répliques × 3).

| système | intelligible (P / sans amorce) | p(langue) | UTMOS | UTMOSv2 | DNSMOS | parole moy. / max | ≤ 3 s | syll/s | F0 | cohérence | RTF |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Qwen3-TTS / clone frm | 100 % / 83 % | 0,32 | 4,23 | 3,71 | 3,27 | 3,2 / 4,3 s | 29 % | 3,2 | 84 Hz | 0,94 | 2,3 T4 |
| Chatterbox v3 / clone frm | 92 % / 79 % | 0,97 | 4,24 | 3,68 | 3,18 | 3,0 / 5,4 s | 50 % | 3,4 | 88 Hz | 0,93 | 13,8 CPU |
| Qwen3-TTS 1.7B / voix conçue | 92 % / 75 % | 0,77 | 4,27 | 3,68 | 3,44 | 3,2 / 4,2 s | 33 % | 3,1 | 89 Hz | 0,94 | 2,3 T4 |
| Qwen3-TTS / clone frm, atempo 1,12 | 100 % / 83 % | 0,31 | 4,22 | 3,67 | 3,26 | 2,8 / 3,9 s | 58 % | 3,5 | 85 Hz | 0,94 | — |
| Qwen3-TTS / clone bill | 100 % / 88 % | 1,00 | 4,43 | 3,59 | 3,28 | 2,5 / 3,0 s | 96 % | 4,0 | 122 Hz | 0,94 | 2,4 T4 |
| Chatterbox v3 / clone bill | 96 % / 92 % | 1,00 | 4,36 | 3,59 | 3,31 | 2,5 / 2,8 s | 100 % | 4,1 | 118 Hz | 0,95 | 18,3 CPU |
| CosyVoice3 / clone bill | 92 % / 88 % | 0,98 | 4,37 | 3,58 | 3,32 | 3,0 / 4,0 s | 54 % | 3,4 | 126 Hz | 0,94 | 15,1 CPU |
| Qwen3-TTS / voix conçue, atempo 1,2 | 96 % / 88 % | 0,68 | 4,23 | 3,57 | 3,41 | 2,7 / 3,6 s | 79 % | 3,7 | 89 Hz | 0,93 | — |
| CosyVoice3 / clone frm | 71 % / 42 % | 0,70 | 4,11 | 3,35 | 3,28 | 3,6 / 4,6 s | 12 % | 2,8 | 100 Hz | 0,93 | 13,6 CPU |
| Pocket 3.3 / bill_boerst, tempo 0,92 | 83 % / 92 % | 1,00 | 4,36 | 3,33 | 3,37 | 2,5 / 2,9 s | 100 % | 4,0 | 119 Hz | 0,95 | 0,6 CPU |
| Pocket, lot actuel (1 prise triée) | 100 % / 100 % | 1,00 | 4,36 | 3,27 | 3,36 | 2,6 / 2,8 s | 100 % | 3,9 | 125 Hz | 0,95 | — |
| VoxCPM2 / clone bill | 96 % / 79 % | 1,00 | 4,17 | 3,16 | 3,34 | 2,5 / 3,0 s | 96 % | 4,1 | 123 Hz | 0,95 | 2,6 T4 |
| VoxCPM2 / clone frm, atempo 1,1 | 88 % / 67 % | 0,44 | 3,74 | 3,12 | 2,98 | 2,9 / 4,2 s | 54 % | 3,4 | 84 Hz | 0,95 | — |
| VoxCPM2 / clone frm | 79 % / 75 % | 0,42 | 3,78 | 3,07 | 3,04 | 3,2 / 4,9 s | 38 % | 3,1 | 84 Hz | 0,95 | 2,3 T4 |
| Kyutai 1.6B / erick | 71 % / 50 % | 0,36 | 3,65 | 3,05 | 3,26 | 2,9 / 3,5 s | 58 % | 3,4 | 107 Hz | 0,94 | 11,1 CPU |
| VoxCPM2 / voix conçue | 79 % / 79 % | 0,45 | 3,40 | 2,97 | 3,10 | 3,6 / 4,6 s | 8 % | 2,7 | 119 Hz | 0,94 | 2,4 T4 |
| VoxCPM2 / voix conçue, atempo 1,15 | 75 % / 79 % | 0,45 | 3,31 | 2,94 | 3,16 | 3,2 / 4,0 s | 42 % | 3,1 | 118 Hz | 0,94 | — |
| Kyutai 1.6B / frm | 92 % / 75 % | 0,61 | 3,60 | 2,94 | 2,48 | 2,9 / 4,0 s | 54 % | 3,4 | 77 Hz | 0,93 | 11,1 CPU |
| Kyutai 1.6B / jeff | 83 % / 62 % | 0,89 | 3,02 | 2,81 | 2,38 | 2,7 / 3,5 s | 88 % | 3,7 | 79 Hz | 0,93 | 11,0 CPU |
| Kyutai 1.6B / frm, débit lent | 92 % / 88 % | 0,48 | 3,51 | 2,67 | 2,30 | 4,1 / 5,8 s | 4 % | 2,4 | 78 Hz | 0,93 | 10,3 CPU |

1. Pocket est déjà au niveau. UTMOS22 4,36 pour le lot et pour Pocket brut ; Qwen3 et CosyVoice3 clonant `bill` font à peine mieux (4,43 et 4,37). UTMOSv2 donne 0,3 point d'avance à Qwen3, Chatterbox et CosyVoice3 clonant `bill` (3,58-3,59 contre 3,27-3,33).
2. Pocket brut avale « Golden hour » trois fois sur trois (« The Shadows are getting ambitious ») et dit « Carmen » une fois sur trois. Le lot actuel a contourné ces ratés en changeant de graine jusqu'à passer l'ASR. Qwen3 clonant `bill` dit les deux mots à chaque prise, Chatterbox 5 fois sur 6.
3. Une voix francophone parle anglais avec un accent. Qwen3 clonant `frm` n'est reconnu comme anglais qu'à 32 %, la voix conçue à 77 % (68 % accélérée). L'intelligibilité reste bonne (92 à 100 %), et un conteur à l'accent français n'est pas forcément un défaut dans un désert imaginaire, mais c'est un choix de direction artistique.

## 6. Une même voix en FR et en EN ?

| système | FR↔EN (cos) | sim. à la référence |
|---|---|---|
| Kyutai 1.6B / erick | 0,99 | —  |
| Qwen3-TTS / clone bill | 0,99 | 0,95 (bill) |
| VoxCPM2 / clone frm | 0,98 | 0,95 (frm) |
| Kyutai 1.6B / frm, débit lent | 0,98 | 0,95 (frm) |
| Qwen3-TTS / clone frm | 0,98 | 0,93 (frm) |
| Qwen3-TTS 1.7B / voix conçue | 0,98 | 0,96 (qwen3_design) |
| Kyutai 1.6B / jeff | 0,98 | —  |
| Kyutai 1.6B / frm | 0,98 | 0,95 (frm) |
| CosyVoice3 / clone frm | 0,97 | 0,93 (frm) |
| VoxCPM2 / voix conçue | 0,97 | 0,96 (vox_design) |
| VoxCPM2 / clone bill | 0,97 | 0,95 (bill) |
| CosyVoice3 / clone bill | 0,93 | 0,92 (bill) |
| Chatterbox v3 / clone frm | 0,93 | 0,91 (frm) |
| Pocket 3.3 / bill_boerst, tempo 0,92 | 0,73 | 0,84 (bill) |
| Pocket, lot actuel (1 prise triée) | 0,73 | 0,85 (bill) |
| Chatterbox v3 / clone bill | 0,71 | 0,85 (bill) |

Les modèles à clonage gardent le même timbre dans les deux langues (cosinus 0,93 à 0,99). Pocket et Chatterbox avec `bill` ne le font pas : 0,73 et 0,71, soit deux locuteurs différents pour WavLM. Le lot actuel n'a donc déjà pas « le même personnage » en FR et en EN au sens de la mesure, même si la référence est la même.

Choisir Qwen3 en français et garder Pocket en anglais ne dégrade donc pas une continuité qui existerait aujourd'hui. Les joueurs n'entendent qu'une langue par partie.

## 7. Prononciation : ce que les nouveaux modèles règlent

| tournure | Pocket brut | Qwen3, voix conçue (accélérée) | Chatterbox, `bill` |
|---|---|---|---|
| « Elle fige tout » | 0/3 (« fiche ») | 3/3 | 3/3 |
| « Carmin » (graphie normale) | 3/3 | 3/3 | 3/3 |
| « C'est l'heure dorée » | 3/3 | 3/3 | 3/3 |
| « Golden hour » | 0/3 | 3/3 | 2/3 |
| « Carmine » (EN) | 2/3 | 3/3 | 3/3 |
| « Saffron dodges. Talons close on air. » | 3/3 | 2/3 (« Talon, Clozonner ») | 3/3 |

La seule faiblesse récurrente de Qwen3 en anglais est « Talons close on air », mal enchaîné par la voix conçue. En français, aucune de ses 60 prises (voix conçue et `frm`) n'échoue. Le lot pourrait revenir aux textes d'origine : « Elle fige tout », « Carmin » sans graphie phonétique.

Toutes les mesures, prise par prise et transcriptions comprises, sont dans `tools/tts-kaggle/results/` (`metrics_clips.json`, `metrics_systems.json`, champ `fails` pour les refus) ; `tools/tts-kaggle/kernels/eval/doc_tables.py` régénère les tableaux de ce document.

## 8. Recommandation

| langue | moteur | voix | réglages |
|---|---|---|---|
| FR | Qwen3-TTS 12 Hz 1.7B Base, float32 sur T4 (`qwen-tts` 0.1.1, `transformers` 4.57.3, attention `sdpa`) | clone de `tools/tts-kaggle/data/voices/qwen3_design.wav` avec sa transcription (`refs_meta.json`, clé `qdesign`) : voix de synthèse conçue par Qwen3 VoiceDesign, graine 22, F0 83 Hz | `language="French"`, échantillonnage par défaut du checkpoint, `max_new_tokens=600` ; puis `atempo 1.2`, pauses internes ≤ 420 ms, 4 prises triées par ASR (Whisper, amorce des couleurs, mots-clés) puis UTMOS, refus au-delà de 3,0 s parlées ; MP3 comme le lot (24 kHz, ABR, −16 LUFS) |
| EN | garder le lot Pocket actuel | `bill_boerst` | inchangés |

Pourquoi Qwen3 en français plutôt que Chatterbox, l'autre modèle qui passe partout :

- la voix conçue correspond au brief (grave, posée, « conteur ») alors que Chatterbox reprend `bill_boerst` à l'identique (120 Hz) ;
- UTMOSv2 3,47 contre 3,26, DNSMOS 3,39 contre 3,35 ;
- 2,3 × le temps réel sur T4 contre 18 × sur CPU pour Chatterbox (non mesuré sur GPU), et pas de watermark imposé ;
- aucune question de droits sur la voix : elle n'appartient à personne.

Chatterbox avec `bill` reste le plan B si l'écoute préfère garder la voix actuelle en FR : 100 % intelligible, 100 % sous 3 s sans accélération, UTMOSv2 3,26 contre 2,89 pour Pocket.

Options à trancher à l'oreille :

- Même voix en anglais : Qwen3, même référence, `language="English"`, `atempo 1.2`. UTMOSv2 3,57 (Pocket : 3,27), 96 % intelligible, 79 % des prises sous 3 s (7 répliques sur 8 gardent une bonne prise), accent français léger (p(anglais) 0,68).
- Voix réelle plutôt que conçue : Qwen3 clonant `frm` (CML-TTS, CC-BY-4.0), `atempo 1.12`. Plus grave encore (79 Hz), 93 % des prises sous 3 s, mais UTMOS22 plus bas (3,83) et une ligne de crédit CC-BY en plus.
- Voix conçue un peu moins lente : la description demandait « slowly, almost in a murmur ». Une nouvelle conception avec « at a measured, unhurried pace » éviterait d'accélérer de 20 % ; elle coûte 3 minutes de GPU, mais change la voix et demande une nouvelle écoute.

### Génération complète (phase 2)

Le plus simple est d'ajouter un moteur `qwen3` à `tools/tts/gen.py` (même interface que `PocketEngine` : `synth(text, cfg, seed)`, le prompt de clonage étant calculé une fois par voix) et de faire tourner `gen.py` lui-même dans un kernel Kaggle, avec Whisper et UTMOS sur GPU. Les réglages du lot (`narrator.sh`) s'appliquent tels quels, avec `tempo: 1.2` dans le preset.

Coût mesuré sur ce banc : 8,7 s de calcul par prise FR sur une T4. Pour 361 clips × 4 prises : 3 h 30 de GPU-carte, soit 1 h 45 sur les 2 T4 d'un kernel, plus environ 25 min de tri. Le quota restant cette semaine (≈ 4 h) suffit pour une passe complète et une reprise des refus ; le quota se renouvelle le samedi 3 octobre à 02:00 (heure de Paris). En float16, la T4 irait probablement deux fois plus vite, à vérifier sur 10 répliques avant le lot.

Les textes « glace » et « Carmain » peuvent alors revenir à « fige » et « Carmin » ; les autres réécritures de `director.md` §5 visaient les défauts de Pocket et restent valides pour le sens.

## 9. Licences et crédits

| élément | licence | crédit à afficher |
|---|---|---|
| Qwen3-TTS 12 Hz 1.7B Base et VoiceDesign (poids et code) | Apache-2.0 | « Voix française synthétisée avec Qwen3-TTS (Alibaba Qwen, Apache 2.0) » |
| Voix conçue `qwen3_design.wav` | sortie du modèle ; aucune voix réelle | aucune obligation ; on peut préciser « voix de synthèse conçue avec Qwen3-TTS VoiceDesign » |
| Pocket TTS (EN, inchangé) | CC-BY-4.0 | « Synthèse vocale : Pocket TTS, Kyutai (CC BY 4.0) » ; voix d'origine « Bill Boerst, LibriVox » (CC0, facultatif) |
| si `frm` est retenue | CC-BY-4.0 | « CML-TTS dataset (CC BY 4.0), locuteur 4193 » |
| si Chatterbox est retenu | MIT ; chaque sortie porte le watermark PerTh | « Chatterbox, Resemble AI (MIT) » |

Les voix `erick` et `jeff` (dons CC0) et `bill_boerst` (CC0) n'imposent rien. Aucun modèle NC n'a été utilisé.

## 10. Limites

- Personne n'a écouté. Les métriques ne mesurent ni le jeu, ni le « mystère », ni l'humour sec. UTMOS22 est même trompeur en français (§4). D'où l'écoute de 2 minutes avant la phase 2.
- 3 prises × 18 répliques par système : suffisant pour classer des systèmes, pas pour estimer un taux de raté rare. Le lot complet passera de toute façon par le tri ASR.
- Les voix conçues sont tirées au sort : une nouvelle conception donne une autre voix. La référence retenue est archivée dans le dépôt et dans le dataset Kaggle.
- Les RTF CPU (Chatterbox, CosyVoice3, Kyutai) ne disent rien de leur vitesse sur GPU.
- Kaggle impose ses limites : 6 h de GPU par semaine, 2 sessions GPU, file d'attente T4 parfois longue, sessions fantômes après une erreur 500 (voir `tools/tts-kaggle/README.md`).

## 11. Reproduire

Tout est dans `tools/tts-kaggle/` (README). En résumé :

```bash
export KAGGLE_API_TOKEN="$(cat ~/.kaggle/access_token)"; K="uvx --from kaggle kaggle"
tools/tts-kaggle/make_dataset.sh /tmp/ombres-ds            # dataset privé ftgplwa/ombres-tts-bench-data
for k in pocket qwen3 voxcpm2 chatterbox kyutai16 cosyvoice3; do $K kernels push -p tools/tts-kaggle/kernels/$k; done
$K kernels push -p tools/tts-kaggle/kernels/eval            # GPU ; OMBRES_TEMPO pour les variantes accélérées
```

Kernels de ce banc (privés, compte `ftgplwa`) : `ombres-tts-pocket`, `-qwen3`, `-voxcpm2`, `-chatterbox`, `-kyutai16`, `-cosyvoice3` (génération), `-eval-g1`, `-eval-g2`, `-eval-g3` (mesures GPU, fusionnées par `evaluate.py --merge`). Les kernels `-eval-a*` et `-eval-c*` sont des évaluations CPU de secours, redondantes ; `-probe` et `-prep` ont servi à tester l'accès GPU.
