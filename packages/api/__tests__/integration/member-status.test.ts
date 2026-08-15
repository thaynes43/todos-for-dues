import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { transitionRole } from '@app/domain';
import { startPortalApiMock, type PortalApiMock } from './_portal-mock';

/**
 * memberStatus router (ADR-015) against the REAL stack: PG16 testcontainer,
 * the real Better Auth `getAccessToken` path (including refresh-on-expiry
 * against the portal mock's token endpoint), and the real portal-client
 * classification.
 *
 * PINNED REGRESSION (backlog 07 ruling): member status is FULLY ORTHOGONAL to
 * roles. Every case here asserts the caller's `users.role` is BYTE-IDENTICAL
 * before and after, and that ZERO `user_role_transitions` rows are written —
 * the router must never touch role. Both the read (page-load GET) and write
 * (PUT) paths are covered.
 *
 * Env ordering: `@app/auth` reads OIDC_* at module load, so `_setup` (which
 * transitively imports it) is loaded DYNAMICALLY after the portal mock is up
 * and the env points at it.
 */

type Setup = typeof import('./_setup');
type TestDb = Awaited<ReturnType<Setup['startTestDb']>>;
type SeedUsers = Awaited<ReturnType<Setup['resetAndSeedUsers']>>;

let portal: PortalApiMock;
let setup: Setup;
let testDb: TestDb;
let seeded: SeedUsers;

beforeAll(async () => {
  portal = await startPortalApiMock();
  process.env.OIDC_CLIENT_ID = 'todos-for-dues';
  process.env.OIDC_CLIENT_SECRET = 'test-portal-client-secret';
  process.env.OIDC_DISCOVERY_URL = portal.discoveryUrl;
  setup = await import('./_setup');
  testDb = await setup.startTestDb();
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
  await portal?.stop();
});

beforeEach(async () => {
  seeded = await setup.resetAndSeedUsers(testDb.pool);
  portal.tokens.clear();
  portal.refreshTokens.clear();
  portal.registry.clear();
  portal.mode = 'on';
  portal.refreshCount = 0;
});

/** Link a sigo-portal account row with stored OAuth tokens (what a real
 * sign-in leaves behind), and register the matching bearer at the mock. */
async function linkPortalAccount(
  userId: string,
  opts: { expired?: boolean; refreshToken?: boolean } = {},
): Promise<{ accessToken: string; refreshToken: string | null }> {
  const accessToken = `at-${userId}`;
  const refreshToken = (opts.refreshToken ?? true) ? `rt-${userId}` : null;
  const expiresAt = new Date(
    Date.now() + (opts.expired ? -60_000 : 60 * 60_000),
  );
  await testDb.pool.query(
    `INSERT INTO "account" (user_id, provider_id, account_id, access_token, refresh_token, access_token_expires_at)
     VALUES ($1::uuid, 'sigo-portal', $1::uuid::text, $2, $3, $4)`,
    [userId, accessToken, refreshToken, expiresAt],
  );
  if (!opts.expired) portal.tokens.set(accessToken, userId);
  if (refreshToken) portal.refreshTokens.set(refreshToken, userId);
  return { accessToken, refreshToken };
}

