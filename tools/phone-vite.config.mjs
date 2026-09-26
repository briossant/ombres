// Build de la manette seule (play.html), pour tools/phone-e2e.mjs : indépendant de l'état du code PC.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

export default defineConfig({
  root,
  plugins: [react()],
  logLevel: 'warn',
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: { input: { play: resolve(root, 'play.html') } },
  },
})
