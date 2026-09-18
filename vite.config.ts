import { defineConfig } from 'vite';

export default defineConfig({
  root: './src',
  base: './',
  publicDir: './public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'esnext'
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/stream': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 5173,
    host: true,
    proxy: {
      '/api/stream': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
