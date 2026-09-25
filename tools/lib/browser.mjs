// Lancement de Chrome headless avec WebGL2 accéléré (GPU AMD via ANGLE/EGL), sans fenêtre.
// Voir docs/research/stack-deploy.md. Fallback logiciel : SOFTWARE_GL=1.
import { chromium, devices } from 'playwright-core'

export const CHROME = process.env.CHROME_PATH ?? '/etc/profiles/per-user/bcr/bin/google-chrome'
export const GPU_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl-egl']
export const SOFTWARE_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']

/** @param {{ noVsync?: boolean, extraArgs?: string[] }} [opts] */
export async function launch(opts = {}) {
  const args = [...(process.env.SOFTWARE_GL ? SOFTWARE_ARGS : GPU_ARGS), '--autoplay-policy=no-user-gesture-required']
  if (opts.noVsync) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit')
  if (opts.extraArgs) args.push(...opts.extraArgs)
  return chromium.launch({ executablePath: CHROME, headless: true, args })
}

/**
 * Contexte navigateur : desktop 1920×1080 par défaut, ou téléphone (`mobile: 'iPhone 15 Pro' | 'Pixel 7'`).
 * @param {import('playwright-core').Browser} browser
 * @param {{ w?: number, h?: number, mobile?: string, landscape?: boolean }} [opts]
 */
export async function newContext(browser, opts = {}) {
  let ctx = { viewport: { width: opts.w ?? 1920, height: opts.h ?? 1080 }, deviceScaleFactor: 1 }
  if (opts.mobile) {
    const { defaultBrowserType: _ignored, ...d } = devices[opts.mobile]
    ctx = { ...d }
    if (opts.landscape) ctx.viewport = { width: d.viewport.height, height: d.viewport.width }
  }
  return browser.newContext(ctx)
}

/** Collecte console + erreurs de page. */
export function collectLogs(page) {
  const logs = []
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`))
  return logs
}

export async function gpuRenderer(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return 'NO WEBGL2'
    const d = gl.getExtension('WEBGL_debug_renderer_info')
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  })
}
