// Options de debug : UNIQUEMENT derrière ?debug dans l'URL (rien de visible sinon).
//   ?debug            expose window.__ombres (runner, stores) pour les scripts de test
//   ?debug=fast       partie accélérée : manches courtes, simulation × ?speed (4 par défaut),
//                     entractes raccourcis (tests de bout en bout)
//   ?debug=nosave     n'écrit pas la sauvegarde de session (captures isolées)
//   ?debug=perf       mesures GPU par passe et leur surimpression (WorldCanvas measure)
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const flags = (Q.get('debug') ?? '').split(',').filter(Boolean)

export const DEBUG = Q.has('debug')
export const DEBUG_FAST = DEBUG && flags.includes('fast')
export const DEBUG_NOSAVE = DEBUG && flags.includes('nosave')
/** Mesures GPU par passe + surimpression (?debug=perf). */
export const DEBUG_PERF = DEBUG && flags.includes('perf')
/** Multiplicateur du temps de simulation (1 hors ?debug=fast). */
export const SIM_SPEED = DEBUG_FAST ? Math.max(1, Math.min(12, Number(Q.get('speed') ?? 4) || 4)) : 1
/** Facteur des durées d'entracte (résultats, cartes, votes) : 1 hors ?debug=fast. */
export const INTERLUDE_FACTOR = DEBUG_FAST ? 0.4 : 1
