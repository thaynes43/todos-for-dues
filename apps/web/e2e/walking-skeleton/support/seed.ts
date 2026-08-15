import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import {
  registerPortalIdentity,
  resolvePersonaRole,
  tierForRole,
  unsignedPortalIdToken,
  type MemberStatus,
  type PersonaRole,
  type Role as DbRole,
} from '../../fixtures/personas';

// Legacy-friendly input type for specs ('Active'/'Alumni' → Member + status).
export type Role = PersonaRole;

export interface SeededPersona {
  id: string;
  email: string;
  displayName: string;
  /** Resolved DB role (Member | Moderator | Admin). */
  role: DbRole;
  /** Resolved portal member status (null for a bare Member/Moderator/Admin). */
  status: MemberStatus | null;
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
 * Insert a chapter member, PRE-LINKED to the portal (ADR-013 — sign-in is
 * portal SSO only): the user row, its `sigo-portal` account row (seeded
 * unsigned id_token; overwritten with a fresh signed one on each sign-in),
 * and the matching identity at the OIDC mock. Pre-linking mirrors prod
 * (post-wipe every user is portal-created — the linking path doesn't exist)
 * and avoids Better Auth's link race when parallel workers sign a shared
 * persona in for the first time simultaneously. The identity's tier follows
 * the role: Admin→admin, Moderator→operator, Alumni/Active→brother.
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
  // ADR-015: legacy 'Active'/'Alumni' → plain Member + portal status.
  const { dbRole, status } = resolvePersonaRole(opts.role);
  const tier = tierForRole(dbRole);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, role, email_verified) VALUES ($1, $2, $3, true) RETURNING id`,
    [email, opts.displayName, dbRole],
  );
  const userId = rows[0]!.id;
  await pool.query(
    `INSERT INTO "account" (user_id, provider_id, account_id, id_token)
     VALUES ($1::uuid, 'sigo-portal', $1::uuid::text, $2)`,
    [
      userId,
      unsignedPortalIdToken({ sub: userId, email, name: opts.displayName, tier }),
    ],
  );
  await registerPortalIdentity({
    email,
    name: opts.displayName,
    tier,
    sub: userId,
    status: status ?? undefined,
  });
  return {
    id: userId,
    email,
    displayName: opts.displayName,
    role: dbRole,
    status,
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
