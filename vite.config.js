import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/emt': {
        target: 'https://openapi.emtmadrid.es',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/emt/, ''),
        secure: true,
      },
      '/api/crtm': {
        target: 'https://www.crtm.es',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/crtm/, ''),
        secure: true,
      },
    },
  },
})
