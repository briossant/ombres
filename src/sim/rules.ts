// Constantes de tuning d'Ombres — transcription de docs/GDD.md §19.
// Source unique : aucun nombre de gameplay en dur ailleurs. Les instants sont
// donnés pour une manche de 110 s et se mettent à l'échelle × T/110.

export const RULES = {
  // ─── 19.1 Temps, manche, partie ─────────────────────────────────────────
  tickHz: 30,
  roundSunSeconds: 110,
  roundLengthPresets: { short: 80, normal: 110, long: 150 },
  countdownSeconds: 3,
  nightHoldSeconds: 2,
  interludeMaxSeconds: 15,
  roundsDefault: 3,
  roundsOptions: [1, 3, 5],
  lastRoundMultiplier: 2,
  winnerBonusSuns: 1,
  rematchVoteSeconds: 15,
  playerDropToBotSeconds: 3,

  // ─── 19.2 Soleil et phases ──────────────────────────────────────────────
  sunElevStartDeg: 88,
  sunElevEndDeg: 9,
  sunElevGamma: 1.6,
  sunAzStartDeg: 240,
  sunAzEndDeg: 270,
  sunAzEaseExp: 2,
  phaseAfternoonAt: 15,
  phaseGoldenAt: 55,
  phaseSunsetAt: 85,
  greatShadowAt: 98,
  tenSecondsAt: 100,
  photoFinishAt: 104,
  greatShadowJagAmp: 6,
  lastSecondTimeScale: 0.5,
  stretchMax: 6.5,

  // ─── 19.3 Arène et grille ───────────────────────────────────────────────
  arenaPresets: [
    { maxBirds: 2, a: 110, b: 76, towers: 5 },
    { maxBirds: 3, a: 128, b: 88, towers: 5 },
    { maxBirds: 4, a: 142, b: 98, towers: 6 },
    { maxBirds: 6, a: 165, b: 114, towers: 7 },
    { maxBirds: 9, a: 188, b: 130, towers: 8 },
    { maxBirds: 12, a: 210, b: 145, towers: 9 },
  ],
  gridCols: 512,
  gridRows: 352,
  stormSoftFrom: 0.92,
  stormTurnDegPerS: 115,
  stormHardAt: 1.0,
  spawnRingFrac: 0.45,
  spawnSplashRadius: 8,
  spawnMinTowerDist: 25,
  towerMinSpacing: 45,
  towerEdgeMargin: 15,
  towerWideMinZ: 24,
  towerLowMaxRadius: 5,
  towerWideRadiusScaleExp: 0.5,
  towerMaskHz: 10,
  simounShrinkEnabled: false,
  simounShrinkTo: 0.85,

  // ─── 19.4 Oiseau ────────────────────────────────────────────────────────
  altLow: 4,
  altHigh: 18,
  strongMaxAlt: 11,
  descendRate: 22,
  climbRate: 8,
  speedLow: 16,
  speedHigh: 21,
  speedTau: 0.25,
  turnLowDegPerS: 140,
  turnHighDegPerS: 105,
  yawAccelDegPerS2: 720,
  stickDeadzone: 0.2,
  wingspan: 11,
  birdRenderScaleMax: 1.3,
  birdRenderScaleMaxCrowded: 1.75,
  bumpDist: 6,
  bumpDz: 3,
  bumpImpulse: 5,
  towerCollisionMargin: 2.5,
  towerSlideSlow: 0.3,
  towerSlideTime: 0.3,
  towerAvoidAssistDeg: 15,
  towerAvoidLookahead: 0.5,
  flapImpulse: 22,
  flapDuration: 0.3,
  flapCooldown: 3.0,
  inputBufferSeconds: 0.15,

  // ─── 19.5 Ombre et peinture ─────────────────────────────────────────────
  shadowRadiusLow: 5,
  shadowRadiusHigh: 11,
  shadowOpacityStrong: 0.85,
  shadowOpacityPale: 0.4,
  shadowSoftEdge: 0.5,
  shadowRimWidth: 0.5,
  shadowThreadMinOffset: 8,
  paintMaxStepMeters: 1.0,
  levelPale: 1,
  levelStrong: 2,
  palePaintAlpha: 0.45,
  hideCoverFrac: 0.9,
  hideSamplePoints: 13,
  trailBufferSeconds: 3.0,

  // ─── 19.6 Piqué ─────────────────────────────────────────────────────────
  diveLockDz: 6,
  diveLockRange: 26,
  diveLockConeDeg: 70,
  diveLockNoConeDist: 3,
  diveWindup: 0.2,
  diveHSpeed: 30,
  diveTurnDegPerS: 150,
  diveCommitLead: 0.65,
  diveMaxTime: 1.4,
  // Agent sim : 4,0 → 5,5. La micro-simulation du GDD (§17-E) réorientait le coup d'aile
  // perpendiculairement à l'approche à chaque instant ; dans le jeu, il part dans la direction
  // du joystick, fixée à l'appui, ce qui rendait l'esquive ≈ 0,1 s plus facile (réaction
  // 0,30 s : 2 % de touches au lieu de 52 %). 5,5 m restitue la courbe visée par le GDD
  // (0,20 / 0,27 / 0,30 / 0,37 / 0,40 s → 3 / 21 / 45 / 97 / 97 %). Voir docs/agent-notes/sim.md.
  diveHitRadius: 5.5,
  diveHitMaxBelow: 1,
  stunHit: 1.5,
  stunDriftSpeed: 8,
  immunityAfterStun: 2.5,
  trailStealSeconds: 1.5,
  trailStealCrownSeconds: 3.0,
  trailStealWaveSeconds: 0.4,
  diveReboundDz: 6,
  missStun: 1.0,
  diveCooldown: 1.0,
  latencyGraceMax: 0.1,
  maxBotsPerTarget: 2,
  botTargetWindow: 10,
  lockChevronsPerTarget: 1,

  // ─── 19.7 Couronne, score, titres ───────────────────────────────────────
  crownHysteresis: 2,
  bigStealFrac: 0.03,
  titleRapaceMin: 3,
  /** Polish G10 : le Rapace revient d'office à qui fait au moins … × la moyenne des touches. */
  titleRapaceDominance: 2,
  titleGibierMin: 3,
  titleAnguilleMin: 2,
  titleKamikazeMin: 3,
  titlePilleurMinFrac: 0.08,
  titleRaseMottesMinFrac: 0.5,
  titleNuageMinFrac: 0.75,
  titleBatisseurMinFrac: 0.4,
  titleNotaireMinFrac: 0.03,
  titleLezardMinSeconds: 15,
  titleRevenantMinPlaces: 2,

  // ─── 19.8 Caméra, ralentis, HUD ─────────────────────────────────────────
  camPitchStartDeg: 58,
  camPitchEndDeg: 42,
  camBirdWeight: 0.7,
  camShadowWeight: 1.0,
  camMarginX: 0.12,
  camMarginY: 0.15,
  camMinWidth: 110,
  camMaxWidthFactor: 1.1,
  camPosOmega: 1.8,
  camZoomOmega: 1.2,
  camDeadzone: 4,
  camDiveZoom: 0.08,
  camDiveZoomSeconds: 0.6,
  camShakeAmp: 0.15,
  camNightRiseSeconds: 2.5,
  hitSlowmoScale: 0.35,
  hitSlowmoSeconds: 0.35,
  hitSlowmoRampSeconds: 0.2,
  hitSlowmoMinGap: 6,
  // Polish vague 1 (G4) : hiérarchie des impacts. Le flash « planche » (bible §6.8) est réservé
  // aux touches qui comptent : couronne, humain impliqué, ou vol d'au moins cette part de l'arène ;
  // au plus un toutes les plancheFlashMinGap s (temps réel). Esquive d'un humain : court ralenti.
  plancheFlashMinStealFrac: 0.01,
  plancheFlashMinGap: 6,
  // Au plus … flashs par manche ; les touches « mineures » (humain impliqué, hors couronne,
  // vol < 1 %) n'en prennent que … et attendent … s depuis le flash précédent (mesuré avec un
  // pilote clavier très actif à 12 oiseaux : 5 flashs par manche sans ces bornes).
  plancheFlashMaxPerRound: 4,
  plancheFlashMinorMaxPerRound: 2,
  plancheFlashMinorGap: 12,
  dodgeSlowmoScale: 0.6,
  dodgeSlowmoSeconds: 0.2,
  noSlowmoLastSeconds: 3,
  hudDialHeightFrac: 0.18,
  hudBarWidthFrac: 0.46,
  // Lead : 18 → 38 px (ART_BIBLE §8.5 : le % en Averia doit tenir dans la bande et se lire à 3 m).
  hudBarHeightPx: 38,
  hudSegmentLabelMinFrac: 0.03,
  hudBarAnimMs: 300,
  phaseBannerSeconds: 3,
  nameTagSeconds: 5,
  subtitleSeconds: 3,
  subtitlePx: 28,

  // ─── 19.9 Narrateur et indications ──────────────────────────────────────
  narratorMinGap: 8,
  narratorUrgentGap: 3,
  narratorMaxPerRound: 8,
  narratorStaleSeconds: 2.5,
  narratorUrgentStaleSeconds: 4,
  narratorQuietFrom: 107,
  narratorDuckDb: -6,
  narratorDuckAttackMs: 80,
  narratorDuckReleaseMs: 400,
  leaderChangeStableSeconds: 2,
  leaderChangePrevHoldSeconds: 8,
  leaderChangeMinGap: 20,
  leaderChangeMaxPerRound: 3,
  bigStealFracNarr: 0.04,
  hugeSweepFrac: 0.06,
  trailStealNarrFrac: 0.02,
  diveHitNarrMinGap: 25,
  doubleHitWindow: 4,
  huntStreakHits: 3,
  huntStreakWindow: 20,
  hiddenLongSeconds: 8,
  stormLongSeconds: 3,
  idleSeconds: 10,
  runawayRatio: 1.8,
  /** « Écart énorme » seulement après cet instant (GDD §16.4). */
  runawayFromAt: 60,
  /** Écart minimal entre deux annonces de « gros vol » (GDD §16.4). */
  bigStealNarrMinGap: 20,
  photoFinishGap: 0.015,
  closeFinishGap: 0.01,
  landslideGap: 0.12,
  comebackFromLastAt: 80,
  hintMinGap: 8,
  hintNoDiveAfter: 6,
  hintLowTooLong: 8,
  hintPaleOnStrongSeconds: 1.5,
  hintShadowOffsetMin: 15,

  // ─── 19.10 Contrôles, réseau ────────────────────────────────────────────
  joystickRadiusPx: 70,
  buttonDiveHeightFrac: 0.38,
  buttonFlapHeightFrac: 0.28,
  pauseLongPressSeconds: 1,
  tiltDeadzoneDeg: 5,
  tiltMaxDeg: 20,
  lockTickMinGapSeconds: 2,
  inputSendHz: 30,
  wsPingSeconds: 25,
  /** Mode de contrôle Relatif : écart de cap visé selon |x| du joystick (min à la zone morte, max à fond). */
  relativeSteerMinDeg: 25,
  relativeSteerMaxDeg: 90,

  // ─── 19.11 Aide au vol ──────────────────────────────────────────────────
  assistLockRange: 34,
  assistLockConeDeg: 85,
  assistAvoidDeg: 30,
  assistImmunity: 4,
  assistAutoFlapChance: 0.5,

  // ─── 19.12 Bots : [Oisillon, Voyageur, Seigneur des sables] ─────────────
  botReactionMs: [550, 300, 160],
  botDecisionSeconds: [1.0, 0.6, 0.35],
  botHeadingNoiseDeg: [20, 8, 3],
  botShadowAimComp: [0.5, 0.85, 1.0],
  botLockHoldSeconds: [1.2, 0.6, 0.25],
  botBadDiveChance: [0.3, 0.1, 0],
  botFlapReactMeanS: [0.45, 0.3, 0.26],
  botFlapReactSdS: [0.15, 0.05, 0.03],
  botFlapForgetChance: [0.35, 0.1, 0.03],
  botFeintChance: [0, 0.15, 0.35],
  botPaleOnStrongChance: [0.4, 0.1, 0],
  botNightLeaveAt: [null, 95, 90] as readonly (number | null)[],
  botErrorEverySeconds: [10, 25, 40],
  botCircleBeforeDiveSeconds: 0.8,
  botFurrowSpacing: 10,
  botLeaderBias: 0.5,
  botBlockSize: 8,
  botValueNeutral: 1.2,
  botValueSteal: 1.0,
  botValueStealCrown: 1.25,
  botValueUpgradeOwn: 0.35,

  // ─── 19.13 Lobby et onboarding ──────────────────────────────────────────
  lobbyArenaA: 90,
  lobbyArenaB: 62,
  lobbySunElevDeg: 60,
  lobbyResetSeconds: 30,
  lobbyGoalFlySeconds: 2,
  lobbyGoalDiveHoldSeconds: 1,
  rulesCardsSeconds: 8,
  titleDemoSunSeconds: 40,

  // ─── Ajouts de l'agent sim (compatibles ; voir docs/agent-notes/sim.md) ──
  /** Azimut fixe du soleil du lobby (ombres vers l'est-nord-est). */
  lobbySunAzDeg: 250,
  /** Horloge de palette du lobby : KF50 fixe (ART_BIBLE §2.4). */
  lobbyPaletteElevDeg: 50,
  /** Pause entre deux boucles de l'écran titre (après la nuit). */
  demoLoopPauseSeconds: 2,
  /** Carte d'ouverture (Parasols) : rayon dégagé autour du centre (GDD §9.3). */
  openingCenterClear: 30,
  /** Falaise : distance à l'ouest (m) ; sa crête culmine à atan(h/d) = sunElevEndDeg. */
  cliffDistance: 1700,
  /** Échantillonnage du profil dentelé du front de nuit (m). */
  cliffJagSpacing: 2,
  /** Prise d'élan : fraction de la vitesse conservée pendant que le chasseur se cabre. */
  diveWindupSpeedFactor: 0.5,
  /** Raté constaté dès que le chasseur passe à plus de ce dénivelé sous sa cible (m). */
  diveMissBelow: 1.5,
  /** Aide au vol : délai du coup d'aile automatique après le clac (s). */
  assistAutoFlapDelay: 0.15,
  /** « tsk » : au plus un événement paleOnStrong par oiseau toutes les … s. */
  paleOnStrongEventGap: 0.35,
  /** « tsk » : cellules fortes adverses sous une ombre pâle pour compter un contact. */
  paleOnStrongMinCells: 4,
  /** Collision entre oiseaux : délai avant un nouvel événement pour la même paire (s). */
  bumpRepeatSeconds: 0.6,
  /** Collision avec une tour : délai avant un nouvel événement (s). */
  towerBumpRepeatSeconds: 0.6,
  /** Événement bigSteal : réarmé quand le gain sur 3 s retombe sous cette fraction du seuil. */
  bigStealRearmFrac: 0.66,
  /** Événement storm : hystérésis de sortie de la bande du Simoun (rayon elliptique). */
  stormEventHysteresis: 0.01,
  /** Aide au vol : horizon d'anticipation de l'évitement du Simoun (s). */
  assistStormLookahead: 1.0,
} as const

export type Rules = typeof RULES
export const DEG = Math.PI / 180
