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
    port: 3000,
    host: true
  }
});
