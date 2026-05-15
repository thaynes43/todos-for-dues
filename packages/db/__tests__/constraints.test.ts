import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { startPostgres, type StartedPostgres } from '@app/test-utils';
import { runMigrations } from '../src/migrate';

interface PgError extends Error {
  code?: string;
}

async function expectPgError(promise: Promise<unknown>, code: string): Promise<PgError> {
  try {
    await promise;
  } catch (err) {
    const e = err as PgError;
    expect(e.code, `expected ${code}, got ${e.code}: ${e.message}`).toBe(code);
    return e;
  }
  throw new Error(`expected query to fail with ${code} but it succeeded`);
}

async function insertUser(
  pool: Pool,
  overrides: Partial<{
    email: string;
    displayName: string;
    role: string;
  }> = {},
): Promise<string> {
  const email = overrides.email ?? `user-${Math.random().toString(36).slice(2, 10)}@test.invalid`;
  const displayName = overrides.displayName ?? 'Test User';
  const role = overrides.role ?? 'Active';
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, role)
     VALUES ($1, $2, $3) RETURNING id`,
    [email, displayName, role],
  );
  return rows[0]!.id;
}

describe('schema constraints', () => {
  let pg: StartedPostgres;
  let pool: Pool;
  let adminId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations({ databaseUrl: pg.url, env: {} });
    pool = new Pool({ connectionString: pg.url });
    adminId = await insertUser(pool, { email: 'admin@test.invalid', role: 'Admin' });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await pg?.stop();
  });

  describe('users CHECK constraints', () => {
    it('rejects role not in enum', async () => {
      await expectPgError(
        insertUser(pool, { email: 'bad-role@test.invalid', role: 'Superuser' }),
        '23514',
      );
    });

    it('rejects null display_name (NOT NULL)', async () => {
      await expectPgError(
        pool.query(
          `INSERT INTO users (email, display_name) VALUES ($1, NULL)`,
          ['no-name@test.invalid'],
        ),
        '23502',
      );
    });

    it('rejects duplicate email', async () => {
      await insertUser(pool, { email: 'dup@test.invalid' });
      await expectPgError(insertUser(pool, { email: 'dup@test.invalid' }), '23505');
    });
  });

  describe('invite_tokens CHECK constraints', () => {
    it('rejects preselected_role outside {Active, Alumni}', async () => {
      await expectPgError(
        pool.query(
          `INSERT INTO invite_tokens (token, preselected_role, created_by) VALUES ($1, $2, $3)`,
          [`tok-${Math.random()}`, 'Admin', adminId],
        ),
        '23514',
      );
    });

    it('accepts Active and Alumni preselected_role', async () => {
      await pool.query(
        `INSERT INTO invite_tokens (token, preselected_role, created_by) VALUES ($1, $2, $3)`,
        [`tok-active-${Math.random()}`, 'Active', adminId],
      );
      await pool.query(
        `INSERT INTO invite_tokens (token, preselected_role, created_by) VALUES ($1, $2, $3)`,
        [`tok-alumni-${Math.random()}`, 'Alumni', adminId],
      );
    });
  });

  describe('jobs CHECK constraints', () => {
    async function insertJob(overrides: Partial<{
      duesAmount: number | string;
      recommendedPeopleCount: number;
      description: string;
      state: string;
    }> = {}) {
      return pool.query(
        `INSERT INTO jobs (posted_by, description, dues_amount, recommended_people_count, state)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          adminId,
          overrides.description ?? 'paint the porch',
          overrides.duesAmount ?? '10.00',
          overrides.recommendedPeopleCount ?? 2,
          overrides.state ?? 'awaiting_moderation',
        ],
      );
    }

    it('rejects dues_amount = 0 (jobs_dues_positive)', async () => {
      await expectPgError(insertJob({ duesAmount: '0' }), '23514');
    });

    it('rejects negative dues_amount', async () => {
      await expectPgError(insertJob({ duesAmount: '-5' }), '23514');
    });

    it('rejects recommended_people_count = 0 (jobs_count_positive)', async () => {
      await expectPgError(insertJob({ recommendedPeopleCount: 0 }), '23514');
    });

    it('rejects empty description (jobs_description_non_empty)', async () => {
      await expectPgError(insertJob({ description: '' }), '23514');
    });

    it('rejects whitespace-only description', async () => {
      await expectPgError(insertJob({ description: '   ' }), '23514');
    });

    it('rejects state not in enum', async () => {
      await expectPgError(insertJob({ state: 'frozen' }), '23514');
    });

    it('accepts every JOB_STATES enum value', async () => {
      const states = [
        'awaiting_moderation',
        'approved',
        'enrollment_open',
        'locked',
        'completed',
        'payment_sent',
        'closed',
        'disputed',
        'rejected',
        'cancelled',
      ];
      for (const s of states) {
        await insertJob({ state: s, description: `state-${s}` });
      }
    });
  });

  describe('FK cascade behavior on job_enrollments', () => {
    it('cascades on user delete', async () => {
      const active = await insertUser(pool, { email: `cascade-user-${Math.random()}@test.invalid` });
      const { rows: jobRows } = await pool.query<{ id: string }>(
        `INSERT INTO jobs (posted_by, description, dues_amount, recommended_people_count)
         VALUES ($1, 'cascade test', '10.00', 1) RETURNING id`,
        [adminId],
      );
      const jobId = jobRows[0]!.id;
      await pool.query(`INSERT INTO job_enrollments (job_id, active_id) VALUES ($1, $2)`, [
        jobId,
        active,
      ]);

      await pool.query(`DELETE FROM users WHERE id = $1`, [active]);
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM job_enrollments WHERE active_id = $1`,
        [active],
      );
      expect(rows[0]?.count).toBe('0');
    });

    it('cascades on job delete', async () => {
      const active = await insertUser(pool, { email: `cascade-job-${Math.random()}@test.invalid` });
      const { rows: jobRows } = await pool.query<{ id: string }>(
        `INSERT INTO jobs (posted_by, description, dues_amount, recommended_people_count)
         VALUES ($1, 'cascade job', '10.00', 1) RETURNING id`,
        [adminId],
      );
      const jobId = jobRows[0]!.id;
      await pool.query(`INSERT INTO job_enrollments (job_id, active_id) VALUES ($1, $2)`, [
        jobId,
        active,
      ]);

      await pool.query(`DELETE FROM jobs WHERE id = $1`, [jobId]);
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM job_enrollments WHERE job_id = $1`,
        [jobId],
      );
      expect(rows[0]?.count).toBe('0');
    });

    it('cascades job_state_transitions on job delete', async () => {
      const { rows: jobRows } = await pool.query<{ id: string }>(
        `INSERT INTO jobs (posted_by, description, dues_amount, recommended_people_count)
         VALUES ($1, 'cascade transitions', '10.00', 1) RETURNING id`,
        [adminId],
      );
      const jobId = jobRows[0]!.id;
      await pool.query(
        `INSERT INTO job_state_transitions (job_id, from_state, to_state, actor_id, actor_kind)
         VALUES ($1, NULL, 'awaiting_moderation', $2, 'user')`,
        [jobId, adminId],
      );
      await pool.query(`DELETE FROM jobs WHERE id = $1`, [jobId]);
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM job_state_transitions WHERE job_id = $1`,
        [jobId],
      );
      expect(rows[0]?.count).toBe('0');
    });
  });

  describe('partial index on disputed transitions', () => {
    it('exists', async () => {
      const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes
         WHERE tablename = 'job_state_transitions' AND indexname = 'job_state_transitions_disputed_idx'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.indexdef.toLowerCase()).toContain("where");
      expect(rows[0]?.indexdef.toLowerCase()).toContain("'disputed'");
    });
  });

  describe('user_role_transitions index', () => {
    it('exists on (user_id, created_at DESC)', async () => {
      const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes
         WHERE tablename = 'user_role_transitions' AND indexname = 'user_role_transitions_user_created_idx'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.indexdef.toLowerCase()).toContain('user_id');
      expect(rows[0]?.indexdef.toLowerCase()).toContain('created_at');
    });
  });
});
