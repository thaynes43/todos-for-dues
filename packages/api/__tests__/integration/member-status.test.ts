import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { TRPCError } from '@trpc/server';
import {
  caller,
  makeCtx,
  resetAndSeedUsers,
  startTestDb,
  unauthedCtx,
  type SeedUsers,
  type TestDb,
} from './_setup';

/**
 * Boundary mock of the portal's member-status API (sigo-alumni item 07):
 * a real HTTP server standing in for sigoalumni.org, reached through the
 * OIDC_DISCOVERY_URL origin exactly like production. The tRPC router +
 * @app/auth client run unmodified against it.
 */

type PortalMode = 'ok' | 'missing-route' | 'not-implemented';

interface MockPortal {
  origin: string;
  mode: PortalMode;
  /** access token → registry status. Tokens absent here have NO registry row. */
  registry: Map<string, 'active' | 'alumni' | null>;
  requests: Array<{ method: string; auth: string | undefined }>;
  close: () => Promise<void>;
}

function startMockPortal(): Promise<MockPortal> {
  const state: Omit<MockPortal, 'origin' | 'close'> = {
    mode: 'ok',
    registry: new Map(),
    requests: [],
  };
  const server = http.createServer((req, res) => {
    const auth = req.headers['authorization'];
    state.requests.push({ method: req.method ?? '', auth });
    if (state.mode === 'missing-route' || req.url !== '/api/member/status') {
      // What the live portal serves today: the route does not exist.
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<!doctype html><h1>Not found</h1>');
      return;
    }
    if (state.mode === 'not-implemented') {
      res.writeHead(501).end();
      return;
    }
    const token = auth?.replace(/^Bearer /, '');
    if (!token || !state.registry.has(token)) {
      // Contract: no linked registry row → 404.
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'no registry row' }));
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: state.registry.get(token) ?? null }));
      return;
    }
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const parsed = JSON.parse(body) as { status?: unknown };
        if (parsed.status !== 'active' && parsed.status !== 'alumni') {
          res.writeHead(400).end();
          return;
        }
        state.registry.set(token, parsed.status);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: parsed.status }));
      });
      return;
    }
    res.writeHead(405).end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve(
        Object.assign(state, {
          origin: `http://127.0.0.1:${port}`,
          close: () => new Promise<void>((r) => server.close(() => r())),
        }),
      );
    });
  });
}

let testDb: TestDb;
let users: SeedUsers;
let portal: MockPortal;

const ALUMNI_TOKEN = 'tok-alumni';

beforeAll(async () => {
  testDb = await startTestDb();
  portal = await startMockPortal();
}, 180_000);

afterAll(async () => {
  await portal?.close();
  await testDb?.stop();
});

beforeEach(async () => {
  users = await resetAndSeedUsers(testDb.pool);
  portal.mode = 'ok';
  portal.registry.clear();
  portal.requests.length = 0;
  vi.stubEnv('OIDC_DISCOVERY_URL', `${portal.origin}/.well-known/openid-configuration`);
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // The alumni seed user has a portal account with a stored access token.
  await testDb.pool.query(
    `INSERT INTO "account" (user_id, provider_id, account_id, access_token)
     VALUES ($1::uuid, 'sigo-portal', $1::uuid::text, $2)`,
    [users.alumni, ALUMNI_TOKEN],
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('memberStatus.get', () => {
  it('undeclared registry row → available with status null', async () => {
    portal.registry.set(ALUMNI_TOKEN, null);
    const view = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).memberStatus.get();
    expect(view).toEqual({ available: true, status: null });
    expect(portal.requests.at(-1)?.auth).toBe(`Bearer ${ALUMNI_TOKEN}`);
  });

  it('declared registry row → available with the registry value', async () => {
    portal.registry.set(ALUMNI_TOKEN, 'active');
    const view = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).memberStatus.get();
    expect(view).toEqual({ available: true, status: 'active' });
  });

  it('no registry row (portal 404) → unavailable, control hidden', async () => {
    const view = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).memberStatus.get();
    expect(view).toEqual({ available: false });
  });

  it("route not built (today's live portal) → unavailable, feature inert", async () => {
    portal.mode = 'missing-route';
    const view = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).memberStatus.get();
    expect(view).toEqual({ available: false });
  });

  it('501 → unavailable', async () => {
    portal.mode = 'not-implemented';
    const view = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).memberStatus.get();
    expect(view).toEqual({ available: false });
  });

  it('user with no stored portal token → unavailable without hitting the portal', async () => {
    const view = await caller(
      makeCtx({ userId: users.active1, role: 'Active' }),
    ).memberStatus.get();
    expect(view).toEqual({ available: false });
    expect(portal.requests).toHaveLength(0);
  });

  it('portal unreachable → unavailable, not a thrown error', async () => {
    vi.stubEnv(
      'OIDC_DISCOVERY_URL',
      // Closed port: connection refused.
      'http://127.0.0.1:9/.well-known/openid-configuration',
    );
    const view = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).memberStatus.get();
    expect(view).toEqual({ available: false });
  });

  it('unauthenticated → UNAUTHORIZED', async () => {
    await expect(caller(unauthedCtx()).memberStatus.get()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('memberStatus.set', () => {
  it('writes through to the registry, then re-reads current truth', async () => {
    portal.registry.set(ALUMNI_TOKEN, 'active');
    const view = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).memberStatus.set({
      status: 'alumni',
    });
    expect(view).toEqual({ available: true, status: 'alumni' });
    expect(portal.registry.get(ALUMNI_TOKEN)).toBe('alumni');
    // PUT followed by a re-GET (contract: after PUT, re-read).
    expect(portal.requests.map((r) => r.method)).toEqual(['PUT', 'GET']);
  });

  it('no registry row → NOT_FOUND (client hides the control)', async () => {
    await expect(
      caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).memberStatus.set({
        status: 'active',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('portal 501 → SERVICE_UNAVAILABLE', async () => {
    portal.mode = 'not-implemented';
    await expect(
      caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).memberStatus.set({
        status: 'active',
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('rejects out-of-contract statuses at the input boundary', async () => {
    await expect(
      caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).memberStatus.set(
        // @ts-expect-error — contract allows only active | alumni
        { status: 'emeritus' },
      ),
    ).rejects.toBeInstanceOf(TRPCError);
    expect(portal.requests).toHaveLength(0);
  });

  it('unauthenticated → UNAUTHORIZED', async () => {
    await expect(
      caller(unauthedCtx()).memberStatus.set({ status: 'active' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('no durable status storage (item 07 invariant)', () => {
  it('a successful write leaves no status column or row behind in the app DB', async () => {
    portal.registry.set(ALUMNI_TOKEN, null);
    await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).memberStatus.set({
      status: 'alumni',
    });
    // No column named like status on users, and no table for it.
    const { rows: cols } = await testDb.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name ILIKE '%status%'`,
    );
    expect(cols).toEqual([]);
    const { rows: tables } = await testDb.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name ILIKE '%status%'`,
    );
    expect(tables).toEqual([]);
  });
});
