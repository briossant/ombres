// Boucle du runner dans la frame R3F : priorité −10, avant la caméra (−5), les oiseaux (−1),
// les FX (0) et le pipeline NPR (1). gameView est donc à jour pour tout le monde.
import { useFrame } from '@react-three/fiber'
import { runner } from './runner.ts'

export function RunnerFrame() {
  useFrame((_, dt) => runner.frame(dt), -10)
  return null
}
