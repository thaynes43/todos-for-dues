import { test, expect } from '@playwright/test';
import { createTestPool, getUserByEmail, truncateAll } from '../support/db';
import { mockOidc } from '../support/oauth-mock';

test.describe('PRD-003 AC-01 — SSO sign-in creates Alumni user', () => {
  test('mocked Workspace callback → role=Alumni + lands on /', async ({ page }) => {
    test.skip(
      !process.env.OIDC_CLIENT_ID || !process.env.OIDC_HOSTED_DOMAIN,
      'Spec requires OIDC env configured on the dev server.',
    );
    const hd = process.env.OIDC_HOSTED_DOMAIN!;
    const email = `sso-newbie@${hd}`;
    const pool = createTestPool();
    try {
      await truncateAll(pool);
      await mockOidc(page, { email, name: 'SSO Newbie', hd });

      await page.goto('/login');
      await page.getByTestId('sso-button').click();
      await page.waitForURL('**/', { timeout: 15_000 });

      const user = await getUserByEmail(pool, email);
      expect(user?.role).toBe('Alumni');
    } finally {
      await pool.end();
    }
  });
});
