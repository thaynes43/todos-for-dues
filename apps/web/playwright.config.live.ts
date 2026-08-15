import { defineConfig } from '@playwright/test';

const LIVE_URL = process.env.LIVE_URL;
if (!LIVE_URL) {
  throw new Error(
    'LIVE_URL must be set to run live-smoke tests (e.g. LIVE_URL=https://dues.sigoalumni.org).',
  );
}

/**
 * Live-smoke config — runs read-only Playwright specs against a deployed
 * instance. Distinct from `playwright.config.ts` in three load-bearing ways:
 *
 *  1. No `webServer` block — we don't spawn `next dev`; we hit a real URL.
 *  2. No `globalSetup` / `globalTeardown` — no Testcontainer, no DB seeding.
 *     The live specs MUST NOT import `@app/db` or `pg` (data is precious).
 *  3. `fullyParallel: false` — anonymous flow only; serial keeps logs readable.
 *
 * Invoke via `LIVE_URL=https://… pnpm --filter web e2e:live`.
 */
export default defineConfig({
  testDir: './e2e/live',
  testMatch: ['**/*.spec.ts'],
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: LIVE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium' }],
});
