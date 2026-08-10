import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { registerPortalIdentity, tierForRole } from '../../fixtures/personas';

export type Role = 'Active' | 'Alumni' | 'Moderator' | 'Admin';

export interface SeededPersona {
  id: string;
  email: string;
  displayName: string;
  role: Role;
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

/**
 * Insert a chapter member and register the matching portal identity at the
 * OIDC mock (ADR-013 — sign-in is portal SSO only; the sigo-portal account
 * row links on the persona's first `signInAs`). The identity's tier follows
 * the role: Admin→admin, Moderator→operator, Alumni/Active→brother.
 *
 */
export async function seedPersona(
  pool: Pool,
  opts: {
    email: string;
    displayName: string;
    role: Role;
  },
): Promise<SeededPersona> {
  const email = uniqueEmail(opts.email);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, role, email_verified) VALUES ($1, $2, $3, true) RETURNING id`,
    [email, opts.displayName, opts.role],
  );
  const userId = rows[0]!.id;
  await registerPortalIdentity({
    email,
    name: opts.displayName,
    tier: tierForRole(opts.role),
    sub: userId,
  });
  return {
    id: userId,
    email,
    displayName: opts.displayName,
    role: opts.role,
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
