// Table des sons : chaque nom → fichiers (variations), sonie visée (LUFS momentanés), hauteur,
// polyphonie, réverbe. Les sonies sont relatives au bus à 1 ; la chaîne master et les volumes
// des réglages s'appliquent ensuite. Repères : un bruitage courant ≈ −20, un temps fort ≈ −13,
// l'interface ≈ −24, un survol ≈ −32.
import { RULES } from '../../sim/rules.ts'
import type { AssetId } from './manifest.gen.ts'
import type { SoundDef } from './voices.ts'

/** Variations numérotées « prefixe01…prefixeNN » (vérifiées au typage par `satisfies`). */
const range = (prefix: string, n: number): AssetId[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}` as AssetId)

export const SOUNDS = {
  // ─── Ailes ───────────────────────────────────────────────────────────────
  /** Battement de montée (animation procédurale : un par coup d'aile vers le bas). */
  flap_climb: {
    files: [...range('wing_flap_', 7), ...range('wing_flap_foley_', 4)],
    db: -27, pitch: 1.2, jitterDb: 2, maxVoices: 6, reverb: 0.06,
  },
  /** COUP D'AILE (bouton) : battement lourd + souffle. */
  flap_strong: { files: range('wing_flap_heavy_', 4), db: -20, pitch: 0.8, jitterDb: 1, maxVoices: 4, reverb: 0.1 },
  /** Souffle du COUP D'AILE : quatre souffles différents, calés pour culminer 0,15 s après le battement. */
  flap_whoosh: { files: ['whoosh_pass_02', 'whoosh_flap_01', 'whoosh_flap_02', 'whoosh_flap_03'], db: -23, pitch: 1.5, maxVoices: 4, align: { peakAt: 0.15 } },
  wing_fold: { files: ['wing_fold_flutter'], db: -22, pitch: 1.2, duration: 0.7, release: 0.25, maxVoices: 3, align: { peakAt: 0.25 } },

  // ─── Piqué ───────────────────────────────────────────────────────────────
  /** Cri de prise d'élan (cri de buse ralenti de 5 demi-tons : oiseau géant). */
  cry_windup: {
    files: ['bird_hawk_scream_01_giant', 'bird_hawk_scream_02_giant', 'bird_hawk_scream_03_giant'],
    db: -19, pitch: 0.8, maxVoices: 3, reverb: 0.22,
  },
  /** Chute guidée : grand souffle qui suit l'oiseau. */
  dive_whoosh: { files: ['dive_whoosh_big_01', 'dive_whoosh_big_02'], db: -23, pitch: 0.6, maxVoices: 4, reverb: 0.08, align: 'onset' },
  /** Engagement : le « boum » des plumes de l'engoulevent en piqué, qui culmine vers l'impact. */
  dive_boom: { files: ['dive_nighthawk_01', 'dive_nighthawk_02'], db: -19, pitch: 0.7, maxVoices: 3, reverb: 0.12, align: { peakAt: 0.45 } },
  /** « Clac » sec des ailes claquées (généré). */
  clac: { files: ['proc_clac'], db: -14, pitch: 0.7, jitterDb: 1, maxVoices: 3, reverb: 0.18 },
  hit_punch: { files: ['impact_punch'], db: -13, pitch: 0.8, maxVoices: 3, reverb: 0.15 },
  hit_body: { files: ['impact_hit_heavy'], db: -19, pitch: 1, duration: 1.0, release: 0.25, maxVoices: 3, align: 'onset' },
  feathers: { files: range('feather_burst_', 3), db: -21, pitch: 2, maxVoices: 4, reverb: 0.1 },
  victim_cry: {
    files: [...range('bird_squawk_', 4), 'bird_ptero_squawk', 'bird_vulture_hiss'],
    db: -19, pitch: 1.2, maxVoices: 3, reverb: 0.18,
  },
  miss_sand: { files: ['sandfall'], db: -19, pitch: 2, duration: 1.5, release: 0.6, maxVoices: 3 },
  miss_thud: { files: ['impact_thud_light', 'impact_soft_heavy_2'], db: -18, pitch: 1.5, maxVoices: 3 },
  /** Esquive : un accent (+4 dB sur le mixage d'origine, creux de musique joué par sfx.ts). */
  dodge_whoosh: { files: ['whoosh_pass_01'], db: -14, pitch: 1, maxVoices: 3, reverb: 0.1 },
  dodge_ting: { files: ['ui_glass'], db: -21, pitch: 0, maxVoices: 2, reverb: 0.35 },
  feint: { files: ['whoosh_pass_02'], db: -26, semitones: 4, pitch: 1, maxVoices: 3 },

  // ─── Collisions, territoire, tours ───────────────────────────────────────
  bump: { files: ['impact_soft_heavy_0', 'impact_soft_heavy_2', 'impact_soft_heavy_4'], db: -20, pitch: 2, maxVoices: 3, cooldown: 0.05 },
  bump_feathers: { files: range('feather_burst_', 3), db: -28, pitch: 2, maxVoices: 2 },
  tower_bump: { files: ['impact_soft_medium_0', 'impact_soft_medium_1', 'impact_soft_medium_3'], db: -21, pitch: 2, maxVoices: 3, cooldown: 0.08 },
  tower_scrape: { files: ['whoosh_pass_02'], db: -26, semitones: -3, pitch: 1, lowpass: 3000, maxVoices: 2 },
  /** « Tsk » granuleux : le pâle ne recouvre pas le fort (généré). */
  tsk: { files: ['proc_tsk'], db: -27, pitch: 3, jitterDb: 2, maxVoices: 3, cooldown: 0.09 },
  lock_tick: { files: ['ui_click_soft'], db: -31, semitones: 5, maxVoices: 2, cooldown: 0.25 },
  flap_ready: { files: ['tick_wood_soft'], db: -31, semitones: 7, pitch: 0.2, maxVoices: 2, cooldown: 0.15 },
  hidden_in: { files: ['whoosh_hide_01'], db: -29, semitones: -3, lowpass: 900, maxVoices: 2, cooldown: 0.3 },
  dive_down: { files: ['whoosh_down_01'], db: -29, semitones: -2, pitch: 1.5, lowpass: 2500, maxVoices: 3, cooldown: 0.12, duration: 1.1, release: 0.5 },
  storm_gust: { files: ['wind_gust_01'], db: -22, pitch: 1.5, duration: 3.5, release: 1.2, maxVoices: 2, cooldown: 1.5 },
  /**
   * Couronne et gros vol : des accents (+4 dB et +3/+4 dB, creux de musique joué par sfx.ts). À
   * +5 dB, la cloche devenait le premier bruitage en énergie à 12 oiseaux (14 changements par manche).
   */
  crown_bell: { files: ['bowl_strike_soft'], db: -19, maxVoices: 2, reverb: 0.3, duration: 2.6, release: 1.2, essential: true },
  steal_sub: { files: ['sub_drop'], db: -17, maxVoices: 2 },
  steal_sand: { files: ['sandfall'], db: -18, pitch: 1, maxVoices: 2, reverb: 0.1 },
  territory_reset: { files: ['hourglass_turn'], db: -25, maxVoices: 1 },
  stun_tumble: { files: ['wing_fold_flutter'], db: -25, semitones: -3, pitch: 1, offset: 0.9, duration: 1.2, release: 0.4, maxVoices: 3 },

  // ─── Rythme de manche ────────────────────────────────────────────────────
  count_tick: { files: ['tick_rods'], db: -15, maxVoices: 2, reverb: 0.25, essential: true },
  /** Conque d'« Envol » : coupée à 2,5 s (elle tenait 6,9 s, sous la réplique d'ouverture). */
  count_conch: { files: ['horn_conch'], db: -15, maxVoices: 1, reverb: 0.35, duration: 2.5, release: 1, essential: true },
  count_bell: { files: ['bell_tibetan'], db: -19, maxVoices: 1, reverb: 0.3, essential: true },
  phase_chime: { files: ['chime_transition'], db: -22, maxVoices: 2, reverb: 0.3, essential: true },
  gs_boom: { files: ['boom_cinematic'], db: -13, maxVoices: 1, reverb: 0.2, essential: true },
  gs_tremor: { files: ['deep_tremor'], db: -18, maxVoices: 1 },
  /** Dix secondes : seul signal sonore du moment (le narrateur se tait après la Grande Ombre), +3 dB. */
  ten_seconds: { files: ['bowl_hit'], db: -13, maxVoices: 1, reverb: 0.3, essential: true },
  /** 5 dernières secondes : jouées par la partition sur le battement de cœur (sfx.lastSecond). */
  last_tick: { files: ['tick_woodblock'], db: -13, maxVoices: 2, reverb: 0.2, essential: true },
  night_gong: { files: ['gong_big'], db: -16, maxVoices: 1, reverb: 0.25, essential: true },

  // ─── Interface (bus ui : pas étouffée par les ralentis) ──────────────────
  ui_hover: { files: ['ui_click_soft'], db: -33, semitones: 5, pitch: 0.4, bus: 'ui', maxVoices: 2, cooldown: 0.035 },
  ui_click: { files: ['tick_rods'], db: -22, semitones: 3, pitch: 0.3, bus: 'ui', maxVoices: 2, cooldown: 0.03 },
  ui_confirm: { files: ['ui_pluck'], db: -20, bus: 'ui', maxVoices: 2, reverb: 0.15 },
  ui_confirm_wood: { files: ['tick_woodblock'], db: -25, semitones: 2, bus: 'ui', maxVoices: 2 },
  ui_back: { files: ['tick_rods'], db: -23, semitones: -4, pitch: 0.3, bus: 'ui', maxVoices: 2 },
  ui_back_paper: { files: ['ui_page_flip_2'], db: -30, bus: 'ui', maxVoices: 2 },
  ui_error: { files: ['tick_woodblock'], db: -21, semitones: -7, bus: 'ui', maxVoices: 3 },
  ui_toggle: { files: ['tick_wood_soft'], db: -24, semitones: 2, pitch: 0.3, bus: 'ui', maxVoices: 2 },
  ui_open: { files: ['ui_page_flip_1'], db: -24, pitch: 0.5, bus: 'ui', maxVoices: 2 },
  ui_close: { files: ['ui_page_flip_2'], db: -25, pitch: 0.5, bus: 'ui', maxVoices: 2 },
  ui_slider: { files: ['tick_wood_soft'], db: -27, bus: 'ui', maxVoices: 2, cooldown: 0.045 },
  ui_ready: { files: ['ui_glass'], db: -20, bus: 'ui', maxVoices: 2, reverb: 0.2 },
  ui_unready: { files: ['ui_click_soft'], db: -26, bus: 'ui', maxVoices: 2 },
  ui_flap: { files: range('wing_flap_heavy_', 4), db: -24, pitch: 1, bus: 'ui', maxVoices: 3 },
  ui_fold: { files: ['wing_fold_flutter'], db: -27, pitch: 1, bus: 'ui', duration: 0.8, release: 0.3, maxVoices: 2 },
  /** Décompte des parts aux résultats : discret (−6 dB), il accompagne l'animation. */
  ui_count: { files: ['tick_wood_soft'], db: -33, bus: 'ui', maxVoices: 3, cooldown: 0.05 },
  /** Note d'un joueur (tongue drum, transposé par le code). */
  ui_note: { files: ['tongue_A3'], db: -19, bus: 'ui', maxVoices: 8, reverb: 0.3 },

  // ─── Ponctuations (résultats, victoire, pause) ───────────────────────────
  st_launch: { files: ['harp_gliss_up_02'], db: -18, bus: 'ui', maxVoices: 1, reverb: 0.25 },
  st_launch_bell: { files: ['bell_tibetan'], db: -21, bus: 'ui', maxVoices: 1, reverb: 0.3 },
  st_round_win_chord: { files: ['bells_harmony_chord'], db: -18, bus: 'ui', maxVoices: 1, reverb: 0.2 },
  /** Harpe des résultats : la fin du glissando, qui culmine 1,2 s après le dévoilement (avant la réplique). */
  st_round_win_harp: { files: ['harp_gliss_up_01'], db: -21, bus: 'ui', maxVoices: 1, reverb: 0.25, align: { peakAt: 1.2 } },
  /** Podium : −6 dB par rapport au premier mixage (le passage au podium dépassait le climax de 8 dB). */
  st_game_win_harp: { files: ['harp_gliss_up_02'], db: -22, bus: 'ui', maxVoices: 1, reverb: 0.25 },
  st_game_win_gong: { files: ['gong_short'], db: -21, bus: 'ui', maxVoices: 1, reverb: 0.3 },
  st_game_win_cry: { files: ['bird_hawk_scream_01'], db: -26, bus: 'ui', maxVoices: 1, reverb: 0.45 },
  /** Dernière manche : l'impact du riser tombe sur « Envol » (le stinger part avec le compte à rebours). */
  st_last_round: { files: ['riser_hit'], db: -15, bus: 'ui', maxVoices: 1, align: { peakAt: RULES.countdownSeconds } },
  st_pause: { files: ['harp_gliss_down'], db: -21, bus: 'ui', maxVoices: 1, reverb: 0.2 },
  st_resume: { files: ['harp_gliss_up_02'], db: -25, bus: 'ui', maxVoices: 1, duration: 1.4, release: 0.6 },
  st_rematch: { files: ['hourglass_turn'], db: -21, bus: 'ui', maxVoices: 1 },
  st_crown_win: { files: ['bell_harmony'], db: -20, bus: 'ui', maxVoices: 1, reverb: 0.3 },
  /** Cri lointain de l'écran titre (oiseau géant quelque part au-dessus du désert). */
  title_cry: {
    files: ['bird_eagle_cry_01', 'bird_eagle_cry_02', 'bird_eagle_cry_03', 'bird_hawk_scream_01_giant', 'bird_hawk_scream_02_giant'],
    db: -29, pitch: 1.5, lowpass: 3200, maxVoices: 1, reverb: 0.6, bus: 'amb',
  },
  amb_gust: { files: ['wind_gust_01', 'wind_gust_02'], db: -25, pitch: 2, maxVoices: 2, bus: 'amb' },
} as const satisfies Record<string, SoundDef>

export type SoundName = keyof typeof SOUNDS
