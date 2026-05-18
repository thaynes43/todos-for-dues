import type { BrowserContext, Page } from '@playwright/test';

/**
 * Authenticate by driving the actual `<form action={signInAction}>` flow on
 * `/login`. Before PLAN-008's nextCookies plugin, this lost the session
 * cookie (Server Actions did not propagate Better Auth's Set-Cookie back to
 * the browser), so PLAN-006 worked around it by POSTing directly to
 * `/api/auth/sign-in/email`. With nextCookies wired in `@app/auth/config`,
 * the form path now persists the session cookie correctly.
 */
export async function signInAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  // Wait for /login to hydrate. On a cold dev server (esp. GHA runners) the
  // form may still be compiling/mounting when goto resolves; without this
  // wait the submit click can race with hydration and silently drop.
  await page.waitForLoadState('load');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.locator('button[type=submit]').click();
  // Successful sign-in redirects to /. If credentials are wrong the form
  // renders an inline error and we'll fail below. 30s tolerates GHA
  // cold-runner compile-lag on the post-redirect homepage.
  await page.waitForURL('**/', { timeout: 30_000 });
}

export async function signOut(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}
