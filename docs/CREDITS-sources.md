# Crédits — sources des assets servis

Une section par agent. Format : fichier servi | source (URL) | auteur | licence | attribution requise.

## ui

| Fichier servi | Source | Auteur | Licence | Attribution requise |
|---|---|---|---|---|
| `fonts/julius-sans-one-400-latin.woff2` | https://fonts.gstatic.com/s/juliussansone/v20/1Pt2g8TAX_SGgBGUi0tGOYEga5WOwnsX.woff2 (Google Fonts, via assets-staging/fonts) | Luciano Vergara (LatinoType) | SIL OFL 1.1 (`fonts/OFL-juliussansone.txt`, Reserved Font Name « Julius ») | non (texte OFL embarqué) |
| `fonts/julius-sans-one-400-latin-ext.woff2` | https://fonts.gstatic.com/s/juliussansone/v20/1Pt2g8TAX_SGgBGUi0tGOYEga5WOzHsX2aE.woff2 | Luciano Vergara (LatinoType) | SIL OFL 1.1 | non |
| `fonts/patrick-hand-sc-400-latin.woff2` | https://fonts.gstatic.com/s/patrickhandsc/v17/0nkwC9f7MfsBiWcLtY65AWDK873ljiK7.woff2 (Google Fonts, via assets-staging/fonts) | Patrick Wagesreiter | SIL OFL 1.1 (`fonts/OFL-patrickhandsc.txt`) | non |
| `fonts/patrick-hand-sc-400-latin-ext.woff2` | https://fonts.gstatic.com/s/patrickhandsc/v17/0nkwC9f7MfsBiWcLtY65AWDK873lgCK7FQc.woff2 | Patrick Wagesreiter | SIL OFL 1.1 | non |
| `fonts/averia-sans-libre-700-latin.woff2` | https://fonts.gstatic.com/s/averiasanslibre/v20/ga6SaxZG_G5OvCf_rt7FH3B6BHLMEd31N5cXL5I.woff2 (Google Fonts, téléchargé le 2026-09-26) | Dan Sayers | SIL OFL 1.1 (`fonts/OFL-averiasanslibre.txt`, Reserved Font Names « Averia », « Averia Libre ») | non |
| `ui/glyphs/*.svg`, `ui/glyphs-atlas.png` | dessinés pour le jeu (src/host/ui/glyphShapes.ts) | Claude (Anthropic) | propre au projet | — |

## director

| Fichier servi | Source | Auteur | Licence | Attribution requise |
|---|---|---|---|---|
| `audio/narrator/{fr,en}/*.mp3` (répliques du narrateur, 722 clips) et `audio/narrator/manifest.json` | générés pour le jeu avec tools/tts (tools/tts/narrator.sh) : Kyutai Pocket TTS 3.3.0, modèles `french` et `english`, https://github.com/kyutai-labs/pocket-tts — poids https://huggingface.co/kyutai/pocket-tts-without-voice-cloning | synthèse : Kyutai ; textes : Claude (Anthropic) | poids du modèle **CC-BY 4.0** (code MIT) | **oui** : « Voix du narrateur synthétisée avec Pocket TTS de Kyutai (CC BY 4.0) » |
| (voix de référence utilisée par ces clips) | voix prédéfinie `bill_boerst` de Pocket TTS, https://huggingface.co/kyutai/tts-voices (README : Voice-Zero, lecteur LibriVox) | Bill Boerst (LibriVox) | **CC0** (domaine public) | non (recommandée : « Voix d'origine : Bill Boerst, LibriVox ») |

Outils de contrôle qualité utilisés pendant le développement, **non distribués** : faster-whisper `small` (MIT, poids Whisper MIT) et UTMOS22 via SpeechMOS (MIT). Licences vérifiées dans docs/research/tts.md §2 et §5.3 (Pocket : CC-BY-4.0 lu sur la carte Hugging Face ; voix `bill_boerst` : CC0, tableau des voix de kyutai/tts-voices).


## net-phone

Aucun fichier copié dans `public/` : la manette utilise les polices déposées par l'agent ui (`public/fonts/`, Julius Sans One, Patrick Hand SC, Averia Sans Libre — OFL 1.1, voir la section ui).
`src/phone/device/nosleep.mp4` (1,5 ko, repli « écran toujours allumé ») | généré par nous (ffmpeg, aplat papier 16 × 16 px) | — | domaine public / aucun | non

