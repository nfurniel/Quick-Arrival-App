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
        secure: false,
        timeout: 30000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('[CRTM Proxy] → ', req.url);
            // Sobreescribir Origin y Referer
            proxyReq.setHeader('origin', 'https://www.crtm.es');
            proxyReq.setHeader('referer', 'https://www.crtm.es/');
            proxyReq.setHeader('accept', '*/*');
            // Eliminar cabeceras de seguridad de Chrome que CRTM rechaza
            proxyReq.removeHeader('sec-fetch-mode');
            proxyReq.removeHeader('sec-fetch-site');
            proxyReq.removeHeader('sec-fetch-dest');
            proxyReq.removeHeader('sec-fetch-user');
            proxyReq.removeHeader('sec-ch-ua');
            proxyReq.removeHeader('sec-ch-ua-mobile');
            proxyReq.removeHeader('sec-ch-ua-platform');
            proxyReq.removeHeader('upgrade-insecure-requests');
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('[CRTM Proxy] ← ', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },
})
