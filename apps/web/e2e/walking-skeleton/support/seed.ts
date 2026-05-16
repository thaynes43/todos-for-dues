import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { hashPassword } from '@better-auth/utils/password';

export type Role = 'Active' | 'Alumni' | 'Moderator' | 'Admin';

export interface SeededPersona {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  password: string;
}

export function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL must be set for walking-skeleton specs.');
  }
  return new Pool({ connectionString: url });
}

/**
 * Historically a TRUNCATE of the walking-skeleton tables. PLAN-008 Trap 6:
 * truncating between specs breaks `--workers > 1` because other workers'
 * fixtures get wiped mid-flight. Each spec now uses UUID-suffixed identifiers
 * (handled inside `seedPersona`), so wholesale truncation is unnecessary —
 * this stays as a no-op to preserve the existing call sites.
 */
export async function truncateWalkingSkeleton(_pool: Pool): Promise<void> {
  // intentionally empty — see comment above
}

function uniqueEmail(email: string): string {
  if (!email.includes('@')) return `${email}+${randomUUID()}`;
  const [local, domain] = email.split('@', 2);
  return `${local}+${randomUUID()}@${domain}`;
}

export async function seedPersona(
  pool: Pool,
  opts: { email: string; displayName: string; role: Role; password: string },
): Promise<SeededPersona> {
  const email = uniqueEmail(opts.email);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, role, email_verified) VALUES ($1, $2, $3, true) RETURNING id`,
    [email, opts.displayName, opts.role],
  );
  const userId = rows[0]!.id;
  const passwordHash = await hashPassword(opts.password);
  await pool.query(
    `INSERT INTO "account" (user_id, provider_id, account_id, password) VALUES ($1::uuid, 'credential', $1::uuid::text, $2)`,
    [userId, passwordHash],
  );
  return {
    id: userId,
    email,
    displayName: opts.displayName,
    role: opts.role,
    password: opts.password,
  };
}

export async function setChapterSetting(
  pool: Pool,
  key: string,
  value: unknown,
): Promise<void> {
  await pool.query(
    `INSERT INTO chapter_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function getJobIdByDescription(
  pool: Pool,
  description: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM jobs WHERE description = $1 ORDER BY created_at DESC LIMIT 1`,
    [description],
  );
  return rows[0]?.id ?? null;
}

export async function getJobState(
  pool: Pool,
  jobId: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ state: string }>(
    `SELECT state FROM jobs WHERE id = $1`,
    [jobId],
  );
  return rows[0]?.state ?? null;
}
