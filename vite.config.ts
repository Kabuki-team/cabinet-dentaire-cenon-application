import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Required for Tauri: relative asset paths so the built index.html
  // works when loaded from tauri://localhost
  base: './',

  build: {
    outDir: 'dist',
    // ES2022 is supported by WebView2 (Chromium 109+) and WebKit 16+
    target: 'es2022',
    rollupOptions: {
      output: {
        // Keep sql.js in its own chunk — it manages its own WASM loading
        manualChunks(id) {
          if (id.includes('sql.js')) return 'sql-js';
        },
      },
    },
  },

  server: {
    port: 5173,
    // Prevent Vite from jumping to 5174 if 5173 is busy (breaks Tauri dev URL)
    strictPort: true,
    // Proxy /api to the local backend so the frontend can use relative URLs
    // and avoid CORS in dev. Override the target via VITE_API_PROXY_TARGET if needed.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3456',
        changeOrigin: false,
      },
    },
  },

})
