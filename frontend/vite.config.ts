import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Dev: run Django on :8000 (`python manage.py runserver`); Vite proxies /api to it.
// Build: assets are emitted under /static/ so Django (WhiteNoise) can serve frontend/dist.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/static/' : '/',
  plugins: [vue(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8000' } }
}))
