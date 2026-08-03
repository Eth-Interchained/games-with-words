import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: {
      '/ws': { target: `ws://localhost:${process.env.PORT ?? 3210}`, ws: true },
      '/health': `http://localhost:${process.env.PORT ?? 3210}`,
    },
  },
});
