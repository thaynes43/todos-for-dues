import { Pool } from 'pg';

/**
 * One-time seed for the e2e suite. Runs in globalSetup after the migrations
 * apply (so chapter_settings already has the BOOTSTRAP_* env-driven defaults
 * from migration 0004) and after the portal mock is up (identities register
 * against it).
 *
 * Creates pre-linked portal personas the Playwright specs sign in as:
 *   - chapter Admin (portal tier `admin`)
 *   - standing Moderator (portal tier `operator`)
 *
 * Rows are inserted directly (fast, idempotent); the matching portal
 * identity is registered at the mock so `signInAs` links the sigo-portal
 * account on first sign-in (ADR-013 — no credential accounts exist anymore).
 * Per-spec unique personas are seeded inside each spec with UUID-suffixed
 * emails (Trap 6 — workers > 1 safety).
 */
export interface SeededFixtures {
  adminId: string;
  moderatorId: string;
}

export interface SeedFixturesOptions {
  databaseUrl: string;
  adminEmail: string;
  moderatorEmail: string;
  /** Base URL of the portal-shaped OIDC mock. */
  portalMockUrl: string;
}

export async function seedFixtures(
  opts: SeedFixturesOptions,
): Promise<SeededFixtures> {
  const pool = new Pool({ connectionString: opts.databaseUrl });
  try {
    const adminId = await upsertUser(
      pool,
      opts.adminEmail,
      'Chapter Admin',
      'Admin',
    );
    const moderatorId = await upsertUser(
      pool,
      opts.moderatorEmail,
      'Standing Mod',
      'Moderator',
    );
    await registerIdentity(opts.portalMockUrl, {
      email: opts.adminEmail,
      name: 'Chapter Admin',
      tier: 'admin',
      sub: adminId,
    });
    await registerIdentity(opts.portalMockUrl, {
      email: opts.moderatorEmail,
      name: 'Standing Mod',
      tier: 'operator',
      sub: moderatorId,
    });
    return { adminId, moderatorId };
  } finally {
    await pool.end();
  }
}

async function upsertUser(
  pool: Pool,
  email: string,
  displayName: string,
  role: 'Admin' | 'Moderator',
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
  return inserted.rows[0]!.id;
}

async function registerIdentity(
  portalMockUrl: string,
  identity: { email: string; name: string; tier: string; sub: string },
): Promise<void> {
  const res = await fetch(`${portalMockUrl}/_test/identity`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(identity),
  });
  if (!res.ok) {
    throw new Error(`portal mock identity registration failed (${res.status})`);
  }
}
