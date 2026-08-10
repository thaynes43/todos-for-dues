import type { BrowserContext, Page } from '@playwright/test';
import { signInAs as portalSignInAs } from '../../fixtures/personas';

/**
 * Authenticate by driving the real portal SSO flow (ADR-013): /login →
 * "Sign in with sigoalumni.org" → the mock's members door → OAuth callback.
 * The persona's identity must be registered at the portal mock (seedPersona
 * does this).
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  await portalSignInAs(page, email);
}

export async function signOut(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}
