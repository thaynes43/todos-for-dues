import { test, expect } from '@playwright/test';
import { createTestPool, getUserByEmail, truncateAll } from '../support/db';
import { mockOidc } from '../support/oauth-mock';

test.describe('PRD-003 AC-01 — SSO sign-in creates Alumni user', () => {
  test('mocked Workspace callback → role=Alumni + lands on /', async ({ page }) => {
    test.fixme(
      true,
      'Deferred to PLAN-008: page.route() intercepts only browser-context requests, but Better Auth fetches OIDC discovery/token/userinfo server-side from the Next.js process. PLAN-008 Step 1 lands a local in-process OIDC mock server + OIDC_DISCOVERY_URL override so this spec can run. HD-restriction + account-linking + signup wiring are already verified by packages/auth/__tests__/integration/.',
    );
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
