// GÉNÉRÉ par tools/audio-build.py — ne pas modifier à la main.
// Catalogue des fichiers audio servis : mesures faites sur les fichiers encodés.
// mmax = sonie momentanée maximale (LUFS, fenêtre 400 ms), lufs = sonie intégrée,
// onset / peakTime = début de l'attaque et instant de la crête (s).

export type AssetKind = 'sfx' | 'ui' | 'amb' | 'music' | 'sample'
export type AssetGroup = 'critical' | 'lazy' | 'stream'

export interface AudioAsset {
  url: string
  bytes: number
  kind: AssetKind
  group: AssetGroup
  loop: boolean
  /** Note jouée par un échantillon d'instrument (notation scientifique). */
  note: string | null
  duration: number
  channels: number
  peakDb: number
  lufs: number
  mmax: number
  onset: number
  peakTime: number
}

export const AUDIO_ASSETS = {
  amb_night_crickets_loop: {url: "audio/sfx/amb_night_crickets_loop.ogg", bytes: 158547, kind: "amb", group: "lazy", loop: true, note: null, duration: 24.0, channels: 1, peakDb: -5.84, lufs: -20.1, mmax: -17.6, onset: 0.004, peakTime: 5.265},
  amb_wind_base_loop: {url: "audio/sfx/amb_wind_base_loop.ogg", bytes: 200248, kind: "amb", group: "critical", loop: true, note: null, duration: 26.0, channels: 2, peakDb: -1.62, lufs: -20.1, mmax: -15.2, onset: 0.004, peakTime: 7.221},
  amb_wind_dark_loop: {url: "audio/sfx/amb_wind_dark_loop.ogg", bytes: 141036, kind: "amb", group: "lazy", loop: true, note: null, duration: 22.0, channels: 1, peakDb: -2.45, lufs: -20.0, mmax: -17.6, onset: 0.004, peakTime: 20.143},
  amb_wind_eerie_loop: {url: "audio/sfx/amb_wind_eerie_loop.ogg", bytes: 191926, kind: "amb", group: "lazy", loop: true, note: null, duration: 24.0, channels: 2, peakDb: -4.85, lufs: -20.1, mmax: -15.2, onset: 0.004, peakTime: 17.301},
  amb_wind_high_loop: {url: "audio/sfx/amb_wind_high_loop.ogg", bytes: 94609, kind: "amb", group: "lazy", loop: true, note: null, duration: 16.0, channels: 1, peakDb: -5.35, lufs: -20.1, mmax: -17.5, onset: 0.004, peakTime: 2.394},
  amb_wind_howl_loop: {url: "audio/sfx/amb_wind_howl_loop.ogg", bytes: 178037, kind: "amb", group: "lazy", loop: true, note: null, duration: 24.0, channels: 2, peakDb: -3.32, lufs: -20.1, mmax: -12.7, onset: 0.004, peakTime: 3.232},
  bell_harmony: {url: "audio/sfx/bell_harmony.ogg", bytes: 37946, kind: "sfx", group: "lazy", loop: false, note: null, duration: 7.0, channels: 1, peakDb: -1.71, lufs: -16.9, mmax: -11.3, onset: 0.152, peakTime: 0.155},
  bell_tibetan: {url: "audio/sfx/bell_tibetan.ogg", bytes: 53403, kind: "sfx", group: "critical", loop: false, note: null, duration: 7.0, channels: 1, peakDb: -1.33, lufs: -27.1, mmax: -22.6, onset: 0.024, peakTime: 0.027},
  bells_harmony_chord: {url: "audio/sfx/bells_harmony_chord.ogg", bytes: 55567, kind: "sfx", group: "lazy", loop: false, note: null, duration: 6.9236, channels: 1, peakDb: -1.5, lufs: -19.7, mmax: -14.8, onset: 0.286, peakTime: 1.353},
  bird_eagle_cry_01: {url: "audio/sfx/bird_eagle_cry_01.ogg", bytes: 19177, kind: "sfx", group: "lazy", loop: false, note: null, duration: 2.3, channels: 1, peakDb: -0.64, lufs: -8.9, mmax: -6.1, onset: 0.07, peakTime: 0.61},
  bird_eagle_cry_02: {url: "audio/sfx/bird_eagle_cry_02.ogg", bytes: 19919, kind: "sfx", group: "lazy", loop: false, note: null, duration: 2.4, channels: 1, peakDb: -0.63, lufs: -9.5, mmax: -6.7, onset: 0.072, peakTime: 0.736},
  bird_eagle_cry_03: {url: "audio/sfx/bird_eagle_cry_03.ogg", bytes: 18569, kind: "sfx", group: "lazy", loop: false, note: null, duration: 2.2, channels: 1, peakDb: -0.55, lufs: -8.5, mmax: -5.7, onset: 0.07, peakTime: 0.737},
  bird_hawk_scream_01: {url: "audio/sfx/bird_hawk_scream_01.ogg", bytes: 13126, kind: "sfx", group: "lazy", loop: false, note: null, duration: 1.0954, channels: 1, peakDb: -1.14, lufs: -14.3, mmax: -12.0, onset: 0.015, peakTime: 0.168},
  bird_hawk_scream_01_giant: {url: "audio/sfx/bird_hawk_scream_01_giant.ogg", bytes: 11735, kind: "sfx", group: "critical", loop: false, note: null, duration: 1.0902, channels: 1, peakDb: -0.83, lufs: -14.7, mmax: -12.8, onset: 0.004, peakTime: 0.176},
  bird_hawk_scream_02_giant: {url: "audio/sfx/bird_hawk_scream_02_giant.ogg", bytes: 10394, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.924, channels: 1, peakDb: -1.16, lufs: -15.6, mmax: -11.8, onset: 0.005, peakTime: 0.038},
  bird_hawk_scream_03_giant: {url: "audio/sfx/bird_hawk_scream_03_giant.ogg", bytes: 14160, kind: "sfx", group: "critical", loop: false, note: null, duration: 1.4317, channels: 1, peakDb: -1.05, lufs: -17.7, mmax: -14.1, onset: 0.004, peakTime: 0.242},
  bird_kee_ah_01: {url: "audio/sfx/bird_kee_ah_01.ogg", bytes: 6923, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.4861, channels: 1, peakDb: -0.92, lufs: -8.6, mmax: -8.6, onset: 0.004, peakTime: 0.08},
  bird_kee_ah_02: {url: "audio/sfx/bird_kee_ah_02.ogg", bytes: 7019, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.4981, channels: 1, peakDb: -0.98, lufs: -7.8, mmax: -7.8, onset: 0.004, peakTime: 0.055},
  bird_kee_ah_03: {url: "audio/sfx/bird_kee_ah_03.ogg", bytes: 8529, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.6824, channels: 1, peakDb: -1.01, lufs: -12.3, mmax: -9.6, onset: 0.004, peakTime: 0.079},
  bird_ptero_squawk: {url: "audio/sfx/bird_ptero_squawk.ogg", bytes: 8178, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.6737, channels: 1, peakDb: -1.02, lufs: -14.7, mmax: -14.0, onset: 0.004, peakTime: 0.412},
  bird_squawk_01: {url: "audio/sfx/bird_squawk_01.ogg", bytes: 7604, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.5405, channels: 1, peakDb: -1.14, lufs: -17.6, mmax: -15.4, onset: 0.004, peakTime: 0.075},
  bird_squawk_02: {url: "audio/sfx/bird_squawk_02.ogg", bytes: 10761, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.9755, channels: 1, peakDb: -0.92, lufs: -17.2, mmax: -13.4, onset: 0.004, peakTime: 0.019},
  bird_squawk_03: {url: "audio/sfx/bird_squawk_03.ogg", bytes: 11590, kind: "sfx", group: "critical", loop: false, note: null, duration: 1.0202, channels: 1, peakDb: -1.21, lufs: -9.7, mmax: -9.1, onset: 0.004, peakTime: 0.011},
  bird_squawk_04: {url: "audio/sfx/bird_squawk_04.ogg", bytes: 11995, kind: "sfx", group: "critical", loop: false, note: null, duration: 1.0579, channels: 1, peakDb: -0.96, lufs: -8.9, mmax: -8.1, onset: 0.005, peakTime: 0.693},
  bird_vulture_hiss: {url: "audio/sfx/bird_vulture_hiss.ogg", bytes: 14012, kind: "sfx", group: "critical", loop: false, note: null, duration: 1.1517, channels: 1, peakDb: -0.88, lufs: -12.5, mmax: -10.6, onset: 0.004, peakTime: 0.124},
  boom_cinematic: {url: "audio/sfx/boom_cinematic.ogg", bytes: 33493, kind: "sfx", group: "critical", loop: false, note: null, duration: 5.5, channels: 1, peakDb: -1.11, lufs: -18.2, mmax: -12.9, onset: 0.026, peakTime: 0.197},
  bowl_hit: {url: "audio/sfx/bowl_hit.ogg", bytes: 46418, kind: "sfx", group: "critical", loop: false, note: null, duration: 7.0, channels: 1, peakDb: -1.52, lufs: -18.8, mmax: -15.3, onset: 0.032, peakTime: 0.036},
  bowl_strike_soft: {url: "audio/sfx/bowl_strike_soft.ogg", bytes: 44475, kind: "sfx", group: "critical", loop: false, note: null, duration: 4.9968, channels: 1, peakDb: -0.71, lufs: -15.6, mmax: -9.6, onset: 0.049, peakTime: 0.061},
  chime_transition: {url: "audio/sfx/chime_transition.ogg", bytes: 47719, kind: "sfx", group: "critical", loop: false, note: null, duration: 6.0476, channels: 1, peakDb: -1.07, lufs: -16.5, mmax: -12.4, onset: 0.149, peakTime: 0.688},
  credits_tritachyon_dust: {url: "audio/music/credits_tritachyon_dust.ogg", bytes: 1632774, kind: "music", group: "stream", loop: false, note: null, duration: 210.5469, channels: 2, peakDb: -5.18, lufs: -18.1, mmax: -12.2, onset: 0.462, peakTime: 80.08},
  deep_tremor: {url: "audio/sfx/deep_tremor.ogg", bytes: 19133, kind: "sfx", group: "critical", loop: false, note: null, duration: 6.5, channels: 1, peakDb: -0.97, lufs: -17.3, mmax: -13.8, onset: 0.043, peakTime: 2.952},
  dive_nighthawk_01: {url: "audio/sfx/dive_nighthawk_01.ogg", bytes: 15420, kind: "sfx", group: "critical", loop: false, note: null, duration: 1.44, channels: 1, peakDb: -1.25, lufs: -14.5, mmax: -12.8, onset: 0.023, peakTime: 0.777},
  dive_nighthawk_02: {url: "audio/sfx/dive_nighthawk_02.ogg", bytes: 19481, kind: "sfx", group: "critical", loop: false, note: null, duration: 2.016, channels: 1, peakDb: -0.67, lufs: -17.2, mmax: -12.4, onset: 0.024, peakTime: 0.873},
  dive_whoosh_big_01: {url: "audio/sfx/dive_whoosh_big_01.ogg", bytes: 32965, kind: "sfx", group: "critical", loop: false, note: null, duration: 4.488, channels: 1, peakDb: -1.32, lufs: -20.3, mmax: -15.2, onset: 0.874, peakTime: 1.869},
  dive_whoosh_big_02: {url: "audio/sfx/dive_whoosh_big_02.ogg", bytes: 41585, kind: "sfx", group: "critical", loop: false, note: null, duration: 5.304, channels: 1, peakDb: -0.8, lufs: -22.9, mmax: -16.9, onset: 0.959, peakTime: 2.523},
  duduk_C4: {url: "audio/music/samples/duduk_C4.ogg", bytes: 35967, kind: "sample", group: "lazy", loop: false, note: "C4", duration: 5.1145, channels: 1, peakDb: -0.81, lufs: -10.8, mmax: -9.3, onset: 0.004, peakTime: 1.382},
  feather_burst_01: {url: "audio/sfx/feather_burst_01.ogg", bytes: 9265, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.6594, channels: 1, peakDb: -1.16, lufs: -22.0, mmax: -22.0, onset: 0.004, peakTime: 0.135},
  feather_burst_02: {url: "audio/sfx/feather_burst_02.ogg", bytes: 9971, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.7475, channels: 1, peakDb: -1.77, lufs: -26.8, mmax: -25.6, onset: 0.004, peakTime: 0.396},
  feather_burst_03: {url: "audio/sfx/feather_burst_03.ogg", bytes: 8763, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.6225, channels: 1, peakDb: -0.83, lufs: -25.9, mmax: -24.4, onset: 0.004, peakTime: 0.27},
  gong_big: {url: "audio/sfx/gong_big.ogg", bytes: 75358, kind: "sfx", group: "critical", loop: false, note: null, duration: 13.0, channels: 1, peakDb: -0.93, lufs: -17.3, mmax: -10.7, onset: 0.248, peakTime: 0.544},
  gong_short: {url: "audio/sfx/gong_short.ogg", bytes: 44284, kind: "sfx", group: "lazy", loop: false, note: null, duration: 5.2078, channels: 1, peakDb: -1.12, lufs: -14.3, mmax: -11.2, onset: 0.152, peakTime: 0.885},
  harp_gliss_down: {url: "audio/sfx/harp_gliss_down.ogg", bytes: 50274, kind: "sfx", group: "lazy", loop: false, note: null, duration: 5.9653, channels: 1, peakDb: -1.14, lufs: -16.6, mmax: -11.1, onset: 0.022, peakTime: 1.069},
  harp_gliss_up_01: {url: "audio/sfx/harp_gliss_up_01.ogg", bytes: 57124, kind: "sfx", group: "lazy", loop: false, note: null, duration: 7.5, channels: 1, peakDb: -0.96, lufs: -17.4, mmax: -11.2, onset: 0.096, peakTime: 5.014},
  harp_gliss_up_02: {url: "audio/sfx/harp_gliss_up_02.ogg", bytes: 36517, kind: "sfx", group: "lazy", loop: false, note: null, duration: 3.4086, channels: 1, peakDb: -0.95, lufs: -13.8, mmax: -10.5, onset: 0.032, peakTime: 1.112},
  heartbeat: {url: "audio/sfx/heartbeat.ogg", bytes: 7363, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.6171, channels: 1, peakDb: -0.85, lufs: -19.5, mmax: -17.8, onset: 0.08, peakTime: 0.128},
  horn_conch: {url: "audio/sfx/horn_conch.ogg", bytes: 61185, kind: "sfx", group: "critical", loop: false, note: null, duration: 6.9476, channels: 1, peakDb: -1.03, lufs: -10.8, mmax: -8.3, onset: 0.072, peakTime: 4.004},
  hourglass_turn: {url: "audio/sfx/hourglass_turn.ogg", bytes: 43753, kind: "sfx", group: "lazy", loop: false, note: null, duration: 5.0, channels: 1, peakDb: -1.32, lufs: -19.9, mmax: -14.3, onset: 0.092, peakTime: 3.422},
  impact_hit_heavy: {url: "audio/sfx/impact_hit_heavy.ogg", bytes: 17639, kind: "sfx", group: "critical", loop: false, note: null, duration: 1.6718, channels: 1, peakDb: -0.91, lufs: -23.9, mmax: -20.1, onset: 0.14, peakTime: 0.474},
  impact_punch: {url: "audio/sfx/impact_punch.ogg", bytes: 9832, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.8011, channels: 1, peakDb: -1.4, lufs: -25.0, mmax: -22.2, onset: 0.004, peakTime: 0.046},
  impact_soft_heavy_0: {url: "audio/sfx/impact_soft_heavy_0.ogg", bytes: 4550, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.5239, channels: 1, peakDb: -0.98, lufs: -19.1, mmax: -19.1, onset: 0.004, peakTime: 0.006},
  impact_soft_heavy_2: {url: "audio/sfx/impact_soft_heavy_2.ogg", bytes: 4587, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.5665, channels: 1, peakDb: -1.0, lufs: -21.4, mmax: -18.7, onset: 0.004, peakTime: 0.006},
  impact_soft_heavy_4: {url: "audio/sfx/impact_soft_heavy_4.ogg", bytes: 4405, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.4951, channels: 1, peakDb: -1.01, lufs: -19.0, mmax: -19.0, onset: 0.004, peakTime: 0.006},
  impact_soft_medium_0: {url: "audio/sfx/impact_soft_medium_0.ogg", bytes: 3824, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.1122, channels: 1, peakDb: -0.95, lufs: -22.7, mmax: -22.7, onset: 0.004, peakTime: 0.005},
  impact_soft_medium_1: {url: "audio/sfx/impact_soft_medium_1.ogg", bytes: 3897, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.1775, channels: 1, peakDb: -0.91, lufs: -21.9, mmax: -21.9, onset: 0.004, peakTime: 0.005},
  impact_soft_medium_3: {url: "audio/sfx/impact_soft_medium_3.ogg", bytes: 3827, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.1582, channels: 1, peakDb: -1.06, lufs: -22.5, mmax: -22.5, onset: 0.004, peakTime: 0.005},
  impact_thud_light: {url: "audio/sfx/impact_thud_light.ogg", bytes: 6031, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.295, channels: 1, peakDb: -1.12, lufs: -25.4, mmax: -25.4, onset: 0.004, peakTime: 0.034},
  lobby_isaiah658_relaxing_loop: {url: "audio/music/lobby_isaiah658_relaxing_loop.ogg", bytes: 196809, kind: "music", group: "lazy", loop: true, note: null, duration: 24.5109, channels: 2, peakDb: -5.76, lufs: -18.1, mmax: -14.0, onset: 0.004, peakTime: 14.556},
  oud_A2: {url: "audio/music/samples/oud_A2.ogg", bytes: 24883, kind: "sample", group: "lazy", loop: false, note: "A2", duration: 2.8564, channels: 1, peakDb: -1.18, lufs: -21.8, mmax: -14.8, onset: 0.004, peakTime: 0.032},
  oud_C3: {url: "audio/music/samples/oud_C3.ogg", bytes: 15366, kind: "sample", group: "lazy", loop: false, note: "C3", duration: 1.6174, channels: 1, peakDb: -0.97, lufs: -18.7, mmax: -13.2, onset: 0.021, peakTime: 0.08},
  oud_G2: {url: "audio/music/samples/oud_G2.ogg", bytes: 14124, kind: "sample", group: "lazy", loop: false, note: "G2", duration: 1.5289, channels: 1, peakDb: -0.79, lufs: -17.1, mmax: -12.4, onset: 0.033, peakTime: 0.075},
  podium_cynicmusic_lifewave2k: {url: "audio/music/podium_cynicmusic_lifewave2k.ogg", bytes: 961901, kind: "music", group: "stream", loop: false, note: null, duration: 187.3502, channels: 2, peakDb: -2.56, lufs: -18.1, mmax: -11.7, onset: 0.869, peakTime: 81.771},
  results_cynicmusic_synthwave4k: {url: "audio/music/results_cynicmusic_synthwave4k.ogg", bytes: 960359, kind: "music", group: "stream", loop: false, note: null, duration: 157.9102, channels: 2, peakDb: -1.26, lufs: -18.1, mmax: -9.8, onset: 1.105, peakTime: 44.532},
  riser_hit: {url: "audio/sfx/riser_hit.ogg", bytes: 51724, kind: "sfx", group: "lazy", loop: false, note: null, duration: 6.5, channels: 1, peakDb: -1.3, lufs: -23.7, mmax: -15.9, onset: 0.034, peakTime: 4.031},
  sand_paint_loop: {url: "audio/sfx/sand_paint_loop.ogg", bytes: 96254, kind: "amb", group: "critical", loop: true, note: null, duration: 14.0, channels: 1, peakDb: -2.06, lufs: -19.1, mmax: -14.4, onset: 0.004, peakTime: 11.056},
  sandfall: {url: "audio/sfx/sandfall.ogg", bytes: 26042, kind: "sfx", group: "critical", loop: false, note: null, duration: 2.6, channels: 1, peakDb: -1.66, lufs: -14.2, mmax: -10.7, onset: 0.168, peakTime: 1.357},
  sub_drop: {url: "audio/sfx/sub_drop.ogg", bytes: 14767, kind: "sfx", group: "critical", loop: false, note: null, duration: 3.6272, channels: 1, peakDb: -0.79, lufs: -10.0, mmax: -6.9, onset: 0.079, peakTime: 0.57},
  tanpura_A2: {url: "audio/music/samples/tanpura_A2.ogg", bytes: 153714, kind: "sample", group: "lazy", loop: true, note: "A2", duration: 13.5, channels: 2, peakDb: -8.17, lufs: -20.1, mmax: -14.2, onset: 0.004, peakTime: 4.774},
  tick_rods: {url: "audio/sfx/tick_rods.ogg", bytes: 5634, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.3223, channels: 1, peakDb: -1.24, lufs: -20.7, mmax: -20.7, onset: 0.004, peakTime: 0.018},
  tick_wood_soft: {url: "audio/sfx/tick_wood_soft.ogg", bytes: 7696, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.5256, channels: 1, peakDb: -1.78, lufs: -26.2, mmax: -26.2, onset: 0.004, peakTime: 0.005},
  tick_woodblock: {url: "audio/sfx/tick_woodblock.ogg", bytes: 6862, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.4862, channels: 1, peakDb: -1.29, lufs: -19.5, mmax: -19.5, onset: 0.004, peakTime: 0.013},
  title_zhelanov_ambient_1: {url: "audio/music/title_zhelanov_ambient_1.ogg", bytes: 2999125, kind: "music", group: "stream", loop: false, note: null, duration: 260.5715, channels: 2, peakDb: -1.84, lufs: -18.1, mmax: -10.2, onset: 0.051, peakTime: 89.198},
  tongue_A3: {url: "audio/music/samples/tongue_A3.ogg", bytes: 32890, kind: "sample", group: "lazy", loop: false, note: "A3", duration: 4.2, channels: 1, peakDb: -0.97, lufs: -18.8, mmax: -12.3, onset: 0.036, peakTime: 0.042},
  tongue_A4: {url: "audio/music/samples/tongue_A4.ogg", bytes: 36602, kind: "sample", group: "lazy", loop: false, note: "A4", duration: 4.2, channels: 1, peakDb: -0.87, lufs: -18.1, mmax: -10.3, onset: 0.004, peakTime: 0.012},
  tongue_C4: {url: "audio/music/samples/tongue_C4.ogg", bytes: 31631, kind: "sample", group: "lazy", loop: false, note: "C4", duration: 4.2, channels: 1, peakDb: -1.06, lufs: -18.7, mmax: -12.0, onset: 0.024, peakTime: 0.031},
  tongue_C5: {url: "audio/music/samples/tongue_C5.ogg", bytes: 28243, kind: "sample", group: "lazy", loop: false, note: "C5", duration: 4.2, channels: 1, peakDb: -0.91, lufs: -17.5, mmax: -9.3, onset: 0.004, peakTime: 0.009},
  tongue_D4: {url: "audio/music/samples/tongue_D4.ogg", bytes: 29848, kind: "sample", group: "lazy", loop: false, note: "D4", duration: 4.2, channels: 1, peakDb: -1.03, lufs: -15.6, mmax: -9.2, onset: 0.004, peakTime: 0.008},
  tongue_D5: {url: "audio/music/samples/tongue_D5.ogg", bytes: 28250, kind: "sample", group: "lazy", loop: false, note: "D5", duration: 4.2, channels: 1, peakDb: -0.97, lufs: -15.5, mmax: -8.2, onset: 0.004, peakTime: 0.006},
  tongue_E4: {url: "audio/music/samples/tongue_E4.ogg", bytes: 30127, kind: "sample", group: "lazy", loop: false, note: "E4", duration: 4.2, channels: 1, peakDb: -0.88, lufs: -16.9, mmax: -10.1, onset: 0.004, peakTime: 0.005},
  tongue_E5: {url: "audio/music/samples/tongue_E5.ogg", bytes: 31247, kind: "sample", group: "lazy", loop: false, note: "E5", duration: 4.2, channels: 1, peakDb: -0.84, lufs: -15.2, mmax: -8.0, onset: 0.004, peakTime: 0.007},
  tongue_G4: {url: "audio/music/samples/tongue_G4.ogg", bytes: 30662, kind: "sample", group: "lazy", loop: false, note: "G4", duration: 4.2, channels: 1, peakDb: -0.95, lufs: -15.2, mmax: -8.6, onset: 0.004, peakTime: 0.014},
  ui_click_soft: {url: "audio/sfx/ui_click_soft.ogg", bytes: 4015, kind: "ui", group: "critical", loop: false, note: null, duration: 0.0942, channels: 1, peakDb: -1.31, lufs: -28.6, mmax: -28.6, onset: 0.004, peakTime: 0.001},
  ui_cloth: {url: "audio/sfx/ui_cloth.ogg", bytes: 9235, kind: "ui", group: "critical", loop: false, note: null, duration: 0.6581, channels: 1, peakDb: -1.36, lufs: -24.6, mmax: -23.6, onset: 0.077, peakTime: 0.131},
  ui_glass: {url: "audio/sfx/ui_glass.ogg", bytes: 4003, kind: "ui", group: "critical", loop: false, note: null, duration: 0.1195, channels: 1, peakDb: -1.11, lufs: -20.0, mmax: -20.0, onset: 0.004, peakTime: 0.005},
  ui_page_flip_1: {url: "audio/sfx/ui_page_flip_1.ogg", bytes: 5998, kind: "ui", group: "critical", loop: false, note: null, duration: 0.2858, channels: 1, peakDb: -1.13, lufs: -26.3, mmax: -26.3, onset: 0.107, peakTime: 0.11},
  ui_page_flip_2: {url: "audio/sfx/ui_page_flip_2.ogg", bytes: 7141, kind: "ui", group: "critical", loop: false, note: null, duration: 0.3956, channels: 1, peakDb: -1.62, lufs: -25.8, mmax: -25.8, onset: 0.004, peakTime: 0.006},
  ui_pluck: {url: "audio/sfx/ui_pluck.ogg", bytes: 4200, kind: "ui", group: "critical", loop: false, note: null, duration: 0.0966, channels: 1, peakDb: -1.03, lufs: -23.9, mmax: -23.9, onset: 0.004, peakTime: 0.004},
  whoosh_down_01: {url: "audio/sfx/whoosh_down_01.ogg", bytes: 14166, kind: "sfx", group: "critical", loop: false, note: null, duration: 1.6, channels: 1, peakDb: -0.89, lufs: -17.9, mmax: -14.5, onset: 0.005, peakTime: 0.892},
  whoosh_flap_01: {url: "audio/sfx/whoosh_flap_01.ogg", bytes: 8376, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.6771, channels: 1, peakDb: -1.01, lufs: -19.2, mmax: -18.9, onset: 0.034, peakTime: 0.283},
  whoosh_flap_02: {url: "audio/sfx/whoosh_flap_02.ogg", bytes: 9149, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.7971, channels: 1, peakDb: -1.2, lufs: -15.5, mmax: -14.8, onset: 0.004, peakTime: 0.342},
  whoosh_flap_03: {url: "audio/sfx/whoosh_flap_03.ogg", bytes: 9902, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.7971, channels: 1, peakDb: -1.25, lufs: -14.0, mmax: -13.3, onset: 0.004, peakTime: 0.44},
  whoosh_hide_01: {url: "audio/sfx/whoosh_hide_01.ogg", bytes: 11230, kind: "sfx", group: "lazy", loop: false, note: null, duration: 1.4, channels: 1, peakDb: -0.9, lufs: -17.3, mmax: -13.2, onset: 0.004, peakTime: 0.146},
  whoosh_pass_01: {url: "audio/sfx/whoosh_pass_01.ogg", bytes: 9672, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.7771, channels: 1, peakDb: -1.22, lufs: -21.0, mmax: -21.0, onset: 0.098, peakTime: 0.125},
  whoosh_pass_02: {url: "audio/sfx/whoosh_pass_02.ogg", bytes: 7263, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.4673, channels: 1, peakDb: -1.07, lufs: -17.5, mmax: -17.5, onset: 0.041, peakTime: 0.109},
  wind_gust_01: {url: "audio/sfx/wind_gust_01.ogg", bytes: 61298, kind: "amb", group: "lazy", loop: false, note: null, duration: 7.728, channels: 1, peakDb: -0.93, lufs: -16.4, mmax: -12.5, onset: 0.666, peakTime: 2.29},
  wind_gust_02: {url: "audio/sfx/wind_gust_02.ogg", bytes: 61072, kind: "amb", group: "lazy", loop: false, note: null, duration: 7.0, channels: 1, peakDb: -1.25, lufs: -18.9, mmax: -13.3, onset: 0.113, peakTime: 3.375},
  wing_flap_01: {url: "audio/sfx/wing_flap_01.ogg", bytes: 8363, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.7071, channels: 1, peakDb: -0.63, lufs: -23.6, mmax: -23.0, onset: 0.111, peakTime: 0.299},
  wing_flap_02: {url: "audio/sfx/wing_flap_02.ogg", bytes: 10826, kind: "sfx", group: "critical", loop: false, note: null, duration: 1.06, channels: 1, peakDb: -1.09, lufs: -21.6, mmax: -21.6, onset: 0.041, peakTime: 0.105},
  wing_flap_03: {url: "audio/sfx/wing_flap_03.ogg", bytes: 9206, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.7271, channels: 1, peakDb: -1.4, lufs: -18.9, mmax: -18.2, onset: 0.027, peakTime: 0.357},
  wing_flap_04: {url: "audio/sfx/wing_flap_04.ogg", bytes: 7778, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.5671, channels: 1, peakDb: -1.05, lufs: -24.2, mmax: -23.5, onset: 0.035, peakTime: 0.094},
  wing_flap_05: {url: "audio/sfx/wing_flap_05.ogg", bytes: 7203, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.5271, channels: 1, peakDb: -0.99, lufs: -30.5, mmax: -27.9, onset: 0.031, peakTime: 0.065},
  wing_flap_06: {url: "audio/sfx/wing_flap_06.ogg", bytes: 8153, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.6271, channels: 1, peakDb: -0.97, lufs: -24.8, mmax: -22.2, onset: 0.015, peakTime: 0.111},
  wing_flap_07: {url: "audio/sfx/wing_flap_07.ogg", bytes: 8071, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.6271, channels: 1, peakDb: -0.91, lufs: -29.5, mmax: -26.0, onset: 0.034, peakTime: 0.067},
  wing_flap_foley_01: {url: "audio/sfx/wing_flap_foley_01.ogg", bytes: 8782, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.7619, channels: 1, peakDb: -1.19, lufs: -23.3, mmax: -21.0, onset: 0.051, peakTime: 0.152},
  wing_flap_foley_02: {url: "audio/sfx/wing_flap_foley_02.ogg", bytes: 8186, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.6771, channels: 1, peakDb: -0.98, lufs: -27.5, mmax: -25.9, onset: 0.069, peakTime: 0.128},
  wing_flap_foley_03: {url: "audio/sfx/wing_flap_foley_03.ogg", bytes: 7094, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.5242, channels: 1, peakDb: -0.84, lufs: -25.7, mmax: -25.7, onset: 0.072, peakTime: 0.14},
  wing_flap_foley_04: {url: "audio/sfx/wing_flap_foley_04.ogg", bytes: 7108, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.5242, channels: 1, peakDb: -1.04, lufs: -24.2, mmax: -24.2, onset: 0.04, peakTime: 0.135},
  wing_flap_heavy_01: {url: "audio/sfx/wing_flap_heavy_01.ogg", bytes: 8349, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.6471, channels: 1, peakDb: -0.92, lufs: -25.7, mmax: -24.2, onset: 0.058, peakTime: 0.185},
  wing_flap_heavy_02: {url: "audio/sfx/wing_flap_heavy_02.ogg", bytes: 8904, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.6871, channels: 1, peakDb: -1.22, lufs: -23.5, mmax: -22.3, onset: 0.048, peakTime: 0.16},
  wing_flap_heavy_03: {url: "audio/sfx/wing_flap_heavy_03.ogg", bytes: 8645, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.6971, channels: 1, peakDb: -0.82, lufs: -25.3, mmax: -23.7, onset: 0.041, peakTime: 0.137},
  wing_flap_heavy_04: {url: "audio/sfx/wing_flap_heavy_04.ogg", bytes: 9131, kind: "sfx", group: "critical", loop: false, note: null, duration: 0.7171, channels: 1, peakDb: -1.24, lufs: -23.9, mmax: -23.3, onset: 0.042, peakTime: 0.177},
  wing_fold_flutter: {url: "audio/sfx/wing_fold_flutter.ogg", bytes: 23411, kind: "sfx", group: "critical", loop: false, note: null, duration: 2.42, channels: 1, peakDb: -1.2, lufs: -22.8, mmax: -18.7, onset: 0.029, peakTime: 0.807},
} as const satisfies Record<string, AudioAsset>

export type AssetId = keyof typeof AUDIO_ASSETS
