import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    // MapLibre incluye su motor y worker en un único módulo de terceros. Se
    // carga únicamente al entrar al mapa 3D; el límite evita tratar ese
    // vendor intencional como si hubiese regresado el bundle inicial.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) {
            return 'vendor-react'
          }
          if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-vendor/')) {
            return 'vendor-charts'
          }
          if (id.includes('/leaflet/') || id.includes('/react-leaflet/')) {
            return 'vendor-map2d'
          }
          if (id.includes('/maplibre-gl/') || id.includes('/react-map-gl/')) {
            return 'vendor-map3d'
          }
          if (id.includes('/@deck.gl/') || id.includes('/@luma.gl/') || id.includes('/@math.gl/')) {
            return 'vendor-deck'
          }
          if (id.includes('/date-fns/')) {
            return 'vendor-dates'
          }

          return undefined
        },
      },
    },
  },
})
