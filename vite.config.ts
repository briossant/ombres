import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Deux points d'entrée : l'écran PC (index.html) et la manette téléphone (play.html).
// Le bundle téléphone n'embarque ni three.js ni le moteur de rendu.
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
      },
    },
  },
  assetsInclude: ['**/*.glb', '**/*.gltf'],
})
