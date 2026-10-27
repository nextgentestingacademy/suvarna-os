import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/e2e/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
