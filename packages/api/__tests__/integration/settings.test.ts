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

async function getSetting(key: string): Promise<unknown> {
  const { rows } = await testDb.pool.query<{ value: unknown }>(
    `SELECT value FROM chapter_settings WHERE key = $1`,
    [key],
  );
  return rows[0]?.value;
}

describe('settings router', () => {
  describe('list', () => {
    it('Admin lists chapter_settings', async () => {
      const result = await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .settings.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it('rejects non-Admin', async () => {
      await expect(
        caller(makeCtx({ userId: users.moderator, role: 'Moderator' })).settings.list(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('set — PRD-007 R-07/R-08 with per-key validation', () => {
    it('AC-08: Admin sets treasurer_recipient_email', async () => {
      await caller(makeCtx({ userId: users.admin, role: 'Admin' })).settings.set({
        key: 'treasurer_recipient_email',
        value: 'treasurer@example.com',
      });
      expect(await getSetting('treasurer_recipient_email')).toBe('treasurer@example.com');
    });

    it('AC-09: invalid email → BAD_REQUEST; existing value unchanged', async () => {
      const c = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      await c.settings.set({
        key: 'treasurer_recipient_email',
        value: 'good@example.com',
      });
      await expect(
        c.settings.set({ key: 'treasurer_recipient_email', value: 'not-an-email' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(await getSetting('treasurer_recipient_email')).toBe('good@example.com');
    });

    it('rejects non-Admin — FORBIDDEN', async () => {
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).settings.set({
          key: 'treasurer_recipient_email',
          value: 'x@example.com',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects without session — UNAUTHORIZED', async () => {
      await expect(
        caller(unauthedCtx()).settings.set({
          key: 'treasurer_recipient_email',
          value: 'x@example.com',
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('admin_recipient_email — happy + invalid', async () => {
      const c = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      await c.settings.set({ key: 'admin_recipient_email', value: 'admin@example.com' });
      expect(await getSetting('admin_recipient_email')).toBe('admin@example.com');
      await expect(
        c.settings.set({ key: 'admin_recipient_email', value: 42 }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('moderators_recipient_email — happy + invalid', async () => {
      const c = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      await c.settings.set({ key: 'moderators_recipient_email', value: 'mods@example.com' });
      expect(await getSetting('moderators_recipient_email')).toBe('mods@example.com');
      await expect(
        c.settings.set({ key: 'moderators_recipient_email', value: '' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('chapter_timezone — happy + invalid', async () => {
      const c = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      await c.settings.set({ key: 'chapter_timezone', value: 'America/Los_Angeles' });
      expect(await getSetting('chapter_timezone')).toBe('America/Los_Angeles');
      await expect(
        c.settings.set({ key: 'chapter_timezone', value: 'PST' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('chapter_display_name — happy + invalid', async () => {
      const c = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      await c.settings.set({ key: 'chapter_display_name', value: 'Sigma Goal Alumni' });
      expect(await getSetting('chapter_display_name')).toBe('Sigma Goal Alumni');
      await expect(
        c.settings.set({ key: 'chapter_display_name', value: '   ' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });
});
