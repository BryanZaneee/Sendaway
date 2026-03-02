import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.{test,spec}.{js,ts}',
      'supabase/functions/**/*.{test,spec}.{js,ts}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/*.integration.test.*',
    ],
  },
  resolve: {
    alias: {
      '../config/supabase': './src/config/supabase.ts',
    },
  },
});
