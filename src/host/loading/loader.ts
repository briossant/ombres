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

/** Part de l'étape de chauffe atteinte une fois les N premières images rendues (le reste : stabilité). */
const WARMUP_FRAMES_SHARE = 0.8
/** Images consécutives sous 50 ms qui font une scène « stable ». */
const WARMUP_STABLE_FRAMES = 8

/**
 * Attend que la scène ait rendu assez d'images stables (shaders compilés, textures envoyées).
 * Barre honnête (polish G12) : les N premières images mènent l'étape à 80 % (la barre à 95 %),
 * la stabilité fait le reste ; 100 % seulement quand c'est stable, ou au délai limite de 6 s
 * (avant : 100 % dès 30 images, puis jusqu'à 20 s figé sur « 100 % » sur une machine lente).
 */
function warmUp(progress: (p: number) => void, frames = 30, timeoutMs = 6000): Promise<void> {
  return new Promise(resolve => {
    const start = performance.now()
    const from = runner.renderedFrames
    let last = performance.now()
    let stable = 0
    let shown = 0
    const loop = () => {
      const t = performance.now()
      const dt = t - last
      last = t
      const n = runner.renderedFrames - from
      stable = dt < 50 ? stable + 1 : 0
      if ((n >= frames && stable >= WARMUP_STABLE_FRAMES) || t - start > timeoutMs) {
        progress(1)
        resolve()
        return
      }
      // jamais 100 % avant la fin, et jamais en arrière (un accroc remet la stabilité à zéro)
      const p = WARMUP_FRAMES_SHARE * Math.min(1, n / frames) + (n >= frames ? (1 - WARMUP_FRAMES_SHARE) * Math.min(1, stable / WARMUP_STABLE_FRAMES) : 0)
      shown = Math.max(shown, Math.min(0.96, p))
      progress(shown)
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
  // la barre pleine se voit un instant, pas plus (G12 : jamais « 100 % » figé)
  await new Promise(r => setTimeout(r, 250))
  runner.finishLoading()
}
