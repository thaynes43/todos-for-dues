import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['__e2e__/**/*.spec.ts', 'e2e/**/*.spec.ts'],
  // PLAN-008: workers > 1 must pass per VALIDATION-008 §6. Spec-level
  // parallelism is safe because every spec uses UUID-suffixed identifiers
  // (Trap 6) — no spec depends on global "fresh DB" state.
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  // Playwright's `webServer` plugin starts BEFORE globalSetup (see runner's
  // createGlobalSetupTasks ordering), so a webServer block would launch
  // `next dev` with a stale env — DATABASE_URL would not point at the
  // testcontainer that globalSetup boots. We manage the dev server inside
  // globalSetup / globalTeardown instead.
  globalSetup: './e2e/fixtures/global-setup.ts',
  globalTeardown: './e2e/fixtures/global-teardown.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
