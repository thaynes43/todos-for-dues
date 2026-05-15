import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getSessionRole } from '../../src';
import { insertAdminBootstrap, startAuthTestDb, truncateAll, type AuthTestDb } from './_db';

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

describe('getSessionRole (DESIGN-004 §4.3)', () => {
  it('returns role + displayName for a known user id', async () => {
    const adminId = await insertAdminBootstrap(testDb.pool);
    const result = await getSessionRole(adminId);
    expect(result).toEqual({ role: 'Admin', displayName: 'Admin Bootstrap' });
  });

  it('throws when the user disappeared between signin and lookup', async () => {
    await insertAdminBootstrap(testDb.pool);
    await expect(
      getSessionRole('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(/disappeared/);
  });
});
