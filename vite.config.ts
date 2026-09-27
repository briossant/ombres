import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Trois points d'entrée : l'écran PC (index.html), la manette téléphone (play.html) et la page
// d'accueil des téléphones (m.html, servie à /m). Ni la manette ni l'accueil n'embarquent three.js.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        host: resolve(import.meta.dirname, 'index.html'),
        play: resolve(import.meta.dirname, 'play.html'),
        landing: resolve(import.meta.dirname, 'm.html'),
      },
    },
  },
  assetsInclude: ['**/*.glb', '**/*.gltf'],
})
