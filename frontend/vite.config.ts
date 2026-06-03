import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Dev/preview: same-origin `/api/*` → backend on :4000 (avoids cross-port "Failed to fetch"). */
const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:4000',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, '') || '/',
  },
} as const

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', strictPort: true, proxy: { ...apiProxy } },
  preview: { proxy: { ...apiProxy } },
})
