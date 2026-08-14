import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { syncRoleFromMemberStatus, syncRoleFromPortalTier } from '../../src';
import {
  getRoleAuditRows,
  startAuthTestDb,
  truncateAll,
  type AuthTestDb,
} from './_db';

/**
 * ADR-014 status → role projection against the real PG trigger stack
 * (min-Admin trigger from migrations 0003/0008 is live in this schema, so
 * the "status never touches privileged roles" guarantee is exercised for
 * real, not against a stub).
 */

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
  opts: { userId: string; tier: string; status?: string | null },
): Promise<void> {
  const claims: Record<string, unknown> = {
    sub: opts.userId,
    email: 'x@sigo.test',
    name: 'X',
    tier: opts.tier,
    capabilities: [],
  };
  if (opts.status !== undefined) claims.status = opts.status;
  await pool.query(
    `INSERT INTO "account" (user_id, provider_id, account_id, id_token)
     VALUES ($1::uuid, 'sigo-portal', $1::uuid::text, $2)`,
    [opts.userId, fakeIdToken(claims)],
  );
}

async function insertBackstopAdmin(pool: Pool): Promise<string> {
  return insertUser(pool, { email: 'backstop-admin@sigo.test', role: 'Admin' });
}

describe('syncRoleFromMemberStatus (ADR-014 — used by the memberStatus tRPC surface)', () => {
  it('projects a declared status onto the Active/Alumni partition with an audit row', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'proj@sigo.test',
      role: 'Alumni',
    });

    await expect(syncRoleFromMemberStatus(id, 'active')).resolves.toEqual({
      kind: 'synced',
      from: 'Alumni',
      to: 'Active',
    });
    await expect(syncRoleFromMemberStatus(id, 'alumni')).resolves.toEqual({
      kind: 'synced',
      from: 'Active',
      to: 'Alumni',
    });

    const audit = await getRoleAuditRows(testDb.pool, id);
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      fromRole: 'Alumni',
      toRole: 'Active',
      initiatorKind: 'system',
      initiatorId: null,
    });
    expect(audit[0]!.note).toContain('portal status-sync');
    expect(audit[0]!.note).toContain('ADR-014');
  });

  it('is a no-op when status already matches the role (no audit noise)', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'match@sigo.test',
      role: 'Active',
    });
    await expect(syncRoleFromMemberStatus(id, 'active')).resolves.toEqual({
      kind: 'unchanged',
      role: 'Active',
    });
    expect(await getRoleAuditRows(testDb.pool, id)).toHaveLength(0);
  });

  it('carries the user initiator when the change is user-driven (memberStatus.set)', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'self@sigo.test',
      role: 'Active',
    });
    await expect(
      syncRoleFromMemberStatus(id, 'alumni', { id, kind: 'user' }),
    ).resolves.toEqual({ kind: 'synced', from: 'Active', to: 'Alumni' });
    const audit = await getRoleAuditRows(testDb.pool, id);
    expect(audit[0]).toMatchObject({
      toRole: 'Alumni',
      initiatorKind: 'user',
      initiatorId: id,
    });
  });

  it('NEVER touches privileged roles — status stays a roster fact for them', async () => {
    await insertBackstopAdmin(testDb.pool);
    const modId = await insertUser(testDb.pool, {
      email: 'mod@sigo.test',
      role: 'Moderator',
    });
    const adminId = await insertUser(testDb.pool, {
      email: 'admin2@sigo.test',
      role: 'Admin',
    });

    await expect(syncRoleFromMemberStatus(modId, 'active')).resolves.toEqual({
      kind: 'skipped',
      reason: 'privileged-role',
    });
    await expect(syncRoleFromMemberStatus(adminId, 'alumni')).resolves.toEqual({
      kind: 'skipped',
      reason: 'privileged-role',
    });
    expect(await getRoleAuditRows(testDb.pool, modId)).toHaveLength(0);
    expect(await getRoleAuditRows(testDb.pool, adminId)).toHaveLength(0);
  });

  it('skips unknown users', async () => {
    await insertBackstopAdmin(testDb.pool);
    await expect(
      syncRoleFromMemberStatus(
        '00000000-0000-0000-0000-000000000000',
        'active',
      ),
    ).resolves.toEqual({ kind: 'skipped', reason: 'no-user-row' });
  });
});

