// Journal de three.js : un seul avertissement connu est écarté, celui que R3F 9.8 provoque en
// instanciant THREE.Clock (déprécié dans three 0.186). Il ne dépend pas de notre code et les
// versions sont figées (DECISIONS D18) ; le reste passe tel quel (setConsoleFunction : API de three).
import { setConsoleFunction } from 'three'

const MUTED = ['THREE.Clock: This module has been deprecated']

setConsoleFunction((type, message, ...params) => {
  if (MUTED.some(m => message.startsWith(m))) return
  const first = params[0] as { isStackTrace?: boolean; getError?: (m: string) => Error } | undefined
  if (first?.isStackTrace && first.getError) console[type](first.getError(message))
  else console[type](message, ...params)
})
