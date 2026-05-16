import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Page } from '@playwright/test';

export type Role = 'Active' | 'Alumni' | 'Moderator' | 'Admin';

export interface Persona {
  email: string;
  password: string;
  displayName: string;
  role: Role;
}

const DEFAULT_PASSWORD = 'walking-skeleton-test';

/**
 * Per-test persona blueprints. Each one carries a fresh UUID-suffixed email
 * so reruns and parallel workers can never collide (PLAN-008 Trap 6).
 */
export function newPersona(role: Role, displayNameSeed: string): Persona {
  return {
    email: `${role.toLowerCase()}-${randomUUID()}@chapter.test`,
    password: DEFAULT_PASSWORD,
    displayName: `${displayNameSeed}-${role}`,
    role,
  };
}

/** Drive the real `<form action={signInAction}>` flow. */
export async function loginViaForm(
  page: Page,
  creds: { email: string; password: string },
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.locator('button[type=submit]').click();
  // Login redirects to `/`; for authenticated users `/` then server-redirects
  // to `/jobs` (or `/moderation-queue` for Moderators). Wait for any URL
  // that isn't `/login`.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  });
}

/** Sign up a new credential user via the invite-token form flow. */
export async function signupViaInvite(
  page: Page,
  opts: { token: string; persona: Persona },
): Promise<void> {
  await page.goto(`/signup?token=${encodeURIComponent(opts.token)}`);
  await page.getByLabel('Email').fill(opts.persona.email);
  await page.getByLabel('Display name').fill(opts.persona.displayName);
  await page.getByLabel('Password').fill(opts.persona.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/signup'), {
    timeout: 15_000,
  });
}

/** Clear cookies + storage so the next persona starts unauthenticated. */
export async function logoutAndClear(page: Page): Promise<void> {
  await page.context().clearCookies();
}

/**
 * Insert an invite token directly. The spec is exercising the UI end-to-end;
 * the Admin's invite-generation flow itself is owned by another PRD/PLAN so
 * we short-circuit it here.
 */
export async function seedInviteToken(
  pool: Pool,
  opts: { preselectedRole: 'Active' | 'Alumni'; createdBy: string },
): Promise<string> {
  const token = `e2e-${randomUUID()}`;
  await pool.query(
    `INSERT INTO invite_tokens (token, preselected_role, created_by) VALUES ($1, $2, $3)`,
    [token, opts.preselectedRole, opts.createdBy],
  );
  return token;
}
