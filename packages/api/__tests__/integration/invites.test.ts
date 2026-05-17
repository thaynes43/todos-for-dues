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
  describe('mint (PRD-003 AC-10)', () => {
    it('Admin mints an Active invite with correct fields', async () => {
      const result = await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .invites.mint({ preselectedRole: 'Active' });
      expect(result.preselectedRole).toBe('Active');
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
      // base64url, 16 random bytes = 22 chars (no padding)
      expect(result.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(result.createdBy).toBe(users.admin);
      expect(result.createdAt).toBeInstanceOf(Date);
      // Token is valid for redemption
      await expect(verifyInviteToken(result.token)).resolves.toEqual({
        preselectedRole: 'Active',
      });
    });

    it('Admin mints an Alumni invite', async () => {
      const result = await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .invites.mint({ preselectedRole: 'Alumni' });
      expect(result.preselectedRole).toBe('Alumni');
    });

    it('rejects privileged roles at the Zod boundary (PRD-003 R-11)', async () => {
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      for (const role of ['Moderator', 'Admin'] as const) {
        await expect(
          // @ts-expect-error — Zod enum rejects at runtime; type system also rejects.
          admin.invites.mint({ preselectedRole: role }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      }
    });

    it('rejects without session — UNAUTHORIZED', async () => {
      await expect(
        caller(unauthedCtx()).invites.mint({ preselectedRole: 'Active' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects non-Admin — FORBIDDEN', async () => {
      await expect(
        caller(makeCtx({ userId: users.moderator, role: 'Moderator' }))
          .invites.mint({ preselectedRole: 'Active' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('list (PRD-003 AC-11)', () => {
    it('returns outstanding invites in DESC order with minter display name', async () => {
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      await admin.invites.mint({ preselectedRole: 'Active' });
      await admin.invites.mint({ preselectedRole: 'Alumni' });
      const list = await admin.invites.list();
      expect(list).toHaveLength(2);
      expect(list[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        list[1]!.createdAt.getTime(),
      );
      expect(list[0]!.createdByDisplayName).toBe('Admin Anne');
    });

    it('omits revoked invites', async () => {
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      const minted = await admin.invites.mint({ preselectedRole: 'Active' });
      await admin.invites.revoke({ id: minted.id });
      const list = await admin.invites.list();
      expect(list).toHaveLength(0);
    });

    it('rejects non-Admin', async () => {
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).invites.list(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('revoke (PRD-003 AC-12)', () => {
    it('Admin revokes — verifyInviteToken then rejects with reason="revoked"', async () => {
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      const minted = await admin.invites.mint({ preselectedRole: 'Active' });
      const { revokedAt } = await admin.invites.revoke({ id: minted.id });
      expect(revokedAt).toBeInstanceOf(Date);
      await expect(verifyInviteToken(minted.token)).rejects.toMatchObject({
        reason: 'revoked',
      });
    });

    it('revoking an already-revoked id returns NOT_FOUND', async () => {
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      const minted = await admin.invites.mint({ preselectedRole: 'Active' });
      await admin.invites.revoke({ id: minted.id });
      await expect(admin.invites.revoke({ id: minted.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('rejects non-Admin', async () => {
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      const minted = await admin.invites.mint({ preselectedRole: 'Active' });
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' }))
          .invites.revoke({ id: minted.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('returns NOT_FOUND for unknown id', async () => {
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      await expect(
        admin.invites.revoke({ id: '00000000-0000-0000-0000-000000000000' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
