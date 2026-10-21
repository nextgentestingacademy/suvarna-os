import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/e2e/**'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
