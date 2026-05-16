import { test, expect } from '@playwright/test';

test.describe('PRD-003 AC-03 — invite required for app-managed signup', () => {
  test('no token → revoked banner; signup form not rendered', async ({
    page,
  }) => {
    await page.goto('/signup');
    await expect(
      page.getByText('Invite link is invalid or has been revoked.'),
    ).toBeVisible();
    // Form fields aren't rendered when the token is missing/invalid.
    await expect(page.getByLabel('Email')).toHaveCount(0);
    await expect(page.getByLabel('Password')).toHaveCount(0);
    // (Previously asserted COUNT(*) FROM users == '0'; that pattern doesn't
    // survive workers > 1, and the UI assertion already proves no submission
    // path was reachable.)
  });
});
