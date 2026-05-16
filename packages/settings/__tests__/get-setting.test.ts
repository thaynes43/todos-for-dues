import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { startPostgres, type StartedPostgres } from '@app/test-utils';
import { runMigrations } from '@app/db/migrate';
import { db as appDb, getPool as getAppDbPool } from '@app/db';
import { getSetting, getSettingOrDefault, MissingSettingError } from '../src';

let pg: StartedPostgres;
let pool: Pool;

beforeAll(async () => {
  pg = await startPostgres();
  process.env.DATABASE_URL = pg.url;
  await runMigrations({ databaseUrl: pg.url, env: {} });
  pool = new Pool({ connectionString: pg.url });
}, 180_000);

afterAll(async () => {
  try {
    await getAppDbPool().end();
  } catch {
    // ignore — pool may not be initialised
  }
  await pool.end();
  await pg.stop();
});

beforeEach(async () => {
  await pool.query('TRUNCATE chapter_settings RESTART IDENTITY CASCADE');
});

describe('getSetting()', () => {
  it('returns DB value when present', async () => {
    await pool.query(
      `INSERT INTO chapter_settings (key, value) VALUES ('treasurer_recipient_email', to_jsonb('book@example.org'::text))`,
    );
    const value = await getSetting<string>('treasurer_recipient_email', {
      db: appDb,
      env: {},
    });
    expect(value).toBe('book@example.org');
  });

  it('returns env-var fallback when DB row absent', async () => {
    const value = await getSetting<string>('treasurer_recipient_email', {
      db: appDb,
      env: { BOOTSTRAP_TREASURER_RECIPIENT_EMAIL: 'env@example.org' },
    });
    expect(value).toBe('env@example.org');
  });

  it('throws MissingSettingError when both absent', async () => {
    await expect(
      getSetting<string>('moderators_recipient_email', { db: appDb, env: {} }),
    ).rejects.toBeInstanceOf(MissingSettingError);
  });

  it('DB value wins over env-var when both present', async () => {
    await pool.query(
      `INSERT INTO chapter_settings (key, value) VALUES ('admin_recipient_email', to_jsonb('db@example.org'::text))`,
    );
    const value = await getSetting<string>('admin_recipient_email', {
      db: appDb,
      env: { BOOTSTRAP_ADMIN_RECIPIENT_EMAIL: 'env@example.org' },
    });
    expect(value).toBe('db@example.org');
  });
});

describe('getSettingOrDefault()', () => {
  it('returns the supplied default when both DB and env are empty', async () => {
    const value = await getSettingOrDefault<string>(
      'chapter_display_name',
      'Fallback Chapter',
      { db: appDb, env: {} },
    );
    expect(value).toBe('Fallback Chapter');
  });

  it('returns the real value when present in DB', async () => {
    await pool.query(
      `INSERT INTO chapter_settings (key, value) VALUES ('chapter_display_name', to_jsonb('Real Chapter'::text))`,
    );
    const value = await getSettingOrDefault<string>(
      'chapter_display_name',
      'Fallback Chapter',
      { db: appDb, env: {} },
    );
    expect(value).toBe('Real Chapter');
  });
});
