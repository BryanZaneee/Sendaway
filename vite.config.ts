import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: mode === 'development',
    target: 'ES2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'supabase': ['@supabase/supabase-js'],
        }
      }
    }
  },
  server: {
    port: 3000
  }
}));
