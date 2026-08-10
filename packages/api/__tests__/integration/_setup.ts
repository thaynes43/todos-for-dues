import { Pool, type PoolClient } from 'pg';
import { startPostgres, type StartedPostgres } from '@app/test-utils';
import { getPool as getAppDbPool, db } from '@app/db';
import { runMigrations } from '@app/db/migrate';
import type { Role } from '@app/db/schema';
import { appRouter, type AppRouter } from '../../src/routers';
import { createCallerFactory, type TRPCContext } from '../../src/trpc';

export interface TestDb {
  pg: StartedPostgres;
  pool: Pool;
  stop: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
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
        // pool may not have been instantiated — ignore
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

export interface SeedUsers {
  admin: string;
  moderator: string;
  alumni: string;
  alumni2: string;
  active1: string;
  active2: string;
  active3: string;
}

export async function resetAndSeedUsers(pool: Pool): Promise<SeedUsers> {
  return withTx(pool, async (client) => {
    await client.query(
      `TRUNCATE users, jobs, job_enrollments, job_state_transitions, user_role_transitions, chapter_settings, "session", "account", "verification" RESTART IDENTITY CASCADE`,
    );
    const roster: Array<{ email: string; name: string; role: Role }> = [
      { email: 'admin@test.invalid', name: 'Admin Anne', role: 'Admin' },
      { email: 'mod@test.invalid', name: 'Mod Maya', role: 'Moderator' },
      { email: 'alumni@test.invalid', name: 'Alumni Adam', role: 'Alumni' },
      { email: 'alumni2@test.invalid', name: 'Alumni Beth', role: 'Alumni' },
      { email: 'active1@test.invalid', name: 'Alice Active', role: 'Active' },
      { email: 'active2@test.invalid', name: 'Bob Active', role: 'Active' },
      { email: 'active3@test.invalid', name: 'Carol Active', role: 'Active' },
    ];
    const ids: Record<string, string> = {};
    for (const u of roster) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [u.email, u.name, u.role],
      );
      ids[u.email] = rows[0]!.id;
    }
    return {
      admin: ids['admin@test.invalid']!,
      moderator: ids['mod@test.invalid']!,
      alumni: ids['alumni@test.invalid']!,
      alumni2: ids['alumni2@test.invalid']!,
      active1: ids['active1@test.invalid']!,
      active2: ids['active2@test.invalid']!,
      active3: ids['active3@test.invalid']!,
    };
  });
}

export function makeCtx(opts: {
  userId: string;
  role: Role;
}): TRPCContext {
  const fakeSession = {
    session: { id: `sess-${opts.userId}`, userId: opts.userId },
    user: { id: opts.userId, role: opts.role },
  } as unknown as TRPCContext['session'];
  return {
    db,
    session: fakeSession,
    userId: opts.userId,
    userRole: opts.role,
  };
}

export function unauthedCtx(): TRPCContext {
  return {
    db,
    session: null,
    userId: null,
    userRole: null,
  };
}

const callerFactory = createCallerFactory(appRouter);

export type Caller = ReturnType<typeof callerFactory>;

export function caller(ctx: TRPCContext): Caller {
  return callerFactory(ctx);
}

export type { AppRouter };

export async function insertJob(
  pool: Pool,
  opts: {
    posterId: string;
    state?: string;
    description?: string;
    duesAmount?: string;
    recommendedPeopleCount?: number;
    workDate?: Date | null;
    perActiveDuesCredit?: Record<string, string> | null;
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
}

export async function getAuditRows(pool: Pool, jobId: string): Promise<AuditRow[]> {
  const { rows } = await pool.query<{
    from_state: string | null;
    to_state: string;
    actor_id: string | null;
    actor_kind: string;
    note: string | null;
  }>(
    `SELECT from_state, to_state, actor_id, actor_kind, note
     FROM job_state_transitions WHERE job_id = $1 ORDER BY created_at, ctid`,
    [jobId],
  );
  return rows.map((r) => ({
    fromState: r.from_state,
    toState: r.to_state,
    actorId: r.actor_id,
    actorKind: r.actor_kind,
    note: r.note,
  }));
}

export async function getUserRole(pool: Pool, userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.role ?? null;
}
