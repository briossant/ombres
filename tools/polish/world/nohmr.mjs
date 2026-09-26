// Préchargement pour les scénarios Playwright lancés pendant que d'autres correcteurs modifient le
// code : la page ne se connecte pas au HMR de Vite (sinon chaque édition d'un autre module recharge
// la page et casse la mesure ou la capture en cours). Chaque nouvelle page charge le code courant.
//   node --import ./tools/polish/world/nohmr.mjs tools/polish/tech/perfmatrix.mjs …
import { chromium } from 'playwright-core'

export const NOHMR = () => {
  const WS = window.WebSocket
  const isHmr = p => p === 'vite-hmr' || p === 'vite-ping' || (Array.isArray(p) && (p.includes('vite-hmr') || p.includes('vite-ping')))
  function Patched(url, protocols) {
    if (isHmr(protocols)) {
      // prise qui ne s'ouvre jamais : le client Vite attend, sans erreur ni rechargement
      const fake = new EventTarget()
      Object.assign(fake, { readyState: 0, send() {}, close() {}, url: String(url), protocol: '', binaryType: 'blob', bufferedAmount: 0 })
      return fake
    }
    return protocols === undefined ? new WS(url) : new WS(url, protocols)
  }
  Patched.prototype = WS.prototype
  Object.assign(Patched, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
  window.WebSocket = Patched
}

const orig = chromium.launch.bind(chromium)
chromium.launch = async (...a) => {
  const b = await orig(...a)
  const nc = b.newContext.bind(b)
  b.newContext = async (...c) => {
    const ctx = await nc(...c)
    await ctx.addInitScript(NOHMR)
    return ctx
  }
  return b
}
