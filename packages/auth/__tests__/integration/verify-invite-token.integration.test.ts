import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InviteTokenError, verifyInviteToken } from '../../src';
import {
  insertAdminBootstrap,
  insertInviteToken,
  revokeInviteToken,
  startAuthTestDb,
  truncateAll,
  type AuthTestDb,
} from './_db';

let testDb: AuthTestDb;
let adminId: string;

beforeAll(async () => {
  testDb = await startAuthTestDb();
  adminId = await insertAdminBootstrap(testDb.pool);
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  await truncateAll(testDb.pool);
  adminId = await insertAdminBootstrap(testDb.pool);
});

describe('verifyInviteToken (DESIGN-004 §4.5)', () => {
  it('returns preselectedRole for a valid token', async () => {
    await insertInviteToken(testDb.pool, {
      token: 'active-link',
      preselectedRole: 'Active',
      createdBy: adminId,
    });
    const result = await verifyInviteToken('active-link');
    expect(result).toEqual({ preselectedRole: 'Active' });
  });

  it('throws InviteTokenError(not_found) for unknown tokens', async () => {
    await expect(verifyInviteToken('no-such-token')).rejects.toMatchObject({
      name: 'InviteTokenError',
      reason: 'not_found',
    });
  });

  it('throws InviteTokenError(revoked) when the token has been revoked', async () => {
    await insertInviteToken(testDb.pool, {
      token: 'revoked-link',
      preselectedRole: 'Alumni',
      createdBy: adminId,
    });
    await revokeInviteToken(testDb.pool, 'revoked-link');
    await expect(verifyInviteToken('revoked-link')).rejects.toBeInstanceOf(
      InviteTokenError,
    );
    try {
      await verifyInviteToken('revoked-link');
    } catch (err) {
      expect((err as InviteTokenError).reason).toBe('revoked');
    }
  });

  it('throws InviteTokenError(not_found) for empty / whitespace tokens', async () => {
    await expect(verifyInviteToken('')).rejects.toMatchObject({ reason: 'not_found' });
    await expect(verifyInviteToken('   ')).rejects.toMatchObject({ reason: 'not_found' });
  });
});
