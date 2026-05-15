import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapAdminOnSignin } from '../../src';
import {
  getRoleAuditRows,
  getUserRoleByEmail,
  insertAdminBootstrap,
  startAuthTestDb,
  truncateAll,
  type AuthTestDb,
} from './_db';
import { Pool } from 'pg';

let testDb: AuthTestDb;

beforeAll(async () => {
  testDb = await startAuthTestDb();
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
});

beforeEach(async () => {
  await truncateAll(testDb.pool);
  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
});

async function insertActive(pool: Pool, email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, role, email_verified) VALUES ($1, 'Active User', 'Active', true) RETURNING id`,
    [email],
  );
  return rows[0]!.id;
}

describe('bootstrapAdminOnSignin (DESIGN-004 §4.4, Trap 1 adaptation)', () => {
  it('promotes the matching user to Admin via transitionRole + writes a system audit row', async () => {
    // Need an existing Admin to satisfy the min-Admin trigger pre-state.
    await insertAdminBootstrap(testDb.pool, 'existing-admin@test.invalid');
    const newAdminId = await insertActive(testDb.pool, 'new-admin@test.invalid');
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'new-admin@test.invalid';

    await bootstrapAdminOnSignin({ id: newAdminId, email: 'new-admin@test.invalid' });

    expect(await getUserRoleByEmail(testDb.pool, 'new-admin@test.invalid')).toBe('Admin');
    const audit = await getRoleAuditRows(testDb.pool, newAdminId);
    expect(audit).toEqual([
      {
        fromRole: 'Active',
        toRole: 'Admin',
        initiatorKind: 'system',
        initiatorId: null,
        note: 'BOOTSTRAP_ADMIN_EMAIL promotion',
      },
    ]);
  });

  it('is no-op when BOOTSTRAP_ADMIN_EMAIL is unset', async () => {
    await insertAdminBootstrap(testDb.pool, 'existing-admin@test.invalid');
    const activeId = await insertActive(testDb.pool, 'someone@test.invalid');
    // BOOTSTRAP_ADMIN_EMAIL is unset
    await bootstrapAdminOnSignin({ id: activeId, email: 'someone@test.invalid' });
    expect(await getUserRoleByEmail(testDb.pool, 'someone@test.invalid')).toBe('Active');
    expect(await getRoleAuditRows(testDb.pool, activeId)).toEqual([]);
  });

  it('is no-op for non-matching emails', async () => {
    await insertAdminBootstrap(testDb.pool, 'existing-admin@test.invalid');
    const activeId = await insertActive(testDb.pool, 'someone@test.invalid');
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'different@test.invalid';
    await bootstrapAdminOnSignin({ id: activeId, email: 'someone@test.invalid' });
    expect(await getUserRoleByEmail(testDb.pool, 'someone@test.invalid')).toBe('Active');
    expect(await getRoleAuditRows(testDb.pool, activeId)).toEqual([]);
  });

  it('is idempotent (no-op when already Admin)', async () => {
    const adminId = await insertAdminBootstrap(testDb.pool, 'first-admin@test.invalid');
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'first-admin@test.invalid';

    await bootstrapAdminOnSignin({ id: adminId, email: 'first-admin@test.invalid' });
    await bootstrapAdminOnSignin({ id: adminId, email: 'first-admin@test.invalid' });

    expect(await getUserRoleByEmail(testDb.pool, 'first-admin@test.invalid')).toBe('Admin');
    // No audit rows since they were already Admin.
    expect(await getRoleAuditRows(testDb.pool, adminId)).toEqual([]);
  });

  it('is case-insensitive on the email match', async () => {
    await insertAdminBootstrap(testDb.pool, 'existing-admin@test.invalid');
    const newAdminId = await insertActive(testDb.pool, 'CaseSensitive@test.invalid');
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'casesensitive@test.invalid';

    await bootstrapAdminOnSignin({ id: newAdminId, email: 'CaseSensitive@test.invalid' });

    expect(await getUserRoleByEmail(testDb.pool, 'CaseSensitive@test.invalid')).toBe('Admin');
  });
});
