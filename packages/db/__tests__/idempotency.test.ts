import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { startPostgres, type StartedPostgres } from '@app/test-utils';
import { runMigrations } from '../src/migrate';

interface PgError extends Error {
  code?: string;
}

describe('idempotency / composite PK on job_enrollments', () => {
  let pg: StartedPostgres;
  let pool: Pool;
  let adminId: string;
  let activeId: string;
  let jobId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations({ databaseUrl: pg.url, env: {} });
    pool = new Pool({ connectionString: pg.url });
    const { rows: u1 } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, role)
       VALUES ('admin@test.invalid', 'Admin', 'Admin') RETURNING id`,
    );
    adminId = u1[0]!.id;
    const { rows: u2 } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, role)
       VALUES ('active@test.invalid', 'Active', 'Active') RETURNING id`,
    );
    activeId = u2[0]!.id;
    const { rows: jobRows } = await pool.query<{ id: string }>(
      `INSERT INTO jobs (posted_by, description, dues_amount, recommended_people_count)
       VALUES ($1, 'idem job', '10.00', 1) RETURNING id`,
      [adminId],
    );
    jobId = jobRows[0]!.id;
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await pg?.stop();
  });

  it('rejects duplicate (job_id, active_id) with composite PK violation 23505', async () => {
    await pool.query(`INSERT INTO job_enrollments (job_id, active_id) VALUES ($1, $2)`, [
      jobId,
      activeId,
    ]);
    try {
      await pool.query(`INSERT INTO job_enrollments (job_id, active_id) VALUES ($1, $2)`, [
        jobId,
        activeId,
      ]);
      throw new Error('expected duplicate insert to fail');
    } catch (err) {
      expect((err as PgError).code).toBe('23505');
    }
  });

  it('accepts second insert with ON CONFLICT DO NOTHING (0 rows affected)', async () => {
    const result = await pool.query(
      `INSERT INTO job_enrollments (job_id, active_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [jobId, activeId],
    );
    expect(result.rowCount).toBe(0);
  });

  it('accepts multiple job_state_transitions rows per job_id (append-only log)', async () => {
    await pool.query(
      `INSERT INTO job_state_transitions (job_id, from_state, to_state, actor_id, actor_kind)
       VALUES ($1, NULL, 'awaiting_moderation', $2, 'user')`,
      [jobId, adminId],
    );
    await pool.query(
      `INSERT INTO job_state_transitions (job_id, from_state, to_state, actor_id, actor_kind)
       VALUES ($1, 'awaiting_moderation', 'approved', $2, 'user')`,
      [jobId, adminId],
    );
    await pool.query(
      `INSERT INTO job_state_transitions (job_id, from_state, to_state, actor_kind)
       VALUES ($1, 'approved', 'enrollment_open', 'system')`,
      [jobId],
    );
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM job_state_transitions WHERE job_id = $1`,
      [jobId],
    );
    expect(Number(rows[0]?.count)).toBeGreaterThanOrEqual(3);
  });
});
