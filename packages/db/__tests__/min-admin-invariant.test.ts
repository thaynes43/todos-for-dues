import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { startPostgres, type StartedPostgres } from '@app/test-utils';
import { runMigrations } from '../src/migrate';

interface PgError extends Error {
  code?: string;
}

async function expectFailureCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (err) {
    const e = err as PgError;
    expect(e.code, `expected ${code}, got ${e.code}: ${e.message}`).toBe(code);
    return;
  }
  throw new Error(`expected query to fail with ${code} but it succeeded`);
}

async function withTx<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
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

async function resetUsers(pool: Pool, opts: { adminEmail?: string } = {}): Promise<string> {
  // Delete all users in one transaction, then insert one Admin — trigger fires at COMMIT, count=1, passes.
  return withTx(pool, async (client) => {
    await client.query(`DELETE FROM users`);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (email, display_name, role, password_hash)
       VALUES ($1, 'Admin User', 'Admin', 'pw') RETURNING id`,
      [opts.adminEmail ?? 'admin@test.invalid'],
    );
    return rows[0]!.id;
  });
}

async function insertActive(client: PoolClient | Pool, email: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO users (email, display_name, role, password_hash)
     VALUES ($1, 'Active User', 'Active', 'pw') RETURNING id`,
    [email],
  );
  return rows[0]!.id;
}

describe('min-Admin invariant trigger', () => {
  let pg: StartedPostgres;
  let pool: Pool;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations({ databaseUrl: pg.url, env: {} });
    pool = new Pool({ connectionString: pg.url });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await pg?.stop();
  });

  beforeEach(async () => {
    await resetUsers(pool);
  });

  it('rejects demoting the only Admin (single statement)', async () => {
    await expectFailureCode(
      pool.query(`UPDATE users SET role = 'Active' WHERE role = 'Admin'`),
      '23514',
    );
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE role = 'Admin'`,
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('rejects DELETE of the only Admin', async () => {
    await expectFailureCode(pool.query(`DELETE FROM users WHERE role = 'Admin'`), '23514');
  });

  it('allows demote when 2+ Admins exist', async () => {
    // Insert a second Admin first (count becomes 2), then demote one.
    await pool.query(
      `INSERT INTO users (email, display_name, role, password_hash) VALUES ('admin2@test.invalid', 'Admin Two', 'Admin', 'pw')`,
    );
    await pool.query(
      `UPDATE users SET role = 'Active' WHERE email = 'admin2@test.invalid'`,
    );
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE role = 'Admin'`,
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('allows atomic swap of Admin in a single transaction (PRD-008 AC-05)', async () => {
    // Setup: one Admin (A), one Active (B). Atomic swap promotes B + demotes A.
    const bId = await insertActive(pool, 'b@test.invalid');

    await withTx(pool, async (client) => {
      // The trigger is DEFERRABLE INITIALLY DEFERRED — it fires at COMMIT, not per-row.
      // After both updates, admin_count is still 1 (B replaced A), so COMMIT succeeds.
      await client.query(`UPDATE users SET role = 'Admin' WHERE id = $1`, [bId]);
      await client.query(`UPDATE users SET role = 'Alumni' WHERE email = 'admin@test.invalid'`);
    });

    const { rows } = await pool.query<{ email: string; role: string }>(
      `SELECT email, role FROM users ORDER BY email`,
    );
    expect(rows).toEqual([
      { email: 'admin@test.invalid', role: 'Alumni' },
      { email: 'b@test.invalid', role: 'Admin' },
    ]);
  });

  it('rejects atomic swap that ends with 0 Admins', async () => {
    // Demote A and "promote" B to Active (not Admin). Count drops to 0 → trigger fails at COMMIT.
    await insertActive(pool, 'c@test.invalid');
    await expectFailureCode(
      withTx(pool, async (client) => {
        await client.query(`UPDATE users SET role = 'Alumni' WHERE role = 'Admin'`);
        // No promotion — net Admin count after COMMIT is 0.
      }),
      '23514',
    );
  });

  it('allows bootstrap recovery via single-transaction DELETE+INSERT', async () => {
    // Recovery scenario: there is 1 Admin, but we want to swap them out for a new one
    // (e.g., the original Admin lost access). DELETE old, INSERT new → count=1 at COMMIT.
    await withTx(pool, async (client) => {
      await client.query(`DELETE FROM users WHERE role = 'Admin'`);
      await client.query(
        `INSERT INTO users (email, display_name, role, password_hash)
         VALUES ('rescued@test.invalid', 'Rescue Admin', 'Admin', 'pw')`,
      );
    });
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE role = 'Admin'`,
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('records the trigger as a CONSTRAINT trigger', async () => {
    const { rows } = await pool.query<{
      tgname: string;
      tgconstraint: number;
      tgdeferrable: boolean;
      tginitdeferred: boolean;
    }>(
      `SELECT tgname, tgconstraint, tgdeferrable, tginitdeferred
       FROM pg_trigger WHERE tgname = 'trg_min_one_admin'`,
    );
    expect(rows[0]?.tgdeferrable).toBe(true);
    expect(rows[0]?.tginitdeferred).toBe(true);
  });
});
