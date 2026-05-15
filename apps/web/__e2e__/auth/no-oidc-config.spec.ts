import { test, expect } from '@playwright/test';

test.describe('PRD-003 AC-05 — no OIDC env → no SSO button', () => {
  test('SSO button absent on /login when OIDC env vars are unset', async ({ page }) => {
    test.skip(
      Boolean(process.env.OIDC_CLIENT_ID && process.env.OIDC_HOSTED_DOMAIN),
      'Spec requires OIDC env unset; skip when dev server has OIDC configured.',
    );
    await page.goto('/login');
    await expect(page.getByTestId('sso-button')).toHaveCount(0);
  });
});
