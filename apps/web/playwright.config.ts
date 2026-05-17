import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['__e2e__/**/*.spec.ts', 'e2e/**/*.spec.ts'],
  // `e2e/live/` runs against a deployed instance and requires LIVE_URL — it
  // has its own `playwright.config.live.ts`. Exclude it from the local config
  // so `pnpm --filter web e2e` does not pick it up.
  testIgnore: ['e2e/live/**/*.spec.ts'],
  // Per-test timeout. Default Playwright is 30s; some specs seed many jobs
  // across states (e.g. admin/dashboard) and need more headroom on cold GHA
  // runners. 60s in CI; 30s locally to keep dev-loop tight.
  timeout: process.env.CI ? 60_000 : 30_000,
  // PLAN-008: workers > 1 must pass per VALIDATION-008 §6. Spec-level
  // parallelism is safe because every spec uses UUID-suffixed identifiers
  // (Trap 6) — no spec depends on global "fresh DB" state.
  fullyParallel: true,
  // CI-only retry: GHA cold-runner timing variance occasionally fails a spec
  // even after the prewarm + waitForLoadState('load') + toBeEnabled hardening
  // in support helpers. Real bugs reproduce locally with retries=0 (where the
  // helpers cover the deterministic paths). 1 retry is the minimum to absorb
  // residual GHA jitter without masking real flakes (rerun-and-pass repeatedly
  // would still surface in the Playwright HTML report).
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  // Default expect assertion timeout. Playwright's built-in default is 5s;
  // bumped to 15s so a single first-hit compile-lag spike (esp. on GHA cold
  // runners) doesn't trip a `toBeVisible` / `toBeEnabled`. Specs may still
  // pass `{ timeout: N }` overrides for longer waits where needed.
  expect: { timeout: 15_000 },
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
