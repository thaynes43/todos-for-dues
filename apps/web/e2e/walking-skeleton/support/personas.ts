import type { BrowserContext, Page } from '@playwright/test';

/**
 * Authenticate by calling Better Auth's REST endpoint and letting Playwright's
 * APIRequestContext capture Set-Cookie headers. The Server Action signin path
 * loses cookies in this configuration (no nextCookies plugin) — calling the
 * REST endpoint directly avoids that.
 */
export async function signInAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const res = await page.request.post('/api/auth/sign-in/email', {
    headers: { 'Content-Type': 'application/json' },
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`signIn failed: ${res.status()} ${await res.text()}`);
  }
}

export async function signOut(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}
