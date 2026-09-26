// Atlas des 12 glyphes de joueurs pour le monde 3D (ART_BIBLE §3.5 : « un même fichier
// sert au DOM et à un atlas 12 × 64 px pour le monde 3D »). On charge l'atlas partagé
// produit par l'agent ui (`public/ui/glyphs-atlas.png`, mêmes formes que le HUD et le
// téléphone) ; en attendant son chargement (ou s'il manque), un atlas de repli est tracé
// au Canvas2D avec le même vocabulaire : croix, vagues, croissant, disque, triangle,
// carré, goutte, étoile, chevron, losange, anneau, éclair.
import * as THREE from 'three'
import { PLAYER_COLORS } from '../../../shared/players.ts'

const CELL = 64

type Draw = (c: CanvasRenderingContext2D) => void

const GLYPHS: Record<string, Draw> = {
  cross: (c) => {
    c.fillRect(24, 8, 16, 48)
    c.fillRect(8, 24, 48, 16)
  },
  waves: (c) => {
    c.lineWidth = 8
    c.lineCap = 'round'
    for (const y of [22, 42]) {
      c.beginPath()
      c.moveTo(8, y)
      c.bezierCurveTo(18, y - 12, 26, y - 12, 32, y)
      c.bezierCurveTo(38, y + 12, 46, y + 12, 56, y)
      c.stroke()
    }
  },
  crescent: (c) => {
    c.beginPath()
    c.arc(32, 32, 25, 0, Math.PI * 2)
    c.fill()
    c.globalCompositeOperation = 'destination-out'
    c.beginPath()
    c.arc(43, 25, 21, 0, Math.PI * 2)
    c.fill()
    c.globalCompositeOperation = 'source-over'
  },
  disc: (c) => {
    c.beginPath()
    c.arc(32, 32, 24, 0, Math.PI * 2)
    c.fill()
  },
  triangle: (c) => {
    c.beginPath()
    c.moveTo(32, 6)
    c.lineTo(58, 54)
    c.lineTo(6, 54)
    c.closePath()
    c.fill()
  },
  square: (c) => c.fillRect(10, 10, 44, 44),
  drop: (c) => {
    c.beginPath()
    c.moveTo(32, 4)
    c.bezierCurveTo(44, 22, 54, 32, 54, 40)
    c.arc(32, 40, 22, 0, Math.PI)
    c.bezierCurveTo(10, 32, 20, 22, 32, 4)
    c.fill()
  },
  star: (c) => {
    c.beginPath()
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? 28 : 12
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      c.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r)
    }
    c.closePath()
    c.fill()
  },
  chevron: (c) => {
    c.beginPath()
    c.moveTo(4, 46)
    c.lineTo(32, 14)
    c.lineTo(60, 46)
    c.lineTo(48, 54)
    c.lineTo(32, 34)
    c.lineTo(16, 54)
    c.closePath()
    c.fill()
  },
  diamond: (c) => {
    c.beginPath()
    c.moveTo(32, 4)
    c.lineTo(58, 32)
    c.lineTo(32, 60)
    c.lineTo(6, 32)
    c.closePath()
    c.fill()
  },
  ring: (c) => {
    c.lineWidth = 11
    c.beginPath()
    c.arc(32, 32, 20, 0, Math.PI * 2)
    c.stroke()
  },
  bolt: (c) => {
    c.beginPath()
    c.moveTo(38, 2)
    c.lineTo(12, 36)
    c.lineTo(30, 36)
    c.lineTo(24, 62)
    c.lineTo(52, 26)
    c.lineTo(34, 26)
    c.closePath()
    c.fill()
  },
}

let atlas: THREE.Texture | null = null

/** Atlas partagé (12 cases de 64 px) ; case i = glyphe de PLAYER_COLORS[i]. */
export function glyphAtlas(): THREE.Texture {
  if (atlas) return atlas
  const canvas = document.createElement('canvas')
  canvas.width = CELL * PLAYER_COLORS.length
  canvas.height = CELL
  const c = canvas.getContext('2d')!
  c.fillStyle = '#fff'
  c.strokeStyle = '#fff'
  PLAYER_COLORS.forEach((p, i) => {
    c.save()
    c.translate(i * CELL, 0)
    c.beginPath()
    c.rect(0, 0, CELL, CELL)
    c.clip()
    ;(GLYPHS[p.glyph] ?? GLYPHS.disc!)(c)
    c.restore()
  })
  const t: THREE.Texture = new THREE.Texture(canvas)
  t.needsUpdate = true
  t.colorSpace = THREE.NoColorSpace
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.name = 'glyph-atlas'
  atlas = t
  // atlas partagé (mêmes glyphes que le HUD) : remplace le repli dès qu'il est chargé
  const img = new Image()
  img.onload = () => {
    if (img.naturalWidth !== CELL * PLAYER_COLORS.length || img.naturalHeight !== CELL) return
    t.image = img
    t.needsUpdate = true
  }
  img.src = `${import.meta.env.BASE_URL}ui/glyphs-atlas.png`
  return t
}

export const GLYPH_COUNT = PLAYER_COLORS.length
