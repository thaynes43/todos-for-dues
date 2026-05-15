import { Pool, type PoolClient } from 'pg';
import { startPostgres, type StartedPostgres } from '@app/test-utils';
import { getPool as getAppDbPool } from '@app/db';
import { runMigrations } from '@app/db/migrate';

export interface TestDb {
  pg: StartedPostgres;
  pool: Pool;
  stop: () => Promise<void>;
}

/**
 * Start a fresh PG16 testcontainer + apply migrations + set DATABASE_URL so the
 * lazy @app/db Proxy connects to this container. Returns a pool for direct SQL
 * (used by tests to insert seed rows + assert on table state).
 */
export async function startTestDb(): Promise<TestDb> {
  const pg = await startPostgres();
  process.env.DATABASE_URL = pg.url;
  await runMigrations({ databaseUrl: pg.url, env: {} });
  const pool = new Pool({ connectionString: pg.url });
  return {
    pg,
    pool,
    async stop() {
      // Close the @app/db Proxy's lazy singleton pool first (it was opened the
      // moment a test called db.transaction(...)). Without this, the
      // testcontainer's PG kills its remaining connections and pg emits a 57P01
      // unhandled error after the test run completes.
      try {
        await getAppDbPool().end();
      } catch {
        // pool was never instantiated (no db usage) — ignore.
      }
      await pool.end();
      await pg.stop();
    },
  };
}

export async function withTx<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export type Role = 'Active' | 'Alumni' | 'Moderator' | 'Admin';

export interface SeedUsers {
  admin: string;
  moderator: string;
  alumni: string;
  active1: string;
  active2: string;
  active3: string;
}

/**
 * Reset all transactional tables and seed the canonical user roster:
 * one Admin, one Moderator, one Alumni, three Actives. All inside one
 * transaction so the DEFERRABLE min-Admin trigger fires exactly once at COMMIT
 * with admin_count = 1.
 */
export async function resetAndSeedUsers(pool: Pool): Promise<SeedUsers> {
  return withTx(pool, async (client) => {
    await client.query(
      `TRUNCATE users, jobs, job_enrollments, job_state_transitions, user_role_transitions, invite_tokens RESTART IDENTITY CASCADE`,
    );
    const roster: Array<{ email: string; name: string; role: Role }> = [
      { email: 'admin@test.invalid', name: 'Admin User', role: 'Admin' },
      { email: 'mod@test.invalid', name: 'Mod User', role: 'Moderator' },
      { email: 'alumni@test.invalid', name: 'Alumni Poster', role: 'Alumni' },
      { email: 'active1@test.invalid', name: 'Alice Active', role: 'Active' },
      { email: 'active2@test.invalid', name: 'Bob Active', role: 'Active' },
      { email: 'active3@test.invalid', name: 'Carol Active', role: 'Active' },
    ];
    const ids: Record<string, string> = {};
    for (const u of roster) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, role, password_hash) VALUES ($1, $2, $3, 'pw') RETURNING id`,
        [u.email, u.name, u.role],
      );
      ids[u.email] = rows[0]!.id;
    }
    return {
      admin: ids['admin@test.invalid']!,
      moderator: ids['mod@test.invalid']!,
      alumni: ids['alumni@test.invalid']!,
      active1: ids['active1@test.invalid']!,
      active2: ids['active2@test.invalid']!,
      active3: ids['active3@test.invalid']!,
    };
  });
}

/**
 * Insert a job row directly with the given state. Used in tests that need to
 * exercise a transition out of a non-initial state without going through the
 * FSM helpers (which would generate audit rows we don't want to count).
 */
export async function insertJob(
  pool: Pool,
  opts: {
    posterId: string;
    state?: string;
    description?: string;
    duesAmount?: string;
    recommendedPeopleCount?: number;
    workDate?: Date | null;
    perActiveDuesCredit?: Record<string, number> | null;
    rejectionReason?: string | null;
    cancellationReason?: string | null;
    disputeReason?: string | null;
  },
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO jobs (posted_by, description, dues_amount, recommended_people_count, state, work_date, per_active_dues_credit, rejection_reason, cancellation_reason, dispute_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      opts.posterId,
      opts.description ?? 'Test job',
      opts.duesAmount ?? '50.00',
      opts.recommendedPeopleCount ?? 3,
      opts.state ?? 'awaiting_moderation',
      opts.workDate ?? null,
      opts.perActiveDuesCredit ? JSON.stringify(opts.perActiveDuesCredit) : null,
      opts.rejectionReason ?? null,
      opts.cancellationReason ?? null,
      opts.disputeReason ?? null,
    ],
  );
  return rows[0]!.id;
}

export async function insertEnrollment(
  pool: Pool,
  jobId: string,
  activeId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO job_enrollments (job_id, active_id) VALUES ($1, $2)`,
    [jobId, activeId],
  );
}

export async function getJobState(pool: Pool, jobId: string): Promise<string | null> {
  const { rows } = await pool.query<{ state: string }>(
    `SELECT state FROM jobs WHERE id = $1`,
    [jobId],
  );
  return rows[0]?.state ?? null;
}

export interface AuditRow {
  fromState: string | null;
  toState: string;
  actorId: string | null;
  actorKind: string;
  note: string | null;
  createdAt: string;
}

export async function getAuditRows(pool: Pool, jobId: string): Promise<AuditRow[]> {
  const { rows } = await pool.query<{
    from_state: string | null;
    to_state: string;
    actor_id: string | null;
    actor_kind: string;
    note: string | null;
    created_at: string;
  }>(
    // Both audit rows in approveJob() share a tx and Postgres `now()`/`statement_timestamp()`.
    // Order by created_at primarily and ctid (physical insertion order within the tx) as a
    // tiebreaker so same-tx rows surface in insertion order.
    `SELECT from_state, to_state, actor_id, actor_kind, note, created_at
     FROM job_state_transitions WHERE job_id = $1 ORDER BY created_at, ctid`,
    [jobId],
  );
  return rows.map((r) => ({
    fromState: r.from_state,
    toState: r.to_state,
    actorId: r.actor_id,
    actorKind: r.actor_kind,
    note: r.note,
    createdAt: r.created_at,
  }));
}
