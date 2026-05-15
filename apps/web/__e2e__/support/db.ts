import { Pool } from 'pg';

/**
 * A throwaway PG client for Playwright specs to seed invite tokens, fabricate
 * test users, and assert post-action DB state. Reads DATABASE_URL from the
 * environment (same one the dev server uses).
 */
export function createTestPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL must be set for Playwright auth specs (point at the same DB the dev server uses).',
    );
  }
  return new Pool({ connectionString: databaseUrl });
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE users, jobs, job_enrollments, job_state_transitions, user_role_transitions, invite_tokens, "session", "account", "verification" RESTART IDENTITY CASCADE`,
  );
}

export async function seedBootstrapAdmin(
  pool: Pool,
  email = 'admin@bootstrap.test',
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, role, email_verified) VALUES ($1, 'Admin Bootstrap', 'Admin', true) RETURNING id`,
    [email],
  );
  return rows[0]!.id;
}

export async function seedInviteToken(
  pool: Pool,
  opts: { token: string; preselectedRole: 'Active' | 'Alumni'; createdBy: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO invite_tokens (token, preselected_role, created_by) VALUES ($1, $2, $3)`,
    [opts.token, opts.preselectedRole, opts.createdBy],
  );
}

export async function revokeInviteToken(pool: Pool, token: string): Promise<void> {
  await pool.query(`UPDATE invite_tokens SET revoked_at = now() WHERE token = $1`, [
    token,
  ]);
}

export async function getUserByEmail(
  pool: Pool,
  email: string,
): Promise<{ id: string; role: string } | null> {
  const { rows } = await pool.query<{ id: string; role: string }>(
    `SELECT id, role FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function getAccountRowsByEmail(
  pool: Pool,
  email: string,
): Promise<Array<{ providerId: string; accountId: string }>> {
  const { rows } = await pool.query<{ provider_id: string; account_id: string }>(
    `SELECT a.provider_id, a.account_id FROM "account" a
     JOIN users u ON u.id = a.user_id WHERE u.email = $1 ORDER BY a.provider_id`,
    [email],
  );
  return rows.map((r) => ({ providerId: r.provider_id, accountId: r.account_id }));
}

export async function getRoleAuditByEmail(
  pool: Pool,
  email: string,
): Promise<
  Array<{ fromRole: string | null; toRole: string; initiatorKind: string }>
> {
  const { rows } = await pool.query<{
    from_role: string | null;
    to_role: string;
    initiator_kind: string;
  }>(
    `SELECT urt.from_role, urt.to_role, urt.initiator_kind FROM user_role_transitions urt
     JOIN users u ON u.id = urt.user_id WHERE u.email = $1
     ORDER BY urt.created_at, urt.ctid`,
    [email],
  );
  return rows.map((r) => ({
    fromRole: r.from_role,
    toRole: r.to_role,
    initiatorKind: r.initiator_kind,
  }));
}
