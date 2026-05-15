import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getRoleAuditRows,
  getUserIdByEmail,
  getUserRoleByEmail,
  insertAdminBootstrap,
  insertInviteToken,
  startAuthTestDb,
  truncateAll,
  type AuthTestDb,
} from './_db';

let testDb: AuthTestDb;
let auth: typeof import('../../src/config').auth;
let adminId: string;

beforeAll(async () => {
  testDb = await startAuthTestDb();
  ({ auth } = await import('../../src/config'));
  adminId = await insertAdminBootstrap(testDb.pool);
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
});

beforeEach(async () => {
  await truncateAll(testDb.pool);
  adminId = await insertAdminBootstrap(testDb.pool, 'existing-admin@test.invalid');
  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
});

describe('BOOTSTRAP_ADMIN_EMAIL end-to-end via Better Auth session.create.after hook', () => {
  it('promotes the matching user to Admin on signup (session created → hook fires)', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'incoming-admin@test.invalid';
    await insertInviteToken(testDb.pool, {
      token: 'bootstrap-link',
      preselectedRole: 'Active',
      createdBy: adminId,
    });

    await auth.api.signUpEmail({
      body: {
        email: 'incoming-admin@test.invalid',
        password: 'correct-horse-battery',
        name: 'Incoming Admin',
        role: 'Active',
      } as never,
    });

    expect(await getUserRoleByEmail(testDb.pool, 'incoming-admin@test.invalid')).toBe(
      'Admin',
    );
    const userId = await getUserIdByEmail(testDb.pool, 'incoming-admin@test.invalid');
    expect(userId).not.toBeNull();
    const audit = await getRoleAuditRows(testDb.pool, userId!);
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

  it('is no-op for users whose email does not match BOOTSTRAP_ADMIN_EMAIL', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'never-going-to-match@test.invalid';
    await insertInviteToken(testDb.pool, {
      token: 'no-match-link',
      preselectedRole: 'Active',
      createdBy: adminId,
    });

    await auth.api.signUpEmail({
      body: {
        email: 'someone-else@test.invalid',
        password: 'correct-horse-battery',
        name: 'Someone Else',
        role: 'Active',
      } as never,
    });

    expect(await getUserRoleByEmail(testDb.pool, 'someone-else@test.invalid')).toBe(
      'Active',
    );
    const userId = await getUserIdByEmail(testDb.pool, 'someone-else@test.invalid');
    expect(await getRoleAuditRows(testDb.pool, userId!)).toEqual([]);
  });
});
