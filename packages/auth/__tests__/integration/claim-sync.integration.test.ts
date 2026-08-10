import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  refuseNonMemberUserCreate,
  syncPortalClaimsOnSessionCreate,
  syncRoleFromPortalTier,
} from '../../src';
import {
  getRoleAuditRows,
  getUserRoleByEmail,
  startAuthTestDb,
  truncateAll,
  type AuthTestDb,
} from './_db';

let testDb: AuthTestDb;

beforeAll(async () => {
  testDb = await startAuthTestDb();
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  await truncateAll(testDb.pool);
});

/** Unsigned JWT with the given payload — decodeJwtClaims never verifies, and
 * in prod the id_token arrives over the confidential token-endpoint channel. */
function fakeIdToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

async function insertUser(
  pool: Pool,
  opts: { email: string; role: string },
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, role, email_verified)
     VALUES ($1, $2, $3, true) RETURNING id`,
    [opts.email, `User ${opts.role}`, opts.role],
  );
  return rows[0]!.id;
}

async function insertPortalAccount(
  pool: Pool,
  opts: { userId: string; tier?: string | null; providerId?: string },
): Promise<void> {
  const idToken =
    opts.tier === null
      ? fakeIdToken({ sub: opts.userId, email: 'x@sigo.test' })
      : fakeIdToken({
          sub: opts.userId,
          email: 'x@sigo.test',
          name: 'X',
          tier: opts.tier,
          capabilities: [],
        });
  await pool.query(
    `INSERT INTO "account" (user_id, provider_id, account_id, id_token)
     VALUES ($1::uuid, $2, $1::uuid::text, $3)`,
    [opts.userId, opts.providerId ?? 'sigo-portal', idToken],
  );
}

/** An Admin outside the scenario so min-Admin never trips unless a test
 * wants it to. */
async function insertBackstopAdmin(pool: Pool): Promise<string> {
  return insertUser(pool, { email: 'backstop-admin@sigo.test', role: 'Admin' });
}

describe('syncRoleFromPortalTier (ADR-013 claim sync)', () => {
  it('skips users with no portal account (nothing to sync from)', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'nolink@sigo.test',
      role: 'Alumni',
    });
    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({
      kind: 'skipped',
      reason: 'no-portal-tier',
    });
  });

  it('skips when the id_token has no tier claim (fail-open sync, logged)', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'notier@sigo.test',
      role: 'Alumni',
    });
    await insertPortalAccount(testDb.pool, { userId: id, tier: null });
    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({
      kind: 'skipped',
      reason: 'no-portal-tier',
    });
  });

  it('brother tier leaves Alumni AND app-granted Active untouched (no audit rows)', async () => {
    await insertBackstopAdmin(testDb.pool);
    const alumni = await insertUser(testDb.pool, {
      email: 'alumni@sigo.test',
      role: 'Alumni',
    });
    const active = await insertUser(testDb.pool, {
      email: 'active@sigo.test',
      role: 'Active',
    });
    await insertPortalAccount(testDb.pool, { userId: alumni, tier: 'brother' });
    await insertPortalAccount(testDb.pool, { userId: active, tier: 'brother' });

    await expect(syncRoleFromPortalTier(alumni)).resolves.toEqual({
      kind: 'unchanged',
      role: 'Alumni',
    });
    await expect(syncRoleFromPortalTier(active)).resolves.toEqual({
      kind: 'unchanged',
      role: 'Active',
    });
    expect(await getRoleAuditRows(testDb.pool, alumni)).toHaveLength(0);
    expect(await getRoleAuditRows(testDb.pool, active)).toHaveLength(0);
  });

  it('operator tier promotes Alumni → Moderator through the audited FSM path', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'operator@sigo.test',
      role: 'Alumni',
    });
    await insertPortalAccount(testDb.pool, { userId: id, tier: 'operator' });

    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({
      kind: 'synced',
      from: 'Alumni',
      to: 'Moderator',
      fallback: false,
    });
    expect(await getUserRoleByEmail(testDb.pool, 'operator@sigo.test')).toBe(
      'Moderator',
    );
    const audit = await getRoleAuditRows(testDb.pool, id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      fromRole: 'Alumni',
      toRole: 'Moderator',
      initiatorKind: 'system',
      initiatorId: null,
    });
    expect(audit[0]!.note).toContain('portal claim-sync');
  });

  it('admin tier promotes to Admin; a later brother tier demotes to Alumni', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'updown@sigo.test',
      role: 'Alumni',
    });
    await insertPortalAccount(testDb.pool, { userId: id, tier: 'admin' });
    await expect(syncRoleFromPortalTier(id)).resolves.toMatchObject({
      kind: 'synced',
      to: 'Admin',
    });

    // Tier drops at the portal → next sign-in stores a brother id_token.
    await testDb.pool.query(`DELETE FROM "account" WHERE user_id = $1::uuid`, [id]);
    await insertPortalAccount(testDb.pool, { userId: id, tier: 'brother' });
    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({
      kind: 'synced',
      from: 'Admin',
      to: 'Alumni',
      fallback: false,
    });
  });

  it('min-Admin guard: demoting the last Admin is kept-as-is, sign-in survives', async () => {
    // The ONLY Admin in the chapter — tier says brother (stale/demoted).
    const id = await insertUser(testDb.pool, {
      email: 'last-admin@sigo.test',
      role: 'Admin',
    });
    await insertPortalAccount(testDb.pool, { userId: id, tier: 'brother' });

    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({
      kind: 'blocked-min-admin',
      role: 'Admin',
    });
    // Role untouched, no half-written audit rows (aborted at COMMIT).
    expect(await getUserRoleByEmail(testDb.pool, 'last-admin@sigo.test')).toBe(
      'Admin',
    );
    expect(await getRoleAuditRows(testDb.pool, id)).toHaveLength(0);
  });

  it('pending tier refuses the session (MEMBERSHIP_PENDING)', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'pending@sigo.test',
      role: 'Alumni',
    });
    await insertPortalAccount(testDb.pool, { userId: id, tier: 'pending' });

    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({ kind: 'refused' });
    await expect(
      syncPortalClaimsOnSessionCreate({ userId: id }),
    ).rejects.toMatchObject({
      body: { code: 'MEMBERSHIP_PENDING' },
    });
  });

  it('ignores accounts from other providers', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'other-provider@sigo.test',
      role: 'Alumni',
    });
    await insertPortalAccount(testDb.pool, {
      userId: id,
      tier: 'admin',
      providerId: 'google-workspace',
    });
    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({
      kind: 'skipped',
      reason: 'no-portal-tier',
    });
  });
});

describe('refuseNonMemberUserCreate (pending never gets a user row)', () => {
  it('throws MEMBERSHIP_PENDING for the refused sentinel and unknown roles', () => {
    expect(() => refuseNonMemberUserCreate({ role: 'refused' })).toThrowError(
      /membership pending/,
    );
    expect(() => refuseNonMemberUserCreate({ role: undefined })).toThrowError(
      /membership pending/,
    );
    expect(() => refuseNonMemberUserCreate({ role: 'Superuser' })).toThrowError(
      /membership pending/,
    );
  });

  it('passes real app roles through', () => {
    expect(() => refuseNonMemberUserCreate({ role: 'Alumni' })).not.toThrow();
    expect(() => refuseNonMemberUserCreate({ role: 'Admin' })).not.toThrow();
  });
});
