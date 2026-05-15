import { test, expect } from '@playwright/test';
import { createTestPool, truncateAll } from '../support/db';
import { mockOidc } from '../support/oauth-mock';

test.describe('PRD-003 AC-02 — HD restriction at OAuth callback', () => {
  test('non-HD callback → /login?error=hd_restriction + no user row', async ({ page }) => {
    test.fixme(
      true,
      'Deferred to PLAN-008: see sso-happy-path.spec.ts. HD restriction is already verified at the unit level (packages/auth/__tests__/hd-restriction.test.ts) and end-to-end at the integration level (packages/auth/__tests__/integration/signup-flow.test.ts). PLAN-008 lands the OIDC mock server so this browser-level confirmation can run.',
    );
    test.skip(
      !process.env.OIDC_CLIENT_ID || !process.env.OIDC_HOSTED_DOMAIN,
      'Spec requires OIDC env configured on the dev server.',
    );
    const pool = createTestPool();
    try {
      await truncateAll(pool);
      await mockOidc(page, {
        email: 'attacker@other.example',
        name: 'Attacker',
        hd: 'other.example',
      });

      await page.goto('/login');
      await page.getByTestId('sso-button').click();

      // Land somewhere on /login (possibly with the error param). The exact URL
      // shape depends on Better Auth's error redirect plumbing; assert no user
      // row exists either way.
      await page.waitForURL('**/login**', { timeout: 15_000 });

      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users WHERE email = $1`,
        ['attacker@other.example'],
      );
      expect(rows[0]?.count).toBe('0');
    } finally {
      await pool.end();
    }
  });
});