describe('syncRoleFromPortalTier with the ADR-014 status claim (sign-in path)', () => {
  it('brother + status=active moves an Alumni to Active (system-audited)', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'claim-active@sigo.test',
      role: 'Alumni',
    });
    await insertPortalAccount(testDb.pool, {
      userId: id,
      tier: 'brother',
      status: 'active',
    });

    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({
      kind: 'synced',
      from: 'Alumni',
      to: 'Active',
      fallback: false,
    });
    const audit = await getRoleAuditRows(testDb.pool, id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      fromRole: 'Alumni',
      toRole: 'Active',
      initiatorKind: 'system',
    });
    expect(audit[0]!.note).toContain('portal claim-sync');
    expect(audit[0]!.note).toContain('status=active');
  });

  it('brother + status=alumni moves an Active to Alumni', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'claim-alumni@sigo.test',
      role: 'Active',
    });
    await insertPortalAccount(testDb.pool, {
      userId: id,
      tier: 'brother',
      status: 'alumni',
    });
    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({
      kind: 'synced',
      from: 'Active',
      to: 'Alumni',
      fallback: false,
    });
  });

  it('brother + null/absent status keeps pre-status behavior (both roles ride)', async () => {
    await insertBackstopAdmin(testDb.pool);
    const activeId = await insertUser(testDb.pool, {
      email: 'undeclared-active@sigo.test',
      role: 'Active',
    });
    const alumniId = await insertUser(testDb.pool, {
      email: 'undeclared-alumni@sigo.test',
      role: 'Alumni',
    });
    await insertPortalAccount(testDb.pool, {
      userId: activeId,
      tier: 'brother',
      status: null,
    });
    await insertPortalAccount(testDb.pool, { userId: alumniId, tier: 'brother' });

    await expect(syncRoleFromPortalTier(activeId)).resolves.toEqual({
      kind: 'unchanged',
      role: 'Active',
    });
    await expect(syncRoleFromPortalTier(alumniId)).resolves.toEqual({
      kind: 'unchanged',
      role: 'Alumni',
    });
    expect(await getRoleAuditRows(testDb.pool, activeId)).toHaveLength(0);
  });

  it('brother + status matching the current role is a no-op', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'claim-match@sigo.test',
      role: 'Active',
    });
    await insertPortalAccount(testDb.pool, {
      userId: id,
      tier: 'brother',
      status: 'active',
    });
    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({
      kind: 'unchanged',
      role: 'Active',
    });
  });

  it('status is ignored for elevated tiers (tier mapping wins for operator/admin)', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'operator-status@sigo.test',
      role: 'Moderator',
    });
    await insertPortalAccount(testDb.pool, {
      userId: id,
      tier: 'operator',
      status: 'active',
    });
    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({
      kind: 'unchanged',
      role: 'Moderator',
    });
  });

  it('tier drop to brother + declared status lands on the status side, audited', async () => {
    await insertBackstopAdmin(testDb.pool);
    const id = await insertUser(testDb.pool, {
      email: 'demoted-mod@sigo.test',
      role: 'Moderator',
    });
    await insertPortalAccount(testDb.pool, {
      userId: id,
      tier: 'brother',
      status: 'active',
    });
    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({
      kind: 'synced',
      from: 'Moderator',
      to: 'Active',
      fallback: false,
    });
  });

  it('min-Admin guard still wins: last Admin dropping to brother+active keeps Admin', async () => {
    // NO backstop admin — this user is the chapter's only Admin.
    const id = await insertUser(testDb.pool, {
      email: 'last-admin@sigo.test',
      role: 'Admin',
    });
    await insertPortalAccount(testDb.pool, {
      userId: id,
      tier: 'brother',
      status: 'active',
    });
    await expect(syncRoleFromPortalTier(id)).resolves.toEqual({
      kind: 'blocked-min-admin',
      role: 'Admin',
    });
    expect(await getRoleAuditRows(testDb.pool, id)).toHaveLength(0);
  });
});
