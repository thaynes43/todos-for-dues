import { db } from '@app/db';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Liveness + readiness probe.
 *
 * Returns 200 with `{ status: 'ok', db: true, version }` when a trivial
 * `SELECT 1` against the primary DB succeeds; otherwise 503 with
 * `{ status: 'degraded', db: false, version }`.
 *
 * Importing `db` does NOT construct the pg Pool — `@app/db` exports a
 * lazy Proxy (PLAN-002), so `unset DATABASE_URL && next build` is still
 * safe (the Pool is only constructed when a query is actually issued).
 */
export async function GET(): Promise<Response> {
  let dbOk = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const body = {
    status: dbOk ? 'ok' : 'degraded',
    version: process.env.APP_VERSION ?? 'dev',
    db: dbOk,
  };
  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
