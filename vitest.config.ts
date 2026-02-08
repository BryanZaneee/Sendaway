import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '../config/supabase': './src/config/supabase.ts',
    },
  },
});
