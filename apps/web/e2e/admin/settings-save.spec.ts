import { test, expect } from '@playwright/test';
import {
  createPool,
  installPageerrorListener,
  newSuffix,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-007 AC-08 / AC-09 — Settings save-on-blur', () => {
  test('valid email persists; invalid email shows field error and leaves DB unchanged', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      // Capture current treasurer value so we can restore.
      const { rows: prior } = await pool.query<{ value: unknown }>(
        `SELECT value FROM chapter_settings WHERE key = 'treasurer_recipient_email'`,
      );
      const priorValue =
        typeof prior[0]?.value === 'string'
          ? (prior[0]!.value as string)
          : 'treasurer@chapter.test';
      const newEmail = `treasurer-${suffix}@chapter.test`;

      try {
        await reAuth(page, context, cast.admin);
        await page.goto('/admin/settings');
        await expect(page.getByTestId('settings-form')).toBeVisible();
        const input = page.getByTestId('settings-input-treasurer_recipient_email');
        await input.fill(newEmail);
        const responsePromise = page.waitForResponse((r) =>
          r.url().includes('settings.set') && r.status() < 400,
        );
        await input.blur();
        await responsePromise;
        await expect(
          page.getByTestId('settings-saved-treasurer_recipient_email'),
        ).toBeVisible();

        // DB carries the new value with updatedBy = the admin uuid.
        const { rows: after } = await pool.query<{
          value: unknown;
          updated_by: string | null;
        }>(
          `SELECT value, updated_by FROM chapter_settings WHERE key = 'treasurer_recipient_email'`,
        );
        expect(after[0]?.value).toBe(newEmail);
        expect(after[0]?.updated_by).toBe(cast.admin.id);

        // Reload — value persists.
        await page.goto('/admin/settings');
        await expect(
          page.getByTestId('settings-input-treasurer_recipient_email'),
        ).toHaveValue(newEmail);

        // Invalid email → inline error; DB unchanged.
        const adminInput = page.getByTestId(
          'settings-input-admin_recipient_email',
        );
        const { rows: priorAdmin } = await pool.query<{ value: unknown }>(
          `SELECT value FROM chapter_settings WHERE key = 'admin_recipient_email'`,
        );
        const priorAdminValue = priorAdmin[0]?.value as string | undefined;
        await adminInput.fill('not-an-email');
        await adminInput.blur();
        await expect(
          page.getByTestId('settings-error-admin_recipient_email'),
        ).toBeVisible();
        const { rows: afterAdmin } = await pool.query<{ value: unknown }>(
          `SELECT value FROM chapter_settings WHERE key = 'admin_recipient_email'`,
        );
        expect(afterAdmin[0]?.value).toBe(priorAdminValue);
      } finally {
        // Restore prior treasurer value for spec isolation.
        await pool.query(
          `INSERT INTO chapter_settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          ['treasurer_recipient_email', JSON.stringify(priorValue)],
        );
      }
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
