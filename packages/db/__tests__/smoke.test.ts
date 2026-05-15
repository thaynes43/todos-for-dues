import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { startPostgres, type StartedPostgres } from '@app/test-utils';

describe('packages/db smoke', () => {
  let pg: StartedPostgres;
  let pool: Pool;

  beforeAll(async () => {
    pg = await startPostgres();
    pool = new Pool({ connectionString: pg.url });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await pg?.stop();
  });

  it('connects to Postgres and SELECT 1 returns 1', async () => {
    const result = await pool.query<{ one: number }>('SELECT 1::int AS one');
    expect(result.rows[0]?.one).toBe(1);
  });
});
