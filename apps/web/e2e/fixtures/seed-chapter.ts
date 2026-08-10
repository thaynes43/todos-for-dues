import { Pool } from 'pg';
import { unsignedPortalIdToken } from './personas';

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
 * Rows are inserted directly (fast, idempotent) and PRE-LINKED: the
 * sigo-portal account row is seeded alongside the user so parallel workers'
 * simultaneous first sign-ins of a shared persona never race Better Auth's
 * account-linking unique constraint (and prod post-wipe has no linking path
 * anyway — every prod user is portal-created). The matching identity is
 * registered at the mock. Per-spec unique personas are seeded inside each
 * spec with UUID-suffixed emails (Trap 6 — workers > 1 safety).
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
  const userId =
    existing.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(
        `INSERT INTO users (email, display_name, role, email_verified)
         VALUES ($1, $2, $3, true) RETURNING id`,
        [email, displayName, role],
      )
    ).rows[0]!.id;
  const tier = role === 'Admin' ? 'admin' : 'operator';
  await pool.query(
    `INSERT INTO "account" (user_id, provider_id, account_id, id_token)
     VALUES ($1::uuid, 'sigo-portal', $1::uuid::text, $2)
     ON CONFLICT ON CONSTRAINT account_provider_account_unique DO NOTHING`,
    [userId, unsignedPortalIdToken({ sub: userId, email, name: displayName, tier })],
  );
  return userId;
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
