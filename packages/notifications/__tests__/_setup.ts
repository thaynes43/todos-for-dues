import { Pool } from 'pg';
import { startPostgres, type StartedPostgres } from '@app/test-utils';
import { runMigrations } from '@app/db/migrate';
import { getPool as getAppDbPool } from '@app/db';

export interface NotificationsTestDb {
  pg: StartedPostgres;
  pool: Pool;
  stop: () => Promise<void>;
}

export async function startNotificationsTestDb(): Promise<NotificationsTestDb> {
  const pg = await startPostgres();
  process.env.DATABASE_URL = pg.url;
  await runMigrations({ databaseUrl: pg.url, env: {} });
  const pool = new Pool({ connectionString: pg.url });
  return {
    pg,
    pool,
    async stop() {
      try {
        await getAppDbPool().end();
      } catch {
        // pool may not be initialised — ignore
      }
      await pool.end();
      await pg.stop();
    },
  };
}

export async function resetFixtures(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE users, jobs, job_enrollments, job_state_transitions, user_role_transitions, chapter_settings, "session", "account", "verification" RESTART IDENTITY CASCADE`,
  );
}

export interface SeededUsers {
  alumni: string;
  active1: string;
  active2: string;
}

export async function seedUsers(pool: Pool): Promise<SeededUsers> {
  // Single transaction so the DEFERRABLE INITIALLY DEFERRED min-1-Admin trigger
  // only checks after all rows commit (admin row included).
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids: Record<string, string> = {};
    for (const u of [
      { email: 'admin@test.invalid', name: 'Admin Anne', role: 'Admin' },
      { email: 'alumni@test.invalid', name: 'Alumni Adam', role: 'Alumni' },
      { email: 'active1@test.invalid', name: 'Alice Active', role: 'Active' },
      { email: 'active2@test.invalid', name: 'Bob Active', role: 'Active' },
    ]) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [u.email, u.name, u.role],
      );
      ids[u.email] = rows[0]!.id;
    }
    await client.query('COMMIT');
    return {
      alumni: ids['alumni@test.invalid']!,
      active1: ids['active1@test.invalid']!,
      active2: ids['active2@test.invalid']!,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function seedSettings(
  pool: Pool,
  values: {
    treasurer?: string;
    admin?: string;
    moderators?: string;
    chapterName?: string;
  },
): Promise<void> {
  const rows: Array<[string, string]> = [];
  if (values.treasurer) rows.push(['treasurer_recipient_email', values.treasurer]);
  if (values.admin) rows.push(['admin_recipient_email', values.admin]);
  if (values.moderators) rows.push(['moderators_recipient_email', values.moderators]);
  if (values.chapterName) rows.push(['chapter_display_name', values.chapterName]);
  for (const [key, value] of rows) {
    await pool.query(
      `INSERT INTO chapter_settings (key, value) VALUES ($1, to_jsonb($2::text))
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  }
}

export async function insertJob(
  pool: Pool,
  opts: {
    posterId: string;
    description?: string;
    duesAmount?: string;
    state?: string;
    recommendedPeopleCount?: number;
    perActiveDuesCredit?: Record<string, string> | null;
  },
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO jobs (posted_by, description, dues_amount, recommended_people_count, state, per_active_dues_credit)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      opts.posterId,
      opts.description ?? 'Test job',
      opts.duesAmount ?? '100.00',
      opts.recommendedPeopleCount ?? 3,
      opts.state ?? 'completed',
      opts.perActiveDuesCredit
        ? JSON.stringify(opts.perActiveDuesCredit)
        : null,
    ],
  );
  return rows[0]!.id;
}
