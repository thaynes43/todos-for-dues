import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { startPostgres, type StartedPostgres } from '@app/test-utils';
import { runMigrations } from '../src/migrate';
import { JOB_STATES, ROLES, INVITE_TOKEN_ROLES } from '../src/schema/enums';

const HERE = dirname(fileURLToPath(import.meta.url));
const INIT_SQL = readFileSync(join(HERE, '..', 'migrations', '0002_init.sql'), 'utf8');

describe('enums match generated migration CHECK lists', () => {
  it('JOB_STATES array matches jobs_state_enum CHECK', () => {
    const match = INIT_SQL.match(/jobs_state_enum.*ARRAY\[([^\]]+)\]/);
    expect(match, 'jobs_state_enum CHECK not found in init migration').not.toBeNull();
    const fromMigration = match![1]!
      .split(',')
      .map((s) => s.trim().replace(/^'/, '').replace(/'$/, ''));
    expect(fromMigration).toEqual([...JOB_STATES]);
  });

  it('ROLES array matches users_role_enum CHECK', () => {
    const match = INIT_SQL.match(/users_role_enum.*ARRAY\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const fromMigration = match![1]!
      .split(',')
      .map((s) => s.trim().replace(/^'/, '').replace(/'$/, ''));
    expect(fromMigration).toEqual([...ROLES]);
  });

  it('INVITE_TOKEN_ROLES array matches invite_tokens_role_non_privileged CHECK', () => {
    const match = INIT_SQL.match(/invite_tokens_role_non_privileged.*ARRAY\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const fromMigration = match![1]!
      .split(',')
      .map((s) => s.trim().replace(/^'/, '').replace(/'$/, ''));
    expect(fromMigration).toEqual([...INVITE_TOKEN_ROLES]);
  });
});

describe('enum values round-trip via insert', () => {
  let pg: StartedPostgres;
  let pool: Pool;
  let adminId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations({ databaseUrl: pg.url, env: {} });
    pool = new Pool({ connectionString: pg.url });
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, role, password_hash)
       VALUES ('enum-admin@test.invalid', 'Admin', 'Admin', 'pw') RETURNING id`,
    );
    adminId = rows[0]!.id;
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await pg?.stop();
  });

  it('inserts every ROLE value (except Admin which is already taken)', async () => {
    for (const role of ROLES) {
      if (role === 'Admin') continue;
      await pool.query(
        `INSERT INTO users (email, display_name, role, password_hash)
         VALUES ($1, 'Test', $2, 'pw')`,
        [`role-${role}@test.invalid`, role],
      );
    }
  });

  it('inserts every JOB_STATES value', async () => {
    for (const state of JOB_STATES) {
      await pool.query(
        `INSERT INTO jobs (posted_by, description, dues_amount, recommended_people_count, state)
         VALUES ($1, $2, '10.00', 1, $3)`,
        [adminId, `state-${state}`, state],
      );
    }
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM jobs`,
    );
    expect(Number(rows[0]?.count)).toBe(JOB_STATES.length);
  });
});
