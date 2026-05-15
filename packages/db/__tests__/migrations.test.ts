import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { startPostgres, type StartedPostgres } from '@app/test-utils';
import { runMigrations } from '../src/migrate';

describe('migrations', () => {
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

  it('creates the 7 application tables', async () => {
    const { rows } = await pool.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE 'drizzle_%'
        AND tablename NOT LIKE '\\_\\_%' ESCAPE '\\'
      ORDER BY tablename
    `);
    expect(rows.map((r) => r.tablename)).toEqual([
      'chapter_settings',
      'invite_tokens',
      'job_enrollments',
      'job_state_transitions',
      'jobs',
      'user_role_transitions',
      'users',
    ]);
  });

  it('installs pgcrypto', async () => {
    const { rows } = await pool.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('installs citext', async () => {
    const { rows } = await pool.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'citext'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('creates the assert_min_one_admin trigger function', async () => {
    const { rows } = await pool.query<{ proname: string }>(
      `SELECT proname FROM pg_proc WHERE proname = 'assert_min_one_admin'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('creates trg_min_one_admin as DEFERRABLE INITIALLY DEFERRED', async () => {
    const { rows } = await pool.query<{
      tgname: string;
      tgdeferrable: boolean;
      tginitdeferred: boolean;
    }>(
      `SELECT tgname, tgdeferrable, tginitdeferred FROM pg_trigger WHERE tgname = 'trg_min_one_admin'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tgdeferrable).toBe(true);
    expect(rows[0]?.tginitdeferred).toBe(true);
  });

  it('seeds 5 chapter_settings rows', async () => {
    const { rows } = await pool.query<{ key: string }>(
      `SELECT key FROM chapter_settings ORDER BY key`,
    );
    expect(rows.map((r) => r.key)).toEqual([
      'admin_recipient_email',
      'chapter_display_name',
      'chapter_timezone',
      'moderators_recipient_email',
      'treasurer_recipient_email',
    ]);
  });

  it('is idempotent on re-run (no-op, no duplicates)', async () => {
    await runMigrations({ databaseUrl: pg.url, env: {} });
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM chapter_settings`,
    );
    expect(rows[0]?.count).toBe('5');
  });
});
