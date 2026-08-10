import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let _pool: Pool | undefined;
let _db: DrizzleDb | undefined;

function getDb(): DrizzleDb {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required');
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // S-06 (AUDIT-2026-08): an idle client dropped by the server (e.g. a CNPG
    // failover's "terminating connection due to administrator command") emits
    // 'error' on the pool; with no listener that becomes an uncaughtException
    // and crashes the process. Log one terse line — never the client object,
    // which dumps the DSN shape — and let the pool replace the connection.
    _pool.on('error', (err) => {
      console.error(`[db] idle client error: ${err.message}`);
    });
    _db = drizzle(_pool, { schema });
  }
  return _db;
}

export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export function getPool(): Pool {
  void getDb();
  return _pool!;
}

export type Database = typeof db;

export * from './schema';
