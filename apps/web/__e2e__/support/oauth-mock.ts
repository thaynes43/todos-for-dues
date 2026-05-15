import type { Page } from '@playwright/test';

const HOSTED_DOMAIN = process.env.OIDC_HOSTED_DOMAIN ?? 'chapter.example.invalid';

/**
 * Stub the Google Workspace OIDC discovery + token + userinfo endpoints so the
 * generic-oauth plugin's callback can complete without real Workspace traffic.
 * Each spec calls `mockOidc(page, {...})` in `test.beforeEach` and Playwright
 * resets routes between tests automatically.
 */
export async function mockOidc(
  page: Page,
  profile: { email: string; name: string; sub?: string; hd?: string | null },
): Promise<void> {
  await page.route('https://accounts.google.com/.well-known/openid-configuration', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        issuer: 'https://accounts.google.com',
        authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        token_endpoint: 'https://oauth2.googleapis.com/token',
        userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
        jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
      }),
    });
  });

  await page.route('https://oauth2.googleapis.com/token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-access-token',
        id_token: 'fake-id-token',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });
  });

  await page.route('https://openidconnect.googleapis.com/v1/userinfo', async (route) => {
    const body: Record<string, unknown> = {
      sub: profile.sub ?? 'oidc-sub-' + profile.email,
      email: profile.email,
      email_verified: true,
      name: profile.name,
    };
    if (profile.hd !== null) {
      body.hd = profile.hd ?? HOSTED_DOMAIN;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}
