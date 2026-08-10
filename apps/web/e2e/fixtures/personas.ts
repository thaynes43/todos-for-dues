import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { readRuntimeEnv } from './runtime-env';
import type { PortalIdentity } from './oidc-mock-server';

export type Role = 'Active' | 'Alumni' | 'Moderator' | 'Admin';
export type PortalTier = 'pending' | 'brother' | 'operator' | 'admin';

export interface Persona {
  email: string;
  displayName: string;
  role: Role;
  tier: PortalTier;
}

/**
 * ADR-013 tier ↔ role mapping for seeded personas: elevated app roles come
 * from elevated portal tiers; both Alumni AND Active ride on `brother`
 * (Active is app-granted — the portal registry has no actives).
 */
export function tierForRole(role: Role): PortalTier {
  switch (role) {
    case 'Admin':
      return 'admin';
    case 'Moderator':
      return 'operator';
    default:
      return 'brother';
  }
}

/**
 * Per-test persona blueprints. Each one carries a fresh UUID-suffixed email
 * so reruns and parallel workers can never collide (PLAN-008 Trap 6).
 */
export function newPersona(role: Role, displayNameSeed: string): Persona {
  return {
    email: `${role.toLowerCase()}-${randomUUID()}@chapter.test`,
    displayName: `${displayNameSeed}-${role}`,
    role,
    tier: tierForRole(role),
  };
}

function portalMockBaseUrl(): string {
  return process.env.OIDC_BASE_URL ?? readRuntimeEnv().OIDC_BASE_URL;
}

/**
 * Upsert an identity at the portal mock (keyed by email). `tier` is a plain
 * string on the wire so specs can exercise unknown-tier fail-closed paths.
 */
export async function registerPortalIdentity(
  identity: Omit<PortalIdentity, 'tier'> & { tier: string },
): Promise<void> {
  const res = await fetch(`${portalMockBaseUrl()}/_test/identity`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(identity),
  });
  if (!res.ok) {
    throw new Error(
      `portal mock identity registration failed (${res.status}): ${await res.text()}`,
    );
  }
}

/**
 * Kick off the portal SSO flow and drive the mock's members door up to the
 * point the browser is redirected back to the app. Does NOT assert the
 * outcome — refusal specs land on /login?error=…, happy paths land signed-in.
 */
export async function startPortalSignIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  // Wait for /login to hydrate. On a cold dev server (esp. GHA runners) the
  // button may still be mounting when goto resolves.
  await page.waitForLoadState('load');
  const sso = page.getByTestId('sso-button');
  await sso.click();
  // Members door (mock) — identity selection is per-browser-session, so
  // parallel workers can't race each other.
  await page.waitForURL(/\/oauth\/authorize/, { timeout: 30_000 });
  await page.getByTestId('portal-email').fill(email);
  await page.getByTestId('portal-continue').click();
}

/**
 * Full portal sign-in for a registered identity, waiting for a signed-in
 * landing. Successful sign-in lands on `/` (transient), `/jobs`
 * (Active/Alumni/Admin) or `/moderation-queue` (Moderator).
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  await startPortalSignIn(page, email);
  await page.waitForURL(/\/(jobs|moderation-queue)?$/, { timeout: 30_000 });
}

/** Clear cookies so the next persona starts unauthenticated. */
export async function logoutAndClear(page: Page): Promise<void> {
  await page.context().clearCookies();
}
