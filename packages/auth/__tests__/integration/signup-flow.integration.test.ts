import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getAccountRows,
  getUserIdByEmail,
  getUserRoleByEmail,
  insertAdminBootstrap,
  insertInviteToken,
  startAuthTestDb,
  truncateAll,
  type AuthTestDb,
} from './_db';

let testDb: AuthTestDb;
let adminId: string;
let auth: typeof import('../../src/config').auth;

beforeAll(async () => {
  testDb = await startAuthTestDb();
  // Import after DATABASE_URL is set so the lazy @app/db proxy connects to the
  // testcontainer. Use a dynamic import to defer module-graph evaluation.
  ({ auth } = await import('../../src/config'));
  adminId = await insertAdminBootstrap(testDb.pool);
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  await truncateAll(testDb.pool);
  adminId = await insertAdminBootstrap(testDb.pool);
});

describe('invite-token signup happy path (PRD-003 R-01/AC-01)', () => {
  it('creates user with role from token + account row with credential provider', async () => {
    await insertInviteToken(testDb.pool, {
      token: 'happy-active',
      preselectedRole: 'Active',
      createdBy: adminId,
    });

    await auth.api.signUpEmail({
      body: {
        email: 'newbie@chapter.test',
        password: 'correct-horse-battery',
        name: 'Newbie Active',
        role: 'Active',
      } as never,
    });

    expect(await getUserRoleByEmail(testDb.pool, 'newbie@chapter.test')).toBe('Active');
    const userId = await getUserIdByEmail(testDb.pool, 'newbie@chapter.test');
    expect(userId).not.toBeNull();
    const accounts = await getAccountRows(testDb.pool, userId!);
    expect(accounts).toEqual([
      { providerId: 'credential', accountId: userId, hasPassword: true },
    ]);
  });

  it('writes role=Alumni when the invite token preselectedRole is Alumni', async () => {
    await insertInviteToken(testDb.pool, {
      token: 'happy-alumni',
      preselectedRole: 'Alumni',
      createdBy: adminId,
    });

    await auth.api.signUpEmail({
      body: {
        email: 'graduate@chapter.test',
        password: 'correct-horse-battery',
        name: 'Graduate',
        role: 'Alumni',
      } as never,
    });

    expect(await getUserRoleByEmail(testDb.pool, 'graduate@chapter.test')).toBe('Alumni');
  });

  it('does NOT write a user_role_transitions row at signup (Trap 2)', async () => {
    await insertInviteToken(testDb.pool, {
      token: 'no-audit',
      preselectedRole: 'Active',
      createdBy: adminId,
    });

    await auth.api.signUpEmail({
      body: {
        email: 'first-time@chapter.test',
        password: 'correct-horse-battery',
        name: 'First Time',
        role: 'Active',
      } as never,
    });

    const userId = await getUserIdByEmail(testDb.pool, 'first-time@chapter.test');
    const { rows } = await testDb.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM user_role_transitions WHERE user_id = $1`,
      [userId],
    );
    expect(rows[0]?.count).toBe('0');
  });
});
