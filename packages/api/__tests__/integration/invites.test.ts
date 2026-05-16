import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  caller,
  makeCtx,
  resetAndSeedUsers,
  startTestDb,
  unauthedCtx,
  type SeedUsers,
  type TestDb,
} from './_setup';
import { verifyInviteToken } from '@app/auth';

let testDb: TestDb;
let users: SeedUsers;

beforeAll(async () => {
  testDb = await startTestDb();
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  users = await resetAndSeedUsers(testDb.pool);
});

describe('invites router', () => {
  describe('generate', () => {
    it('Admin generates an Active invite URL', async () => {
      const result = await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .invites.generate({ preselectedRole: 'Active' });
      expect(result.url).toMatch(/\?token=[a-f0-9]+$/);
      expect(result.preselectedRole).toBe('Active');
      // Token is valid
      await expect(verifyInviteToken(result.token)).resolves.toEqual({
        preselectedRole: 'Active',
      });
    });

    it('Admin generates an Alumni invite URL', async () => {
      const result = await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .invites.generate({ preselectedRole: 'Alumni' });
      expect(result.preselectedRole).toBe('Alumni');
    });

    it('rejects without session — UNAUTHORIZED', async () => {
      await expect(
        caller(unauthedCtx()).invites.generate({ preselectedRole: 'Active' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects non-Admin — FORBIDDEN', async () => {
      await expect(
        caller(makeCtx({ userId: users.moderator, role: 'Moderator' }))
          .invites.generate({ preselectedRole: 'Active' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('list', () => {
    it('returns generated tokens in descending order', async () => {
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      await admin.invites.generate({ preselectedRole: 'Active' });
      await admin.invites.generate({ preselectedRole: 'Alumni' });
      const list = await admin.invites.list();
      expect(list).toHaveLength(2);
      // Newest first
      expect(list[0]!.createdAt >= list[1]!.createdAt).toBe(true);
    });

    it('rejects non-Admin', async () => {
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).invites.list(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('revoke', () => {
    it('Admin revokes a token — verifyInviteToken rejects revoked tokens', async () => {
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      const generated = await admin.invites.generate({ preselectedRole: 'Active' });
      await admin.invites.revoke({ tokenId: generated.id });
      await expect(verifyInviteToken(generated.token)).rejects.toMatchObject({
        reason: 'revoked',
      });
    });

    it('rejects non-Admin', async () => {
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      const generated = await admin.invites.generate({ preselectedRole: 'Active' });
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' }))
          .invites.revoke({ tokenId: generated.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('returns NOT_FOUND for unknown id', async () => {
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      await expect(
        admin.invites.revoke({ tokenId: '00000000-0000-0000-0000-000000000000' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
