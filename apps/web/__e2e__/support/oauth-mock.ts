import { readRuntimeEnv } from '../../e2e/fixtures/runtime-env';

/**
 * Seed the in-process OIDC mock server (apps/web/e2e/fixtures/oidc-mock-server.ts,
 * started in globalSetup) with the profile it should return on the next
 * sign-in. Replaces the old `page.route()` approach, which only intercepted
 * browser-context requests — Better Auth's discovery / token / userinfo calls
 * are server-side and bypass `page.route()` entirely (PLAN-004's surfaced
 * blocker; PLAN-008 Step 3.5 fix).
 */
export interface MockOidcProfileInput {
  email: string;
  name: string;
  /**
   * Hosted-domain claim. Pass `null` to omit it (exercises HD-restriction's
   * "missing hd" path). Default: the BOOTSTRAP-seeded OIDC_HOSTED_DOMAIN.
   */
  hd?: string | null;
  sub?: string;
}

export async function seedOidcProfile(
  profile: MockOidcProfileInput,
): Promise<void> {
  const { OIDC_BASE_URL, OIDC_HOSTED_DOMAIN } = readRuntimeEnv();
  const body: Record<string, unknown> = {
    email: profile.email,
    name: profile.name,
  };
  if (profile.hd === null) {
    body.hd = null;
  } else {
    body.hd = profile.hd ?? OIDC_HOSTED_DOMAIN;
  }
  if (profile.sub) body.sub = profile.sub;

  const res = await fetch(`${OIDC_BASE_URL}/_test/profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to seed OIDC mock profile: ${res.status} ${await res.text()}`,
    );
  }
}

export async function resetOidcMock(): Promise<void> {
  const { OIDC_BASE_URL } = readRuntimeEnv();
  await fetch(`${OIDC_BASE_URL}/_test/reset`, { method: 'POST' });
}
