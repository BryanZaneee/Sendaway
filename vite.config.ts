import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: mode === 'development',
    target: 'ES2020',
    rollupOptions: {
      output: {
        // vite 8 (rolldown) requires the function form, not the object shorthand
        manualChunks(id) {
          if (id.includes('@supabase/supabase-js')) return 'supabase';
        }
      }
    }
  },
  server: {
    port: 3000
  }
}));
