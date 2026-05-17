import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const nextShim = fileURLToPath(
  new URL('./__tests__/integration/_next-shims.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: {
      // The signup action (apps/web/app/signup/actions.ts) imports
      // `next/navigation`'s `redirect`. The @app/auth package doesn't depend
      // on `next`; for the integration test that exercises the action, alias
      // both module IDs to an in-repo shim. See _next-shims.ts.
      'next/navigation': nextShim,
      'next/dist/client/components/redirect-error': nextShim,
    },
  },
  test: {
    pool: 'forks',
    testTimeout: 60_000,
    hookTimeout: 180_000,
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