async function roleAuditCount(userId: string): Promise<number> {
  const { rows } = await testDb.pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM user_role_transitions WHERE user_id = $1`,
    [userId],
  );
  return Number(rows[0]!.n);
}

/** Run `fn` and assert the user's role + role-audit chain are untouched. */
async function expectRoleUntouched<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const before = await setup.getUserRole(testDb.pool, userId);
  const auditBefore = await roleAuditCount(userId);
  const result = await fn();
  expect(await setup.getUserRole(testDb.pool, userId)).toBe(before);
  expect(await roleAuditCount(userId)).toBe(auditBefore);
  return result;
}

describe('memberStatus.get — fresh portal read, ZERO role effect (ADR-015)', () => {
  it('returns the declared status; role byte-identical, no audit rows', async () => {
    await linkPortalAccount(seeded.alumni);
    portal.registry.set(seeded.alumni, 'active');

    const result = await expectRoleUntouched(seeded.alumni, () =>
      setup
        .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Member' }))
        .memberStatus.get(),
    );
    expect(result).toEqual({ kind: 'ok', status: 'active' });
    // The member is a plain Member whether their status is active or alumni.
    expect(await setup.getUserRole(testDb.pool, seeded.alumni)).toBe('Member');
  });

  it('undeclared (null row) → undeclared; role untouched', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, null);
    const result = await expectRoleUntouched(seeded.active1, () =>
      setup
        .caller(setup.makeCtx({ userId: seeded.active1, role: 'Member' }))
        .memberStatus.get(),
    );
    expect(result).toEqual({ kind: 'undeclared', status: null });
  });

  it('no linked registry row → no-registry-row (409 JSON) — control hidden', async () => {
    await linkPortalAccount(seeded.alumni);
    // no registry entry for this user ⇒ mock returns 409 { code: no_registry_row }
    const result = await expectRoleUntouched(seeded.alumni, () =>
      setup
        .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Member' }))
        .memberStatus.get(),
    );
    expect(result).toEqual({ kind: 'no-registry-row', status: null });
  });

  it('portal without the endpoint (route-404 / 501) → unavailable', async () => {
    await linkPortalAccount(seeded.alumni);
    portal.registry.set(seeded.alumni, 'active');
    for (const mode of ['absent', 'not-implemented'] as const) {
      portal.mode = mode;
      const result = await expectRoleUntouched(seeded.alumni, () =>
        setup
          .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Member' }))
          .memberStatus.get(),
      );
      expect(result).toEqual({ kind: 'unavailable', status: null });
    }
  });

  it('no linked portal account at all → unavailable', async () => {
    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Member' }))
      .memberStatus.get();
    expect(result).toEqual({ kind: 'unavailable', status: null });
  });

  it('OWNER SCENARIO — Admin + 409 no-row: control hidden, role stays Admin, zero writes', async () => {
    // The incident: an Admin with no linked registry row opened their dues
    // profile. Nothing may move their role or write to the registry.
    await linkPortalAccount(seeded.admin);
    // no registry row for the admin ⇒ 409
    const result = await expectRoleUntouched(seeded.admin, () =>
      setup
        .caller(setup.makeCtx({ userId: seeded.admin, role: 'Admin' }))
        .memberStatus.get(),
    );
    expect(result).toEqual({ kind: 'no-registry-row', status: null });
    expect(await setup.getUserRole(testDb.pool, seeded.admin)).toBe('Admin');
    expect(portal.registry.has(seeded.admin)).toBe(false);
  });

  it('privileged member with a declared status: status returned, role never moves', async () => {
    await linkPortalAccount(seeded.admin);
    portal.registry.set(seeded.admin, 'active');
    const result = await expectRoleUntouched(seeded.admin, () =>
      setup
        .caller(setup.makeCtx({ userId: seeded.admin, role: 'Admin' }))
        .memberStatus.get(),
    );
    expect(result).toEqual({ kind: 'ok', status: 'active' });
    expect(await setup.getUserRole(testDb.pool, seeded.admin)).toBe('Admin');
  });

  it('refreshes an expired access token via the stored refresh token, then reads', async () => {
    await linkPortalAccount(seeded.alumni, { expired: true });
    portal.registry.set(seeded.alumni, 'alumni');

    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Member' }))
      .memberStatus.get();
    expect(result).toEqual({ kind: 'ok', status: 'alumni' });
    expect(portal.refreshCount).toBe(1);

    const { rows } = await testDb.pool.query<{ access_token: string }>(
      `SELECT access_token FROM "account" WHERE user_id = $1 AND provider_id = 'sigo-portal'`,
      [seeded.alumni],
    );
    expect(rows[0]!.access_token).toContain('at-refreshed-');
  });

  it('rejects without a session — UNAUTHORIZED', async () => {
    await expect(
      setup.caller(setup.unauthedCtx()).memberStatus.get(),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('memberStatus.set — PUT + re-GET, ZERO role effect (ADR-015)', () => {
  it('writes the registry and re-reads; role byte-identical, no audit rows', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, 'active');

    const result = await expectRoleUntouched(seeded.active1, () =>
      setup
        .caller(setup.makeCtx({ userId: seeded.active1, role: 'Member' }))
        .memberStatus.set({ status: 'alumni' }),
    );
    expect(result).toEqual({ kind: 'ok', status: 'alumni' });

    // The registry (the ONLY durable store) holds the new value.
    expect(portal.registry.get(seeded.active1)).toBe('alumni');
    expect(await setup.getUserRole(testDb.pool, seeded.active1)).toBe('Member');
  });

  it('declaring from undeclared works (null row → active); role untouched', async () => {
    await linkPortalAccount(seeded.alumni);
    portal.registry.set(seeded.alumni, null);
    const result = await expectRoleUntouched(seeded.alumni, () =>
      setup
        .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Member' }))
        .memberStatus.set({ status: 'active' }),
    );
    expect(result).toEqual({ kind: 'ok', status: 'active' });
  });

  it('no linked registry row → no-registry-row (409); nothing written anywhere', async () => {
    await linkPortalAccount(seeded.alumni);
    const result = await expectRoleUntouched(seeded.alumni, () =>
      setup
        .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Member' }))
        .memberStatus.set({ status: 'active' }),
    );
    expect(result).toEqual({ kind: 'no-registry-row', status: null });
    expect(portal.registry.has(seeded.alumni)).toBe(false);
  });

  it('portal unavailable → unavailable; registry + role untouched', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, 'active');
    portal.mode = 'absent';
    const result = await expectRoleUntouched(seeded.active1, () =>
      setup
        .caller(setup.makeCtx({ userId: seeded.active1, role: 'Member' }))
        .memberStatus.set({ status: 'alumni' }),
    );
    expect(result).toEqual({ kind: 'unavailable', status: null });
    // absent mode never mutates the registry
    expect(portal.registry.get(seeded.active1)).toBe('active');
  });

  it('privileged members set the roster fact without their role moving', async () => {
    await linkPortalAccount(seeded.moderator);
    portal.registry.set(seeded.moderator, null);
    const result = await expectRoleUntouched(seeded.moderator, () =>
      setup
        .caller(setup.makeCtx({ userId: seeded.moderator, role: 'Moderator' }))
        .memberStatus.set({ status: 'alumni' }),
    );
    expect(result).toEqual({ kind: 'ok', status: 'alumni' });
    expect(portal.registry.get(seeded.moderator)).toBe('alumni');
    expect(await setup.getUserRole(testDb.pool, seeded.moderator)).toBe(
      'Moderator',
    );
  });

  it('rejects values outside the contract enum — BAD_REQUEST from Zod', async () => {
    await linkPortalAccount(seeded.active1);
    const c = setup.caller(
      setup.makeCtx({ userId: seeded.active1, role: 'Member' }),
    );
    await expect(
      // @ts-expect-error — schema enumerates only 'active' | 'alumni'.
      c.memberStatus.set({ status: 'emeritus' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects without a session — UNAUTHORIZED', async () => {
    await expect(
      setup.caller(setup.unauthedCtx()).memberStatus.set({ status: 'active' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('ORTHOGONALITY REGRESSION — a role change never alters status (ADR-015)', () => {
  it('a claim-sync-style role transition leaves the registry status untouched', async () => {
    // The other direction of the pin: role logic (here the actual FSM writer
    // claim-sync uses, `transitionRole`) fires no PUT and cannot disturb the
    // portal registry, so a role change leaves the declared status intact.
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, 'active');

    await transitionRole({
      targetUserId: seeded.active1,
      expectedFromRole: 'Member',
      toRole: 'Moderator',
      initiator: { id: null, kind: 'system' },
    });
    expect(await setup.getUserRole(testDb.pool, seeded.active1)).toBe(
      'Moderator',
    );

    // Status is still exactly what the registry holds — the role move didn't
    // write anything to the portal.
    const read = await setup
      .caller(setup.makeCtx({ userId: seeded.active1, role: 'Moderator' }))
      .memberStatus.get();
    expect(read).toEqual({ kind: 'ok', status: 'active' });
    expect(portal.registry.get(seeded.active1)).toBe('active');
  });
});
