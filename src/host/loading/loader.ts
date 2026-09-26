// Chargement avec progression RÉELLE (BRIEF, ART_BIBLE §8.8) : chaque étape rapporte son
// avancement, pondéré par son poids dans la barre.
//   polices de l'UI → textures (atlas de glyphes) → manifeste des voix → sons essentiels
//   (octets réels) → rendu de chauffe (compilation des shaders : la démo de l'écran titre tourne
//   déjà derrière l'écran de chargement) → le désert est prêt.
import { indexNarratorManifest, type NarratorManifest } from '../../director/index.ts'
import { preloadAudio } from '../audio/index.ts'
import { preloadUiFonts } from '../ui/fonts.ts'
import { setLoading } from '../ui/viewModel.ts'
import { GLYPH_KEYS } from '../ui/glyphShapes.ts'
import { runner } from '../runner/runner.ts'

interface Step {
  key: string
  weight: number
  run: (progress: (p: number) => void) => Promise<void>
}

const BASE = import.meta.env.BASE_URL

/** Précharge une image (résout même en cas d'erreur : le jeu a des replis). */
function loadImage(src: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = img.onerror = () => resolve()
    img.src = src
  })
}

/** Attend que la scène ait rendu assez d'images stables (shaders compilés, textures envoyées). */
function warmUp(progress: (p: number) => void, frames = 30, timeoutMs = 20000): Promise<void> {
  return new Promise(resolve => {
    const start = performance.now()
    const from = runner.renderedFrames
    let last = performance.now()
    let stable = 0
    const loop = () => {
      const t = performance.now()
      const dt = t - last
      last = t
      const n = runner.renderedFrames - from
      stable = dt < 50 ? stable + 1 : 0
      progress(Math.min(1, n / frames))
      if ((n >= frames && stable >= 8) || t - start > timeoutMs) {
        progress(1)
        resolve()
        return
      }
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
}

let started = false

/** Lance le chargement puis passe la main au runner (titre, ou reprise de la partie). */
export async function bootGame(): Promise<void> {
  if (started) return
  started = true
  const steps: Step[] = [
    { key: 'host.loading.fonts', weight: 0.06, run: p => preloadUiFonts((done, total) => p(done / total)) },
    {
      key: 'host.loading.textures',
      weight: 0.05,
      run: async p => {
        const files = [`${BASE}ui/glyphs-atlas.png`, ...GLYPH_KEYS.map(k => `${BASE}ui/glyphs/${k}.svg`)]
        let done = 0
        await Promise.all(files.map(f => loadImage(f).then(() => p(++done / files.length))))
      },
    },
    {
      key: 'host.loading.voices',
      weight: 0.04,
      run: async p => {
        try {
          const res = await fetch(`${BASE}audio/narrator/manifest.json`)
          const manifest = (await res.json()) as NarratorManifest
          runner.setNarratorClips(indexNarratorManifest(manifest))
        } catch {
          // sans manifeste : durées estimées depuis le texte (sous-titres seuls)
        }
        p(1)
      },
    },
    { key: 'host.loading.sounds', weight: 0.6, run: p => preloadAudio(p) },
    { key: 'host.loading.shaders', weight: 0.25, run: p => warmUp(p) },
  ]
  const total = steps.reduce((n, s) => n + s.weight, 0)
  let base = 0
  setLoading(0, 'host.loading.start')
  for (const step of steps) {
    setLoading(base / total, step.key)
    try {
      await step.run(p => setLoading((base + step.weight * Math.min(1, Math.max(0, p))) / total, step.key))
    } catch (err) {
      console.warn('[chargement]', step.key, err)
    }
    base += step.weight
  }
  setLoading(1, 'host.loading.done')
  await new Promise(r => setTimeout(r, 450))
  runner.finishLoading()
}
