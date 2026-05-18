import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    target: 'chrome110',
    rollupOptions: {
      input: 'index.html',
      output: {
        format: 'es',
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
      }
    }
  },
  server: {
    port: 5173,
    fs: {
      allow: ['..'],
    },
  },
  resolve: {
    alias: {
      '/assets': path.resolve(__dirname, 'assets'),
    },
  },
})