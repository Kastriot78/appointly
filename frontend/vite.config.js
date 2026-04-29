import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const apiOrigin =
    env.VITE_API_PROXY_TARGET ||
    (env.VITE_API_URL && String(env.VITE_API_URL).replace(/\/api\/?$/, '')) ||
    'http://localhost:5000'

  return {
    plugins: [react()],
    server: {
      host: "localhost",
      port: 5173,
      strictPort: true,
      hmr: {
        protocol: "ws",
        host: "localhost",
        clientPort: 5173,
      },
      proxy: {
        '/sitemap.xml': { target: apiOrigin, changeOrigin: true },
        '/robots.txt': { target: apiOrigin, changeOrigin: true },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('react-router-dom')
            ) {
              return 'react-vendor'
            }
            if (id.includes('leaflet') || id.includes('react-leaflet')) {
              return 'map-vendor'
            }
            if (id.includes('recharts')) {
              return 'chart-vendor'
            }
            if (id.includes('bootstrap') || id.includes('react-bootstrap')) {
              return 'ui-vendor'
            }
            return 'vendor'
          },
        },
      },
    },
  }
})
