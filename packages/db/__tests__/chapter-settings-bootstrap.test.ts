import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { startPostgres, type StartedPostgres } from '@app/test-utils';
import { runMigrations } from '../src/migrate';

const BOOTSTRAP_KEYS = [
  'admin_recipient_email',
  'chapter_display_name',
  'chapter_timezone',
  'moderators_recipient_email',
  'treasurer_recipient_email',
] as const;

describe('chapter_settings bootstrap (DESIGN-001 §5.5)', () => {
  describe('with BOOTSTRAP_* env vars set', () => {
    let pg: StartedPostgres;
    let pool: Pool;

    beforeAll(async () => {
      pg = await startPostgres();
      await runMigrations({
        databaseUrl: pg.url,
        env: {
          BOOTSTRAP_ADMIN_RECIPIENT_EMAIL: 'admins@sponomass.test',
          BOOTSTRAP_TREASURER_RECIPIENT_EMAIL: 'treas@sponomass.test',
          BOOTSTRAP_MODERATORS_RECIPIENT_EMAIL: 'mods@sponomass.test',
          BOOTSTRAP_CHAPTER_TIMEZONE: 'America/Los_Angeles',
          BOOTSTRAP_CHAPTER_DISPLAY_NAME: 'Sigma Phi Omicron — UML',
        },
      });
      pool = new Pool({ connectionString: pg.url });
    }, 120_000);

    afterAll(async () => {
      await pool?.end();
      await pg?.stop();
    });

    it('seeds the 5 keys from env-derived GUCs', async () => {
      const { rows } = await pool.query<{ key: string; value: string }>(
        `SELECT key, value::text AS value FROM chapter_settings ORDER BY key`,
      );
      const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      expect(rows.map((r) => r.key)).toEqual([...BOOTSTRAP_KEYS]);
      expect(byKey['admin_recipient_email']).toBe('"admins@sponomass.test"');
      expect(byKey['treasurer_recipient_email']).toBe('"treas@sponomass.test"');
      expect(byKey['moderators_recipient_email']).toBe('"mods@sponomass.test"');
      expect(byKey['chapter_timezone']).toBe('"America/Los_Angeles"');
      expect(byKey['chapter_display_name']).toBe('"Sigma Phi Omicron — UML"');
    });

    it('does not overwrite existing rows on re-run (ON CONFLICT DO NOTHING)', async () => {
      // Simulate an Admin edit between deploys: update one value, re-run migrations, verify it stuck.
      await pool.query(
        `UPDATE chapter_settings SET value = to_jsonb('overridden@test.invalid'::text)
         WHERE key = 'admin_recipient_email'`,
      );
      await runMigrations({
        databaseUrl: pg.url,
        env: {
          BOOTSTRAP_ADMIN_RECIPIENT_EMAIL: 'admins@sponomass.test',
        },
      });
      const { rows } = await pool.query<{ value: string }>(
        `SELECT value::text AS value FROM chapter_settings WHERE key = 'admin_recipient_email'`,
      );
      expect(rows[0]?.value).toBe('"overridden@test.invalid"');
    });

    it('keeps the row count at 5 after re-run', async () => {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM chapter_settings`,
      );
      expect(rows[0]?.count).toBe('5');
    });
  });

  describe('without BOOTSTRAP_* env vars (falls back to .invalid defaults)', () => {
    let pg: StartedPostgres;
    let pool: Pool;

    beforeAll(async () => {
      pg = await startPostgres();
      await runMigrations({ databaseUrl: pg.url, env: {} });
      pool = new Pool({ connectionString: pg.url });
    }, 120_000);

    afterAll(async () => {
      await pool?.end();
      await pg?.stop();
    });

    it('falls back to .invalid placeholder values', async () => {
      const { rows } = await pool.query<{ key: string; value: string }>(
        `SELECT key, value::text AS value FROM chapter_settings ORDER BY key`,
      );
      const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      expect(byKey['admin_recipient_email']).toBe('"admins@example.invalid"');
      expect(byKey['treasurer_recipient_email']).toBe('"treasurer@example.invalid"');
      expect(byKey['moderators_recipient_email']).toBe('"mods@example.invalid"');
      expect(byKey['chapter_timezone']).toBe('"America/New_York"');
      expect(byKey['chapter_display_name']).toBe('"Your Chapter"');
    });
  });
});
