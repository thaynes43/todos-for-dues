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

export async function truncateWalkingSkeleton(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE users, jobs, job_enrollments, job_state_transitions, user_role_transitions, invite_tokens, chapter_settings, "session", "account", "verification" RESTART IDENTITY CASCADE`,
  );
  // Seed a sentinel Admin so the DEFERRED min-Admin trigger doesn't fire when
  // subsequent inserts commit (PLAN-003 invariant: >= 1 Admin at all times).
  await pool.query(
    `INSERT INTO users (email, display_name, role, email_verified) VALUES ('sentinel-admin@walking.test', 'Sentinel', 'Admin', true)
     ON CONFLICT (email) DO NOTHING`,
  );
}

export async function seedPersona(
  pool: Pool,
  opts: { email: string; displayName: string; role: Role; password: string },
): Promise<SeededPersona> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, role, email_verified) VALUES ($1, $2, $3, true) RETURNING id`,
    [opts.email, opts.displayName, opts.role],
  );
  const userId = rows[0]!.id;
  const passwordHash = await hashPassword(opts.password);
  await pool.query(
    `INSERT INTO "account" (user_id, provider_id, account_id, password) VALUES ($1::uuid, 'credential', $1::uuid::text, $2)`,
    [userId, passwordHash],
  );
  return {
    id: userId,
    email: opts.email,
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
