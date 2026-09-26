// Préchargement pour les scripts Playwright pendant le polish parallèle : coupe le WebSocket HMR de
// Vite (les modifications des autres correcteurs rechargeaient la page en pleine partie). Le jeu
// garde son propre WebSocket (/ws). Usage : node --import ./tools/polish/staging/nohmr.mjs <script>
import pw from 'playwright-core'

const isHmr = (u) => {
  try {
    const url = typeof u === 'string' ? new URL(u) : u
    return url.searchParams.has('token') && !url.pathname.startsWith('/ws')
  } catch {
    return false
  }
}
const launch = pw.chromium.launch.bind(pw.chromium)
pw.chromium.launch = async (...args) => {
  const browser = await launch(...args)
  const newContext = browser.newContext.bind(browser)
  browser.newContext = async (...opts) => {
    const ctx = await newContext(...opts)
    // socket simulé, ouvert, jamais relié au serveur : aucune mise à jour, aucun rechargement
    await ctx.routeWebSocket(isHmr, () => {})
    return ctx
  }
  return browser
}
