import { Pool } from 'pg';
import { hashPassword } from '@better-auth/utils/password';

/**
 * One-time seed for the walking-skeleton + auth specs. Runs in globalSetup
 * after the migrations apply (so chapter_settings already has the BOOTSTRAP_*
 * env-driven defaults from migration 0004).
 *
 * Creates pre-authenticated personas the Playwright specs sign in as:
 *   - bootstrap Admin (matches BOOTSTRAP_ADMIN_EMAIL → idempotent re-promotion)
 *   - standing Moderator (used by the walking-skeleton chained spec)
 *
 * Per-spec unique personas (Alumni, Actives, additional Admins) are seeded
 * inside each spec with UUID-suffixed emails (Trap 6 — workers > 1 safety).
 */
export interface SeededFixtures {
  adminId: string;
  moderatorId: string;
}

export interface SeedFixturesOptions {
  databaseUrl: string;
  adminEmail: string;
  moderatorEmail: string;
  password: string;
}

export async function seedFixtures(
  opts: SeedFixturesOptions,
): Promise<SeededFixtures> {
  const pool = new Pool({ connectionString: opts.databaseUrl });
  try {
    const passwordHash = await hashPassword(opts.password);

    // Idempotent on email — re-running globalSetup against an existing DB just
    // returns existing ids.
    const adminId = await upsertCredentialUser(
      pool,
      opts.adminEmail,
      'Bootstrap Admin',
      'Admin',
      passwordHash,
    );
    const moderatorId = await upsertCredentialUser(
      pool,
      opts.moderatorEmail,
      'Standing Mod',
      'Moderator',
      passwordHash,
    );
    return { adminId, moderatorId };
  } finally {
    await pool.end();
  }
}

async function upsertCredentialUser(
  pool: Pool,
  email: string,
  displayName: string,
  role: 'Admin' | 'Moderator',
  passwordHash: string,
): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [email],
  );
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, role, email_verified)
     VALUES ($1, $2, $3, true) RETURNING id`,
    [email, displayName, role],
  );
  const userId = inserted.rows[0]!.id;
  await pool.query(
    `INSERT INTO "account" (user_id, provider_id, account_id, password)
     VALUES ($1::uuid, 'credential', $1::uuid::text, $2)`,
    [userId, passwordHash],
  );
  return userId;
}
