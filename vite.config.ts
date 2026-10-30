import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Three.js alone is about 700 kB, so the lazy-loaded game chunk is
    // always over the default warning size.
    chunkSizeWarningLimit: 900,
  },
})
