import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ['__tests__/**/*.test.{ts,tsx}', 'src/templates/__tests__/**/*.test.{ts,tsx}'],
  },
});
