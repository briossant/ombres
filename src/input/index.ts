// Couche d'entrée unique (voir docs/agent-notes/runner.md §Entrées).
export { InputRouter, LocalInput, type InputSource } from './router.ts'
export { KeyboardSource } from './keyboard.ts'
export { GamepadSource } from './gamepad.ts'
export { localButtonLabels, loadKeyboardLayout } from './labels.ts'
export { newInput, copyInput, LOCAL_GROUPS, type LocalGroup, type LocalState } from './types.ts'
