import { test } from '@playwright/test';

test.describe('ADR-002 + ADR-011 — BOOTSTRAP_ADMIN_EMAIL end-to-end', () => {
  test('sign in once with matching email → Admin role + system audit row', async () => {
    test.skip(
      true,
      [
        'Skipped under PLAN-008 infra: globalSetup pre-seeds the BOOTSTRAP_ADMIN_EMAIL',
        'user as Admin (so the chained walking-skeleton spec can sign in as Admin via',
        'the standard form). This makes the original "sign up THEN bootstrap-promote"',
        'browser flow non-reproducible without env-mutation Playwright cannot safely',
        'do per spec. Equivalent coverage:',
        '  - packages/auth/__tests__/hooks/bootstrap-admin.test.ts (unit)',
        '  - packages/auth/__tests__/integration/signup-flow.test.ts (integration)',
        '  - apps/web/e2e/walking-skeleton.spec.ts (Admin sign-in fires the hook idempotently)',
      ].join(' '),
    );
  });
});
