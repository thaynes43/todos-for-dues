import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startPortalApiMock, type PortalApiMock } from './_portal-mock';

/**
 * VALIDATION (ADR-015) — repeated back-and-forth cycles through the
 * memberStatus router. The user requirement is "switch back and forth
 * repeatedly", so this file pins the loop behavior against the REAL stack
 * (PG16 testcontainer, real getAccessToken):
 *
 *  - N alternating `set` flips keep the REGISTRY (the only durable store) in
 *    lockstep while the app ROLE stays byte-identical and ZERO
 *    user_role_transitions rows are ever written — status is orthogonal;
 *  - re-`set`ting the already-declared side is idempotent;
 *  - `get` after `set` never writes a role row (the read path is inert);
 *  - repeated PORTAL-side registry edits land on successive `get`s with the
 *    role untouched throughout.
 *
 * Env ordering: `@app/auth` reads OIDC_* at module load, so `_setup` is
 * imported dynamically after the portal mock is up (same pattern as
 * member-status.test.ts).
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

async function linkPortalAccount(userId: string): Promise<void> {
  const accessToken = `at-${userId}`;
  await testDb.pool.query(
    `INSERT INTO "account" (user_id, provider_id, account_id, access_token, refresh_token, access_token_expires_at)
     VALUES ($1::uuid, 'sigo-portal', $1::uuid::text, $2, $3, $4)`,
    [userId, accessToken, `rt-${userId}`, new Date(Date.now() + 60 * 60_000)],
  );
  portal.tokens.set(accessToken, userId);
  portal.refreshTokens.set(`rt-${userId}`, userId);
}

async function roleAuditCount(userId: string): Promise<number> {
  const { rows } = await testDb.pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM user_role_transitions WHERE user_id = $1`,
    [userId],
  );
  return Number(rows[0]!.n);
}

describe('memberStatus — repeated back-and-forth cycles keep role orthogonal', () => {
  it('six alternating set flips move the registry only; role constant, zero role rows', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, 'active');
    const c = setup.caller(
      setup.makeCtx({ userId: seeded.active1, role: 'Member' }),
    );

    const legs = ['alumni', 'active', 'alumni', 'active', 'alumni', 'active'] as const;
    for (const status of legs) {
      const result = await c.memberStatus.set({ status });
      expect(result).toEqual({ kind: 'ok', status });
      expect(portal.registry.get(seeded.active1)).toBe(status);
      // Role never moves, no matter how the status swings.
      expect(await setup.getUserRole(testDb.pool, seeded.active1)).toBe('Member');
    }

    // Not a single role transition across all six flips.
    expect(await roleAuditCount(seeded.active1)).toBe(0);
  });

  it('re-setting the already-declared side is idempotent (registry stable, no role rows)', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, 'active');
    const c = setup.caller(
      setup.makeCtx({ userId: seeded.active1, role: 'Member' }),
    );

    const same = await c.memberStatus.set({ status: 'active' });
    expect(same).toEqual({ kind: 'ok', status: 'active' });

    await c.memberStatus.set({ status: 'alumni' });
    const repeat = await c.memberStatus.set({ status: 'alumni' });
    expect(repeat).toEqual({ kind: 'ok', status: 'alumni' });
    expect(portal.registry.get(seeded.active1)).toBe('alumni');
    expect(await roleAuditCount(seeded.active1)).toBe(0);
  });

  it('get after set is inert — the read path writes no role row', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, 'active');
    const c = setup.caller(
      setup.makeCtx({ userId: seeded.active1, role: 'Member' }),
    );

    await c.memberStatus.set({ status: 'alumni' });
    const read = await c.memberStatus.get();
    expect(read).toEqual({ kind: 'ok', status: 'alumni' });

    await c.memberStatus.set({ status: 'active' });
    const read2 = await c.memberStatus.get();
    expect(read2).toEqual({ kind: 'ok', status: 'active' });

    expect(await roleAuditCount(seeded.active1)).toBe(0);
    expect(await setup.getUserRole(testDb.pool, seeded.active1)).toBe('Member');
  });

  it('repeated portal-side edits land on successive gets; role untouched throughout', async () => {
    await linkPortalAccount(seeded.active1);
    const c = setup.caller(
      setup.makeCtx({ userId: seeded.active1, role: 'Member' }),
    );

    portal.registry.set(seeded.active1, 'alumni');
    expect(await c.memberStatus.get()).toEqual({ kind: 'ok', status: 'alumni' });
    portal.registry.set(seeded.active1, 'active');
    expect(await c.memberStatus.get()).toEqual({ kind: 'ok', status: 'active' });
    expect(await c.memberStatus.get()).toEqual({ kind: 'ok', status: 'active' });

    expect(await roleAuditCount(seeded.active1)).toBe(0);
    expect(await setup.getUserRole(testDb.pool, seeded.active1)).toBe('Member');
  });
});
