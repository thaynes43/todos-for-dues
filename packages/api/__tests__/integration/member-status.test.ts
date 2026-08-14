import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startPortalApiMock, type PortalApiMock } from './_portal-mock';

/**
 * memberStatus router (ADR-014) against the REAL stack: PG16 testcontainer,
 * the real Better Auth `getAccessToken` path (including refresh-on-expiry
 * against the portal mock's token endpoint), the real portal-client
 * classification, and the real `transitionRole` audit writes.
 *
 * Env ordering: `@app/auth` reads OIDC_* at module load, so `_setup` (which
 * transitively imports it) is loaded DYNAMICALLY after the portal mock is up
 * and the env points at it — top-level imports would freeze an empty config
 * and the genericOAuth provider (which backs getAccessToken) would never
 * register.
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

async function getAuditRows(userId: string) {
  const { rows } = await testDb.pool.query<{
    from_role: string;
    to_role: string;
    initiator_id: string | null;
    initiator_kind: string;
    note: string | null;
  }>(
    `SELECT from_role, to_role, initiator_id, initiator_kind, note
       FROM user_role_transitions WHERE user_id = $1 ORDER BY created_at, ctid`,
    [userId],
  );
  return rows;
}

describe('memberStatus.get — fresh portal read + role projection', () => {
  it('returns the declared status and syncs a diverged Active/Alumni role (system-audited)', async () => {
    await linkPortalAccount(seeded.alumni);
    portal.registry.set(seeded.alumni, 'active');

    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Alumni' }))
      .memberStatus.get();
    expect(result).toEqual({ kind: 'ok', status: 'active', role: 'Active' });

    expect(await setup.getUserRole(testDb.pool, seeded.alumni)).toBe('Active');
    const audit = await getAuditRows(seeded.alumni);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      from_role: 'Alumni',
      to_role: 'Active',
      initiator_kind: 'system',
      initiator_id: null,
    });
    expect(audit[0]!.note).toContain('ADR-014');
  });

  it('matching status is a read-only no-op (no audit noise)', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, 'active');
    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.active1, role: 'Active' }))
      .memberStatus.get();
    expect(result).toEqual({ kind: 'ok', status: 'active', role: 'Active' });
    expect(await getAuditRows(seeded.active1)).toHaveLength(0);
  });

  it('undeclared (null row) leaves the role alone', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, null);
    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.active1, role: 'Active' }))
      .memberStatus.get();
    expect(result).toEqual({ kind: 'undeclared', status: null, role: 'Active' });
    expect(await getAuditRows(seeded.active1)).toHaveLength(0);
  });

  it('no linked registry row → no-registry-row (route exists, JSON 404)', async () => {
    await linkPortalAccount(seeded.alumni);
    // no registry entry for this user
    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Alumni' }))
      .memberStatus.get();
    expect(result).toEqual({
      kind: 'no-registry-row',
      status: null,
      role: 'Alumni',
    });
  });

  it('portal without the endpoint (route-404 / 501) → unavailable, nothing moves', async () => {
    await linkPortalAccount(seeded.alumni);
    portal.registry.set(seeded.alumni, 'active');

    for (const mode of ['absent', 'not-implemented'] as const) {
      portal.mode = mode;
      const result = await setup
        .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Alumni' }))
        .memberStatus.get();
      expect(result).toEqual({ kind: 'unavailable', status: null, role: 'Alumni' });
    }
    expect(await getAuditRows(seeded.alumni)).toHaveLength(0);
  });

  it('no linked portal account at all → unavailable', async () => {
    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Alumni' }))
      .memberStatus.get();
    expect(result).toEqual({ kind: 'unavailable', status: null, role: 'Alumni' });
  });

  it('NEVER re-roles privileged users — status is a roster fact for them', async () => {
    await linkPortalAccount(seeded.admin);
    portal.registry.set(seeded.admin, 'active');
    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.admin, role: 'Admin' }))
      .memberStatus.get();
    expect(result).toEqual({ kind: 'ok', status: 'active', role: 'Admin' });
    expect(await setup.getUserRole(testDb.pool, seeded.admin)).toBe('Admin');
    expect(await getAuditRows(seeded.admin)).toHaveLength(0);
  });

  it('refreshes an expired access token via the stored refresh token, then reads', async () => {
    await linkPortalAccount(seeded.alumni, { expired: true });
    portal.registry.set(seeded.alumni, 'alumni');

    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Alumni' }))
      .memberStatus.get();
    expect(result).toEqual({ kind: 'ok', status: 'alumni', role: 'Alumni' });
    expect(portal.refreshCount).toBe(1);

    // Better Auth persisted the refreshed token on the account row.
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

describe('memberStatus.set — PUT + re-GET + role sync', () => {
  it('writes the registry, re-reads, and syncs the role with the user as initiator', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, 'active');

    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.active1, role: 'Active' }))
      .memberStatus.set({ status: 'alumni' });
    expect(result).toEqual({ kind: 'ok', status: 'alumni', role: 'Alumni' });

    // The registry (the ONLY durable store) holds the new value.
    expect(portal.registry.get(seeded.active1)).toBe('alumni');
    expect(await setup.getUserRole(testDb.pool, seeded.active1)).toBe('Alumni');
    const audit = await getAuditRows(seeded.active1);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      from_role: 'Active',
      to_role: 'Alumni',
      initiator_kind: 'user',
      initiator_id: seeded.active1,
    });
  });

  it('declaring from undeclared works (null row → active)', async () => {
    await linkPortalAccount(seeded.alumni);
    portal.registry.set(seeded.alumni, null);
    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Alumni' }))
      .memberStatus.set({ status: 'active' });
    expect(result).toEqual({ kind: 'ok', status: 'active', role: 'Active' });
  });

  it('no linked registry row → no-registry-row; nothing written anywhere', async () => {
    await linkPortalAccount(seeded.alumni);
    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.alumni, role: 'Alumni' }))
      .memberStatus.set({ status: 'active' });
    expect(result).toEqual({
      kind: 'no-registry-row',
      status: null,
      role: 'Alumni',
    });
    expect(portal.registry.has(seeded.alumni)).toBe(false);
    expect(await getAuditRows(seeded.alumni)).toHaveLength(0);
  });

  it('portal unavailable → unavailable; role untouched', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, 'active');
    portal.mode = 'absent';
    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.active1, role: 'Active' }))
      .memberStatus.set({ status: 'alumni' });
    expect(result).toEqual({ kind: 'unavailable', status: null, role: 'Active' });
  });

  it('privileged users can set the roster fact without their role moving', async () => {
    await linkPortalAccount(seeded.moderator);
    portal.registry.set(seeded.moderator, null);
    const result = await setup
      .caller(setup.makeCtx({ userId: seeded.moderator, role: 'Moderator' }))
      .memberStatus.set({ status: 'alumni' });
    expect(result).toEqual({ kind: 'ok', status: 'alumni', role: 'Moderator' });
    expect(portal.registry.get(seeded.moderator)).toBe('alumni');
    expect(await getAuditRows(seeded.moderator)).toHaveLength(0);
  });

  it('rejects values outside the contract enum — BAD_REQUEST from Zod', async () => {
    await linkPortalAccount(seeded.active1);
    const c = setup.caller(
      setup.makeCtx({ userId: seeded.active1, role: 'Active' }),
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
