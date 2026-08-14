import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startPortalApiMock, type PortalApiMock } from './_portal-mock';

/**
 * VALIDATION (ADR-014) — repeated back-and-forth cycles through the
 * memberStatus router. The shipped member-status.test.ts proves single
 * transitions; the user requirement is "switch back and forth repeatedly",
 * so this file pins the loop behavior against the REAL stack (PG16
 * testcontainer, real getAccessToken, real transitionRole):
 *
 *  - N alternating `set` flips keep registry, role, and the audit chain in
 *    lockstep (no skipped/duplicated/mis-ordered transitions);
 *  - re-`set`ting the already-declared side is idempotent (the server-side
 *    guard behind the UI's double-click protection);
 *  - `get` after `set` never writes an echo row (the two sync paths don't
 *    fight);
 *  - repeated PORTAL-side registry edits land on successive `get`s, one
 *    system-audited row each, and an unchanged re-`get` stays silent.
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

describe('memberStatus — repeated back-and-forth cycles', () => {
  it('six alternating set flips keep registry, role, and audit chain in lockstep', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, 'active');
    const c = setup.caller(
      setup.makeCtx({ userId: seeded.active1, role: 'Active' }),
    );

    const legs = ['alumni', 'active', 'alumni', 'active', 'alumni', 'active'] as const;
    for (const status of legs) {
      const role = status === 'active' ? 'Active' : 'Alumni';
      const result = await c.memberStatus.set({ status });
      expect(result).toEqual({ kind: 'ok', status, role });
      expect(portal.registry.get(seeded.active1)).toBe(status);
      expect(await setup.getUserRole(testDb.pool, seeded.active1)).toBe(role);
    }

    const audit = await getAuditRows(seeded.active1);
    expect(audit).toHaveLength(legs.length);
    legs.forEach((status, i) => {
      const toRole = status === 'active' ? 'Active' : 'Alumni';
      expect(audit[i]).toMatchObject({
        from_role: toRole === 'Active' ? 'Alumni' : 'Active',
        to_role: toRole,
        initiator_id: seeded.active1,
        initiator_kind: 'user',
      });
      expect(audit[i]!.note).toContain('ADR-014');
    });
  });

  it('re-setting the already-declared side is idempotent (no duplicate audit rows)', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, 'active');
    const c = setup.caller(
      setup.makeCtx({ userId: seeded.active1, role: 'Active' }),
    );

    // Same-side set: registry unchanged, role unchanged, zero audit rows.
    const same = await c.memberStatus.set({ status: 'active' });
    expect(same).toEqual({ kind: 'ok', status: 'active', role: 'Active' });
    expect(await getAuditRows(seeded.active1)).toHaveLength(0);

    // Flip once, then repeat the SAME flip (a server-side double-submit):
    // exactly one transition total.
    await c.memberStatus.set({ status: 'alumni' });
    const repeat = await c.memberStatus.set({ status: 'alumni' });
    expect(repeat).toEqual({ kind: 'ok', status: 'alumni', role: 'Alumni' });
    expect(await getAuditRows(seeded.active1)).toHaveLength(1);
  });

  it('get after set never writes an echo row — the two sync paths agree', async () => {
    await linkPortalAccount(seeded.active1);
    portal.registry.set(seeded.active1, 'active');
    const c = setup.caller(
      setup.makeCtx({ userId: seeded.active1, role: 'Active' }),
    );

    await c.memberStatus.set({ status: 'alumni' });
    expect(await getAuditRows(seeded.active1)).toHaveLength(1);

    const read = await c.memberStatus.get();
    expect(read).toEqual({ kind: 'ok', status: 'alumni', role: 'Alumni' });
    expect(await getAuditRows(seeded.active1)).toHaveLength(1); // no echo

    // And around again — set back, get again, still exactly one row per flip.
    await c.memberStatus.set({ status: 'active' });
    const read2 = await c.memberStatus.get();
    expect(read2).toEqual({ kind: 'ok', status: 'active', role: 'Active' });
    expect(await getAuditRows(seeded.active1)).toHaveLength(2);
  });

  it('repeated portal-side edits land on successive gets, one system row each', async () => {
    await linkPortalAccount(seeded.active1);
    const c = setup.caller(
      setup.makeCtx({ userId: seeded.active1, role: 'Active' }),
    );

    // Portal-side declaration flips, each observed by the next page load.
    portal.registry.set(seeded.active1, 'alumni');
    expect(await c.memberStatus.get()).toEqual({
      kind: 'ok',
      status: 'alumni',
      role: 'Alumni',
    });
    portal.registry.set(seeded.active1, 'active');
    expect(await c.memberStatus.get()).toEqual({
      kind: 'ok',
      status: 'active',
      role: 'Active',
    });

    // Unchanged re-read stays silent.
    expect(await c.memberStatus.get()).toEqual({
      kind: 'ok',
      status: 'active',
      role: 'Active',
    });

    const audit = await getAuditRows(seeded.active1);
    expect(audit).toHaveLength(2);
    for (const row of audit) {
      expect(row.initiator_kind).toBe('system');
      expect(row.initiator_id).toBeNull();
      expect(row.note).toContain('ADR-014');
    }
    expect(audit.map((r) => r.to_role)).toEqual(['Alumni', 'Active']);
  });
});