## world

Aucun fichier copié dans `public/` : sol, territoire, tours, ciel, horizon, cailloux, texture de bruit et papier
sont générés procéduralement au lancement (src/host/render/). Les glyphes daltoniens du monde réutilisent
`public/ui/glyphs-atlas.png` (section ui).

## audio

Fichiers servis par l'agent audio (`tools/audio-build.py`). Modifications communes : découpe, mono, normalisation, fondus, réencodage OGG Vorbis ; « réaccordé » = rééchantillonné pour tomber en la mineur.

**Attributions obligatoires (écran Crédits)** : « Futuristic ambient 1 » par Alexandr Zhelanov — CC-BY 4.0 — https://opengameart.org/content/futuristic-ambient (modifié : normalisé, réencodé) ; « Soundscape – Dust – Ambient Guitar » par Tri-Tachyon — CC-BY 4.0 — https://opengameart.org/content/soundscape-dust-ambient-guitar (modifié : normalisé, réencodé). Tout le reste est CC0 (remerciements facultatifs : Freesound, Kenney.nl, OpenGameArt).

| Fichier servi | Source | Auteur | Licence | Attribution requise |
|---|---|---|---|---|
| `public/audio/sfx/wing_flap_01.ogg` | https://freesound.org/people/Cultureshock007/sounds/711122/ (« Large Wings / Superhero Cape Foley ») | Cultureshock007 | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_02.ogg` | https://freesound.org/people/Cultureshock007/sounds/711122/ (« Large Wings / Superhero Cape Foley ») | Cultureshock007 | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_03.ogg` | https://freesound.org/people/Cultureshock007/sounds/711122/ (« Large Wings / Superhero Cape Foley ») | Cultureshock007 | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_04.ogg` | https://freesound.org/people/Cultureshock007/sounds/711122/ (« Large Wings / Superhero Cape Foley ») | Cultureshock007 | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_05.ogg` | https://freesound.org/people/Cultureshock007/sounds/711122/ (« Large Wings / Superhero Cape Foley ») | Cultureshock007 | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_06.ogg` | https://freesound.org/people/Cultureshock007/sounds/711122/ (« Large Wings / Superhero Cape Foley ») | Cultureshock007 | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_07.ogg` | https://freesound.org/people/Cultureshock007/sounds/711122/ (« Large Wings / Superhero Cape Foley ») | Cultureshock007 | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_foley_01.ogg` | https://freesound.org/people/tothrec2/sounds/596541/ (« Large Wings Flapping - Foley.wav ») | tothrec2 | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_heavy_01.ogg` | https://freesound.org/people/Cerise_Virtuelle/sounds/759529/ (« Large flying creature ») | Cerise_Virtuelle | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_foley_02.ogg` | https://freesound.org/people/tothrec2/sounds/596541/ (« Large Wings Flapping - Foley.wav ») | tothrec2 | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_heavy_02.ogg` | https://freesound.org/people/Cerise_Virtuelle/sounds/759529/ (« Large flying creature ») | Cerise_Virtuelle | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_foley_03.ogg` | https://freesound.org/people/tothrec2/sounds/596541/ (« Large Wings Flapping - Foley.wav ») | tothrec2 | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_heavy_03.ogg` | https://freesound.org/people/Cerise_Virtuelle/sounds/759529/ (« Large flying creature ») | Cerise_Virtuelle | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_foley_04.ogg` | https://freesound.org/people/tothrec2/sounds/596541/ (« Large Wings Flapping - Foley.wav ») | tothrec2 | CC0 1.0 | non |
| `public/audio/sfx/wing_flap_heavy_04.ogg` | https://freesound.org/people/Cerise_Virtuelle/sounds/759529/ (« Large flying creature ») | Cerise_Virtuelle | CC0 1.0 | non |
| `public/audio/sfx/wing_fold_flutter.ogg` | https://freesound.org/people/anebulafont/sounds/651753/ (« Large bird wing flutter.wav ») | anebulafont | CC0 1.0 | non |
| `public/audio/sfx/feather_burst_01.ogg` | https://freesound.org/people/cmorris035/sounds/207275/ (« Feather Pillow Ruffle (16-44.1).wav ») | cmorris035 | CC0 1.0 | non |
| `public/audio/sfx/feather_burst_02.ogg` | https://freesound.org/people/cmorris035/sounds/207275/ (« Feather Pillow Ruffle (16-44.1).wav ») | cmorris035 | CC0 1.0 | non |
| `public/audio/sfx/feather_burst_03.ogg` | https://freesound.org/people/cmorris035/sounds/207275/ (« Feather Pillow Ruffle (16-44.1).wav ») | cmorris035 | CC0 1.0 | non |
| `public/audio/sfx/dive_whoosh_big_01.ogg` | https://freesound.org/people/AudioPapkin/sounds/648614/ (« Cinematic Woosh SFX-009.wav ») | AudioPapkin | CC0 1.0 | non |
| `public/audio/sfx/dive_whoosh_big_02.ogg` | https://freesound.org/people/AudioPapkin/sounds/649445/ (« Cinematic Woosh SFX-015.wav ») | AudioPapkin | CC0 1.0 | non |
| `public/audio/sfx/dive_nighthawk_01.ogg` | https://freesound.org/people/Danjocross/sounds/164201/ (« Nighthawk swoosh 1.aif ») | Danjocross | CC0 1.0 | non |
| `public/audio/sfx/dive_nighthawk_02.ogg` | https://freesound.org/people/Danjocross/sounds/164207/ (« Nighthawk swoosh 2.aif ») | Danjocross | CC0 1.0 | non |
| `public/audio/sfx/whoosh_pass_01.ogg` | https://freesound.org/people/florianreichelt/sounds/683101/ (« quick woosh ») | florianreichelt | CC0 1.0 | non |
| `public/audio/sfx/whoosh_pass_02.ogg` | https://freesound.org/people/qubodup/sounds/60013/ (« Whoosh ») | qubodup | CC0 1.0 | non |
| `public/audio/sfx/whoosh_flap_01.ogg` | https://freesound.org/people/freakinbehemoth/sounds/243400/ (« woosh.wav ») | freakinbehemoth | CC0 1.0 | non |
| `public/audio/sfx/whoosh_flap_02.ogg` | https://freesound.org/people/crackles04/sounds/369698/ (« Whoosh.wav ») | crackles04 | CC0 1.0 | non |
| `public/audio/sfx/whoosh_flap_03.ogg` | https://freesound.org/people/EcoDTR/sounds/27281/ (« Epic whoosh.wav ») | EcoDTR | CC0 1.0 | non |
| `public/audio/sfx/whoosh_down_01.ogg` | https://freesound.org/people/crackles04/sounds/369698/ (« Whoosh.wav ») | crackles04 | CC0 1.0 | non |
| `public/audio/sfx/whoosh_hide_01.ogg` | https://freesound.org/people/EcoDTR/sounds/27281/ (« Epic whoosh.wav ») | EcoDTR | CC0 1.0 | non |
| `public/audio/sfx/impact_punch.ogg` | https://freesound.org/people/janbezouska/sounds/399183/ (« Major punch ») | janbezouska | CC0 1.0 | non |
| `public/audio/sfx/impact_hit_heavy.ogg` | https://freesound.org/people/leonelmail/sounds/504626/ (« BODY FALL - V HVY - DIRT ») | leonelmail | CC0 1.0 | non |
| `public/audio/sfx/impact_thud_light.ogg` | https://freesound.org/people/JonasTisell/sounds/496187/ (« Light Body thud (on clothing) ») | JonasTisell | CC0 1.0 | non |
| `public/audio/sfx/impact_soft_heavy_0.ogg` | https://kenney.nl/assets/impact-sounds (pack Impact Sounds) | Kenney (kenney.nl) | CC0 1.0 | non |
| `public/audio/sfx/impact_soft_heavy_2.ogg` | https://kenney.nl/assets/impact-sounds (pack Impact Sounds) | Kenney (kenney.nl) | CC0 1.0 | non |
| `public/audio/sfx/impact_soft_heavy_4.ogg` | https://kenney.nl/assets/impact-sounds (pack Impact Sounds) | Kenney (kenney.nl) | CC0 1.0 | non |
| `public/audio/sfx/impact_soft_medium_0.ogg` | https://kenney.nl/assets/impact-sounds (pack Impact Sounds) | Kenney (kenney.nl) | CC0 1.0 | non |
| `public/audio/sfx/impact_soft_medium_1.ogg` | https://kenney.nl/assets/impact-sounds (pack Impact Sounds) | Kenney (kenney.nl) | CC0 1.0 | non |
| `public/audio/sfx/impact_soft_medium_3.ogg` | https://kenney.nl/assets/impact-sounds (pack Impact Sounds) | Kenney (kenney.nl) | CC0 1.0 | non |
| `public/audio/sfx/sandfall.ogg` | https://freesound.org/people/Wagna/sounds/326304/ (« sandfall5.wav ») | Wagna | CC0 1.0 | non |
| `public/audio/sfx/sub_drop.ogg` (réaccordé) | https://freesound.org/people/newagesoup/sounds/428073/ (« Sub Drop Smooth.wav ») | newagesoup | CC0 1.0 | non |
| `public/audio/sfx/bird_hawk_scream_01_giant.ogg` | https://freesound.org/people/TRP/sounds/616926/ (« 210227 Red Tailed Hawk, eq isolated calls, roof 77mel 10am.wav ») | TRP | CC0 1.0 | non |
| `public/audio/sfx/bird_kee_ah_01.ogg` | https://freesound.org/people/Vrymaa/sounds/770032/ (« Bird - Red-shouldered hawk ») | Vrymaa | CC0 1.0 | non |
| `public/audio/sfx/bird_hawk_scream_02_giant.ogg` | https://freesound.org/people/TRP/sounds/616926/ (« 210227 Red Tailed Hawk, eq isolated calls, roof 77mel 10am.wav ») | TRP | CC0 1.0 | non |
| `public/audio/sfx/bird_kee_ah_02.ogg` | https://freesound.org/people/Vrymaa/sounds/770032/ (« Bird - Red-shouldered hawk ») | Vrymaa | CC0 1.0 | non |
| `public/audio/sfx/bird_hawk_scream_03_giant.ogg` | https://freesound.org/people/TRP/sounds/616926/ (« 210227 Red Tailed Hawk, eq isolated calls, roof 77mel 10am.wav ») | TRP | CC0 1.0 | non |
| `public/audio/sfx/bird_kee_ah_03.ogg` | https://freesound.org/people/Vrymaa/sounds/770032/ (« Bird - Red-shouldered hawk ») | Vrymaa | CC0 1.0 | non |
| `public/audio/sfx/bird_squawk_01.ogg` | https://freesound.org/people/craigsmith/sounds/675962/ (« S28-16 Eagle squawks & calls.wav ») | craigsmith | CC0 1.0 | non |
| `public/audio/sfx/bird_squawk_02.ogg` | https://freesound.org/people/craigsmith/sounds/675962/ (« S28-16 Eagle squawks & calls.wav ») | craigsmith | CC0 1.0 | non |
| `public/audio/sfx/bird_squawk_03.ogg` | https://freesound.org/people/craigsmith/sounds/675962/ (« S28-16 Eagle squawks & calls.wav ») | craigsmith | CC0 1.0 | non |
| `public/audio/sfx/bird_squawk_04.ogg` | https://freesound.org/people/craigsmith/sounds/675962/ (« S28-16 Eagle squawks & calls.wav ») | craigsmith | CC0 1.0 | non |
| `public/audio/sfx/bird_ptero_squawk.ogg` | https://freesound.org/people/dinodilopho/sounds/263530/ (« pterodactyl.wav ») | dinodilopho | CC0 1.0 | non |
| `public/audio/sfx/bird_vulture_hiss.ogg` | https://freesound.org/people/AntumDeluge/sounds/188041/ (« Vulture ») | AntumDeluge | CC0 1.0 | non |
| `public/audio/sfx/bird_eagle_cry_01.ogg` | https://freesound.org/people/GreenW03/sounds/635419/ (« Eagle Sound Effect.mp3 ») | GreenW03 | CC0 1.0 | non |
| `public/audio/sfx/bird_eagle_cry_02.ogg` | https://freesound.org/people/GreenW03/sounds/635419/ (« Eagle Sound Effect.mp3 ») | GreenW03 | CC0 1.0 | non |
| `public/audio/sfx/bird_eagle_cry_03.ogg` | https://freesound.org/people/GreenW03/sounds/635419/ (« Eagle Sound Effect.mp3 ») | GreenW03 | CC0 1.0 | non |
| `public/audio/sfx/bird_hawk_scream_01.ogg` | https://freesound.org/people/TRP/sounds/616926/ (« 210227 Red Tailed Hawk, eq isolated calls, roof 77mel 10am.wav ») | TRP | CC0 1.0 | non |
| `public/audio/sfx/tick_rods.ogg` | https://freesound.org/people/adharca/sounds/275679/ (« wooden rods single strike.ogg ») | adharca | CC0 1.0 | non |
| `public/audio/sfx/tick_woodblock.ogg` | https://freesound.org/people/calaudio/sounds/53403/ (« wood block.wav ») | calaudio | CC0 1.0 | non |
| `public/audio/sfx/tick_wood_soft.ogg` | https://freesound.org/people/hollandm/sounds/692828/ (« Woodblock-soft.wav ») | hollandm | CC0 1.0 | non |
| `public/audio/sfx/horn_conch.ogg` (réaccordé) | https://freesound.org/people/RoofDog/sounds/78974/ (« Conch.wav ») | RoofDog | CC0 1.0 | non |
| `public/audio/sfx/bell_tibetan.ogg` (réaccordé) | https://freesound.org/people/steaq/sounds/346328/ (« Bright Tibetan Bell Ding B Note - cleaner ») | steaq | CC0 1.0 | non |
| `public/audio/sfx/chime_transition.ogg` (réaccordé) | https://freesound.org/people/djlprojects/sounds/419594/ (« Mystical Wind Chimes Transition FX ») | djlprojects | CC0 1.0 | non |
| `public/audio/sfx/boom_cinematic.ogg` | https://freesound.org/people/rhapsodize/sounds/255111/ (« Cinematic_Boom_Rhapsodize.wav ») | rhapsodize | CC0 1.0 | non |
| `public/audio/sfx/deep_tremor.ogg` | https://freesound.org/people/swiftoid/sounds/119782/ (« cinematic_deep_tremor.wav ») | swiftoid | CC0 1.0 | non |
| `public/audio/sfx/gong_big.ogg` | https://freesound.org/people/JensZygar/sounds/486629/ (« Gong Brilliant Paiste 32" ») | JensZygar | CC0 1.0 | non |
| `public/audio/sfx/bowl_hit.ogg` (réaccordé) | https://freesound.org/people/dersinnsspace/sounds/421829/ (« Tibetan bowl_center hit.wav ») | dersinnsspace | CC0 1.0 | non |
| `public/audio/sfx/bowl_strike_soft.ogg` (réaccordé) | https://freesound.org/people/inoshirodesign/sounds/271370/ (« singing bowl strike sound ») | inoshirodesign | CC0 1.0 | non |
| `public/audio/sfx/heartbeat.ogg` | https://freesound.org/people/michorvath/sounds/273150/ (« Heart Beating ») | michorvath | CC0 1.0 | non |
| `public/audio/sfx/bell_harmony.ogg` (réaccordé) | https://freesound.org/people/newagesoup/sounds/400605/ (« Harmony Bell ») | newagesoup | CC0 1.0 | non |
| `public/audio/sfx/harp_gliss_up_01.ogg` (réaccordé) | https://freesound.org/people/olver/sounds/505063/ (« HARP GLISSANDO UP.wav ») | olver | CC0 1.0 | non |
| `public/audio/sfx/harp_gliss_up_02.ogg` (réaccordé) | https://freesound.org/people/olver/sounds/505063/ (« HARP GLISSANDO UP.wav ») | olver | CC0 1.0 | non |
| `public/audio/sfx/harp_gliss_down.ogg` (réaccordé) | https://freesound.org/people/Cunningar0807/sounds/436129/ (« Harp Glissando Down.aiff ») | Cunningar0807 | CC0 1.0 | non |
| `public/audio/sfx/bells_harmony_chord.ogg` (réaccordé) | https://freesound.org/people/newagesoup/sounds/400809/ (« Stereo Harmony Bells ») | newagesoup | CC0 1.0 | non |
| `public/audio/sfx/gong_short.ogg` (réaccordé) | https://freesound.org/people/BOSS%20MUSIC/sounds/121800/ (« gong.WAV ») | BOSS MUSIC | CC0 1.0 | non |
| `public/audio/sfx/riser_hit.ogg` | https://freesound.org/people/AudioPapkin/sounds/715353/ (« Riser Hit sfx 062 ») | AudioPapkin | CC0 1.0 | non |
| `public/audio/sfx/hourglass_turn.ogg` | https://freesound.org/people/el_boss/sounds/625655/ (« Turning a Small Hour Glass.wav ») | el_boss | CC0 1.0 | non |
| `public/audio/sfx/wind_gust_01.ogg` | https://freesound.org/people/crashoverride6/sounds/146932/ (« Wind Gust ») | crashoverride6 | CC0 1.0 | non |
| `public/audio/sfx/wind_gust_02.ogg` | https://freesound.org/people/joseph.larralde/sounds/352421/ (« wind_gust.aif ») | joseph.larralde | CC0 1.0 | non |
| `public/audio/sfx/ui_pluck.ogg` | https://kenney.nl/assets/interface-sounds (pack Interface Sounds) | Kenney (kenney.nl) | CC0 1.0 | non |
| `public/audio/sfx/ui_glass.ogg` | https://kenney.nl/assets/interface-sounds (pack Interface Sounds) | Kenney (kenney.nl) | CC0 1.0 | non |
| `public/audio/sfx/ui_click_soft.ogg` | https://kenney.nl/assets/interface-sounds (pack Interface Sounds) | Kenney (kenney.nl) | CC0 1.0 | non |
| `public/audio/sfx/ui_page_flip_1.ogg` | https://kenney.nl/assets/rpg-audio (pack RPG Audio) | Kenney (kenney.nl) | CC0 1.0 | non |
| `public/audio/sfx/ui_page_flip_2.ogg` | https://kenney.nl/assets/rpg-audio (pack RPG Audio) | Kenney (kenney.nl) | CC0 1.0 | non |
| `public/audio/sfx/ui_cloth.ogg` | https://kenney.nl/assets/rpg-audio (pack RPG Audio) | Kenney (kenney.nl) | CC0 1.0 | non |
| `public/audio/sfx/amb_wind_base_loop.ogg` (bouclé) | https://freesound.org/people/dhallcomposer/sounds/697217/ (« Looping Gentle Wind Ambience on an Open Desert Plain.wav ») | dhallcomposer | CC0 1.0 | non |
| `public/audio/sfx/amb_wind_high_loop.ogg` | https://freesound.org/people/lextrack/sounds/344887/ (« Strong wind ») | lextrack | CC0 1.0 | non |
| `public/audio/sfx/amb_wind_eerie_loop.ogg` (bouclé) | https://freesound.org/people/felix.blume/sounds/156414/ (« Wind blowing into some cactus spine, on the top of the mountain, in the desert of Atacama (Chile). ») | felix.blume | CC0 1.0 | non |
| `public/audio/sfx/amb_wind_howl_loop.ogg` (bouclé) | https://freesound.org/people/swiftoid/sounds/117611/ (« wind_howl2_stereo.wav ») | swiftoid | CC0 1.0 | non |
| `public/audio/sfx/amb_wind_dark_loop.ogg` (bouclé) | https://freesound.org/people/DarkShroom/sounds/645305/ (« desert_wind.wav ») | DarkShroom | CC0 1.0 | non |
| `public/audio/sfx/amb_night_crickets_loop.ogg` (bouclé) | https://freesound.org/people/felix.blume/sounds/165526/ (« Wind singing in the mountain, some night cricket in background ») | felix.blume | CC0 1.0 | non |
| `public/audio/sfx/sand_paint_loop.ogg` (bouclé) | https://freesound.org/people/benjammin2006/sounds/235966/ (« Rainstick (Stereo) ») | benjammin2006 | CC0 1.0 | non |
| `public/audio/music/samples/tongue_A3.ogg` | https://freesound.org/people/tosha73/sounds/497849/ (« Steel tongue drum 9 samples.wav ») | tosha73 | CC0 1.0 | non |
| `public/audio/music/samples/tongue_C4.ogg` | https://freesound.org/people/tosha73/sounds/497849/ (« Steel tongue drum 9 samples.wav ») | tosha73 | CC0 1.0 | non |
| `public/audio/music/samples/tongue_D4.ogg` | https://freesound.org/people/tosha73/sounds/497849/ (« Steel tongue drum 9 samples.wav ») | tosha73 | CC0 1.0 | non |
| `public/audio/music/samples/tongue_E4.ogg` | https://freesound.org/people/tosha73/sounds/497849/ (« Steel tongue drum 9 samples.wav ») | tosha73 | CC0 1.0 | non |
| `public/audio/music/samples/tongue_G4.ogg` | https://freesound.org/people/tosha73/sounds/497849/ (« Steel tongue drum 9 samples.wav ») | tosha73 | CC0 1.0 | non |
| `public/audio/music/samples/tongue_A4.ogg` | https://freesound.org/people/tosha73/sounds/497849/ (« Steel tongue drum 9 samples.wav ») | tosha73 | CC0 1.0 | non |
| `public/audio/music/samples/tongue_C5.ogg` | https://freesound.org/people/tosha73/sounds/497849/ (« Steel tongue drum 9 samples.wav ») | tosha73 | CC0 1.0 | non |
| `public/audio/music/samples/tongue_D5.ogg` | https://freesound.org/people/tosha73/sounds/497849/ (« Steel tongue drum 9 samples.wav ») | tosha73 | CC0 1.0 | non |
| `public/audio/music/samples/tongue_E5.ogg` | https://freesound.org/people/tosha73/sounds/497849/ (« Steel tongue drum 9 samples.wav ») | tosha73 | CC0 1.0 | non |
| `public/audio/music/samples/oud_A2.ogg` | https://freesound.org/people/hammondman/sounds/172683/ (« a2.wav ») | hammondman | CC0 1.0 | non |
| `public/audio/music/samples/oud_C3.ogg` | https://freesound.org/people/hammondman/sounds/172684/ (« c3.wav ») | hammondman | CC0 1.0 | non |
| `public/audio/music/samples/oud_G2.ogg` | https://freesound.org/people/hammondman/sounds/172682/ (« g2.wav ») | hammondman | CC0 1.0 | non |
| `public/audio/music/samples/duduk_C4.ogg` | https://freesound.org/people/blood_of_a_pomegranate/sounds/479213/ (« duduk C3 ») | blood_of_a_pomegranate | CC0 1.0 | non |
| `public/audio/music/samples/tanpura_A2.ogg` (réaccordé, bouclé) | https://freesound.org/people/iluppai/sounds/148850/ (« Tanpura in E ») | iluppai | CC0 1.0 | non |
| `public/audio/music/title_zhelanov_ambient_1.ogg` | https://opengameart.org/content/futuristic-ambient (« Futuristic ambient 1 ») | Alexandr Zhelanov | CC-BY 4.0 | OUI |
| `public/audio/music/lobby_isaiah658_relaxing_loop.ogg` | https://opengameart.org/content/ambient-relaxing-loop (« Ambient Relaxing Loop ») | isaiah658 | CC0 | non |
| `public/audio/music/results_cynicmusic_synthwave4k.ogg` | https://opengameart.org/content/calm-ambient-1-synthwave-4k (« Calm Ambient 1 (Synthwave 4k) ») | cynicmusic (The Cynic Project) | CC0 | non |
| `public/audio/music/podium_cynicmusic_lifewave2k.ogg` | https://opengameart.org/content/calm-ambient-3-lifewave-2k (« Calm Ambient 3 (Lifewave 2k) ») | cynicmusic (The Cynic Project) | CC0 | non |
| `public/audio/music/credits_tritachyon_dust.ogg` | https://opengameart.org/content/soundscape-dust-ambient-guitar (« Soundscape – Dust – Ambient Guitar ») | Tri-Tachyon | CC-BY 4.0 | OUI |

Générés par le code (aucun fichier) : vent procédural, grain de sable, « tsk », « clac », synthèse et réverbération de la partition générative (WebAudio natif, code du projet).
