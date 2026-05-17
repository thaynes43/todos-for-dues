import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the lazy `db` Proxy so the route's `db.execute(sql`SELECT 1`)` call
// resolves (200/healthy) or throws (503/degraded) without touching pg.
vi.mock('@app/db', () => ({
  db: { execute: vi.fn() },
}));

async function loadRoute() {
  vi.resetModules();
  return import('../../app/api/health/route');
}

async function getMockedDb() {
  const mod = await import('@app/db');
  return mod.db as unknown as { execute: ReturnType<typeof vi.fn> };
}

afterEach(async () => {
  const dbMock = await getMockedDb();
  dbMock.execute.mockReset();
  vi.restoreAllMocks();
});

describe('GET /api/health', () => {
  it('returns 200 + status=ok when the DB ping succeeds', async () => {
    const dbMock = await getMockedDb();
    dbMock.execute.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe(true);
    expect(typeof body.version).toBe('string');
    expect(dbMock.execute).toHaveBeenCalledTimes(1);
  });

  it('returns 503 + status=degraded when the DB ping throws', async () => {
    const dbMock = await getMockedDb();
    dbMock.execute.mockRejectedValueOnce(new Error('connection refused'));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.db).toBe(false);
    expect(typeof body.version).toBe('string');
    expect(dbMock.execute).toHaveBeenCalledTimes(1);
  });
});
