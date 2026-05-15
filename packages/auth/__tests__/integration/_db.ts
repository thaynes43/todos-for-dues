import { Pool } from 'pg';
import { startPostgres, type StartedPostgres } from '@app/test-utils';
import { getPool as getAppDbPool } from '@app/db';
import { runMigrations } from '@app/db/migrate';

export interface AuthTestDb {
  pg: StartedPostgres;
  pool: Pool;
  stop: () => Promise<void>;
}

/**
 * Start a fresh PG16 testcontainer + run all migrations (including the new
 * Better Auth tables 0005/0006) + set DATABASE_URL so the lazy @app/db proxy
 * connects to this container. Returns a pool for direct SQL inserts in tests.
 */
export async function startAuthTestDb(): Promise<AuthTestDb> {
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
        // never instantiated
      }
      await pool.end();
      await pg.stop();
    },
  };
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE users, jobs, job_enrollments, job_state_transitions, user_role_transitions, invite_tokens, "session", "account", "verification" RESTART IDENTITY CASCADE`,
  );
}

export async function insertAdminBootstrap(
  pool: Pool,
  email = 'admin@bootstrap.test',
): Promise<string> {
  // Insert one Admin so the min-Admin trigger is satisfied for all subsequent
  // tx commits. Direct SQL bypasses the FSM helpers — only used for fixture setup.
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, role, email_verified) VALUES ($1, 'Admin Bootstrap', 'Admin', true) RETURNING id`,
    [email],
  );
  return rows[0]!.id;
}

export async function insertInviteToken(
  pool: Pool,
  opts: { token: string; preselectedRole: 'Active' | 'Alumni'; createdBy: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO invite_tokens (token, preselected_role, created_by) VALUES ($1, $2, $3)`,
    [opts.token, opts.preselectedRole, opts.createdBy],
  );
}

export async function revokeInviteToken(pool: Pool, token: string): Promise<void> {
  await pool.query(`UPDATE invite_tokens SET revoked_at = now() WHERE token = $1`, [token]);
}

export async function getUserRoleByEmail(
  pool: Pool,
  email: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM users WHERE email = $1`,
    [email],
  );
  return rows[0]?.role ?? null;
}

export async function getUserIdByEmail(
  pool: Pool,
  email: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [email],
  );
  return rows[0]?.id ?? null;
}

export async function countUsers(pool: Pool, email: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM users WHERE email = $1`,
    [email],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getAccountRows(
  pool: Pool,
  userId: string,
): Promise<Array<{ providerId: string; accountId: string; hasPassword: boolean }>> {
  const { rows } = await pool.query<{
    provider_id: string;
    account_id: string;
    password: string | null;
  }>(
    `SELECT provider_id, account_id, password FROM "account" WHERE user_id = $1 ORDER BY provider_id`,
    [userId],
  );
  return rows.map((r) => ({
    providerId: r.provider_id,
    accountId: r.account_id,
    hasPassword: r.password !== null,
  }));
}

export async function getRoleAuditRows(
  pool: Pool,
  userId: string,
): Promise<
  Array<{
    fromRole: string | null;
    toRole: string;
    initiatorKind: string;
    initiatorId: string | null;
    note: string | null;
  }>
> {
  const { rows } = await pool.query<{
    from_role: string | null;
    to_role: string;
    initiator_kind: string;
    initiator_id: string | null;
    note: string | null;
  }>(
    `SELECT from_role, to_role, initiator_kind, initiator_id, note FROM user_role_transitions WHERE user_id = $1 ORDER BY created_at, ctid`,
    [userId],
  );
  return rows.map((r) => ({
    fromRole: r.from_role,
    toRole: r.to_role,
    initiatorKind: r.initiator_kind,
    initiatorId: r.initiator_id,
    note: r.note,
  }));
}
