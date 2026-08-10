import { test, expect, type Page } from '@playwright/test';

/**
 * Read-only smoke against a deployed instance.
 *
 * TRAP (PLAN-013 Track C): MUST NOT mutate live state. No signIn, no form
 * submits, no state-machine moves. Anonymous-user surface only.
 *
 * `installPageerrorListener` is inlined here (rather than imported from
 * `../mvp/support`) so the live spec does NOT pull in `pg` or the
 * `@app/db` Proxy transitively — those are seed/DB helpers irrelevant
 * to anonymous browsing.
 */
function installPageerrorListener(page: Page): Error[] {
  const errors: Error[] = [];
  page.on('pageerror', (err) => errors.push(err));
  return errors;
}

test.describe('live smoke (read-only)', () => {
  test('homepage loads without page errors', async ({ page }) => {
    const errors = installPageerrorListener(page);
    const response = await page.goto('/');
    expect(response?.ok()).toBe(true);
    expect(errors, errors.map((e) => e.message).join('\n')).toEqual([]);
  });

  test('login page renders; SSO button is feature-detected', async ({ page }) => {
    const errors = installPageerrorListener(page);
    const response = await page.goto('/login');
    expect(response?.ok()).toBe(true);
    // SSO button visibility is env-dependent (OIDC_CLIENT_ID + secret +
    // discovery URL must all be set per `packages/auth`, ADR-013). We record
    // presence as an annotation rather than asserting on it.
    const ssoButton = page.getByTestId('sso-button');
    const visible = await ssoButton.isVisible().catch(() => false);
    test.info().annotations.push({ type: 'sso', description: `visible=${visible}` });
    expect(errors, errors.map((e) => e.message).join('\n')).toEqual([]);
  });

  test('/api/health returns 200 + status=ok + db=true', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe(true);
  });
});
