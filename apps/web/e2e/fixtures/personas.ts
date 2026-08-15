import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { readRuntimeEnv } from './runtime-env';
import type { MemberStatusRow, PortalIdentity } from './oidc-mock-server';

// ADR-015: roles are Member | Moderator | Admin (orthogonal to member status).
export type Role = 'Member' | 'Moderator' | 'Admin';
export type PortalTier = 'pending' | 'brother' | 'operator' | 'admin';
export type MemberStatus = 'active' | 'alumni';

/**
 * Legacy-friendly persona role. `'Active'`/`'Alumni'` describe a plain Member
 * whose orthogonal portal STATUS is active/alumni — the shape most specs want
 * (a member who can claim / can post). Real roles pass through. This keeps the
 * many `seedPersona({ role: 'Active' | 'Alumni' })` call sites meaningful under
 * ADR-015 without threading a separate status arg through every spec.
 */
export type PersonaRole = Role | 'Active' | 'Alumni';

export interface Persona {
  email: string;
  displayName: string;
  /** Resolved DB role (Member | Moderator | Admin). */
  role: Role;
  /** Resolved portal member status (null for a bare Member/Moderator/Admin). */
  status: MemberStatus | null;
  tier: PortalTier;
}

/** Resolve a (possibly legacy) persona role into a DB role + portal status. */
export function resolvePersonaRole(role: PersonaRole): {
  dbRole: Role;
  status: MemberStatus | null;
} {
  if (role === 'Active') return { dbRole: 'Member', status: 'active' };
  if (role === 'Alumni') return { dbRole: 'Member', status: 'alumni' };
  return { dbRole: role, status: null };
}

/**
 * ADR-013 / ADR-015 tier ↔ role mapping for seeded personas: elevated app roles
 * come from elevated portal tiers; a plain Member rides on `brother`
 * (regardless of member status — orthogonality).
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
export function newPersona(role: PersonaRole, displayNameSeed: string): Persona {
  const { dbRole, status } = resolvePersonaRole(role);
  return {
    email: `${String(role).toLowerCase()}-${randomUUID()}@chapter.test`,
    displayName: `${displayNameSeed}-${role}`,
    role: dbRole,
    status,
    tier: tierForRole(dbRole),
  };
}

function portalMockBaseUrl(): string {
  return process.env.OIDC_BASE_URL ?? readRuntimeEnv().OIDC_BASE_URL;
}

/**
 * Unsigned id_token (header.payload.sig) carrying the portal claim set.
 * Used to PRE-LINK seeded personas' `sigo-portal` account rows so their
 * first sign-in takes the existing-account path instead of Better Auth's
 * linking path. Two reasons: (a) prod has no linking path at all post-wipe
 * (every prod user is portal-created), so pre-linked is the prod-shaped
 * fixture; (b) concurrent FIRST sign-ins of a shared persona (the global
 * Admin/Moderator under parallel workers) would race linkAccount's unique
 * constraint and bounce one flow to /login?error=….
 * Claim-sync only decodes the payload; sign-ins overwrite it with a
 * freshly-signed token from the mock (updateAccountOnSignIn).
 */
export function unsignedPortalIdToken(claims: {
  sub: string;
  email: string;
  name: string;
  tier: string;
}): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    ...claims,
    email_verified: true,
    capabilities: [],
  })}.e2e-seed`;
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
 * Set a member-status registry row at the portal mock (ADR-014). Rows are
 * auto-created (undeclared) when an identity registers; use this for the
 * contract's edge shapes: `{ status }` declares, `{ hasRow: false }` removes
 * the row (404 JSON), `{ mode: 'absent' }` makes THIS member's
 * /api/member/status calls look route-less (feature-off / fallback path).
 */
export async function setPortalMemberStatus(
  row: { email: string } & Partial<MemberStatusRow>,
): Promise<void> {
  const res = await fetch(`${portalMockBaseUrl()}/_test/member-status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(
      `portal mock member-status set failed (${res.status}): ${await res.text()}`,
    );
  }
}

/** Read a member-status registry row from the portal mock (spec assertions —
 * the registry is the only durable store, so this IS the stored truth). */
export async function getPortalMemberStatus(
  email: string,
): Promise<MemberStatusRow> {
  const res = await fetch(
    `${portalMockBaseUrl()}/_test/member-status?email=${encodeURIComponent(email)}`,
  );
  if (!res.ok) {
    throw new Error(
      `portal mock member-status get failed (${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as MemberStatusRow;
}

/** Fill the mock's members door (static HTML — no hydration race). Identity
 * selection is per-browser-session, so parallel workers can't race each
 * other. */
async function completeMembersDoor(page: Page, email: string): Promise<void> {
  await page.getByTestId('portal-email').fill(email);
  await page.getByTestId('portal-continue').click();
}

/**
 * Kick off the portal SSO flow THROUGH THE /login UI and drive the mock's
 * members door up to the point the browser is redirected back to the app.
 * Does NOT assert the outcome — refusal specs land on /login?error=…, happy
 * paths land signed-in. Use `signInAs` for bulk sign-ins; this UI path is
 * for the specs that assert the login surface itself.
 */
export async function startPortalSignIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  // Wait for /login to hydrate. On a cold dev server (esp. GHA runners) the
  // button may still be mounting when goto resolves; re-click once if the
  // first click was swallowed pre-hydration (repo pattern, cf. enrollAsActive).
  await page.waitForLoadState('load');
  const sso = page.getByTestId('sso-button');
  await sso.click();
  try {
    await page.waitForURL(/\/oauth\/authorize/, { timeout: 10_000 });
  } catch {
    await sso.click();
    await page.waitForURL(/\/oauth\/authorize/, { timeout: 20_000 });
  }
  await completeMembersDoor(page, email);
}

/**
 * Full portal sign-in for a registered identity, waiting for a signed-in
 * landing. Successful sign-in lands on `/` (transient), `/jobs`
 * (Active/Alumni/Admin) or `/moderation-queue` (Moderator).
 *
 * Fast path: starts the OAuth flow via the sign-in API (page.request shares
 * the browser context's cookie jar, so the state cookie persists) instead of
 * loading + hydrating /login for every re-auth — the suite re-auths dozens
 * of times per run and the dev-server page churn was tripping form-hydration
 * timeouts on GHA. The /login UI itself is covered by
 * e2e/auth/portal-sso.spec.ts via `startPortalSignIn`.
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  const res = await page.request.post('/api/auth/sign-in/oauth2', {
    data: {
      providerId: 'sigo-portal',
      callbackURL: '/',
      errorCallbackURL: '/login',
    },
  });
  if (!res.ok()) {
    throw new Error(`sign-in POST failed (${res.status()}): ${await res.text()}`);
  }
  const { url } = (await res.json()) as { url?: string };
  if (!url) throw new Error('sign-in POST returned no authorization url');
  await page.goto(url);
  await completeMembersDoor(page, email);
  await page.waitForURL(/\/(jobs|moderation-queue)?$/, { timeout: 30_000 });
}

/** Clear cookies so the next persona starts unauthenticated. */
export async function logoutAndClear(page: Page): Promise<void> {
  await page.context().clearCookies();
}
