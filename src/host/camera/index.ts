// Mise en scène : caméra de jeu, cinématiques, podium, repères du HUD (docs/agent-notes/staging.md).
export { cameraCue, cueCamera, cameraState, cameraBeats, type CameraMode, type CameraBeat } from './cue.ts'
export { GameCamera, type GameCameraProps } from './GameCamera.tsx'
export { HudProjector, projectHudAnchors, type HudProjectorProps } from './HudProjector.tsx'
export { PodiumStage, stageModes, currentPodium } from './PodiumStage.tsx'
export { buildPodiumView, podiumLayout, PODIUM_SCREEN_X, type PodiumView, type PodiumLayout } from './podium.ts'
export { CameraDirector, RESULTS_MAP_RECT, resultsMapRect, NIGHT_HOLD_SECONDS } from './director.ts'
