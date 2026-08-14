import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  getMemberStatus,
  readMemberStatusClaim,
  readPortalAccessToken,
  setMemberStatus,
} from '../../src';
import { startAuthTestDb, truncateAll, type AuthTestDb } from './_db';

let testDb: AuthTestDb;

beforeAll(async () => {
  testDb = await startAuthTestDb();
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  await truncateAll(testDb.pool);
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Unsigned JWT — decodeJwtClaims never verifies (see claim-sync tests). */
function fakeIdToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

async function insertUser(pool: Pool, email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, role, email_verified)
     VALUES ($1, 'Member Status User', 'Alumni', true) RETURNING id`,
    [email],
  );
  return rows[0]!.id;
}

async function insertPortalAccount(
  pool: Pool,
  opts: {
    userId: string;
    claims?: Record<string, unknown>;
    accessToken?: string | null;
    providerId?: string;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO "account" (user_id, provider_id, account_id, id_token, access_token)
     VALUES ($1::uuid, $2, $1::uuid::text, $3, $4)`,
    [
      opts.userId,
      opts.providerId ?? 'sigo-portal',
      opts.claims ? fakeIdToken({ sub: opts.userId, tier: 'brother', ...opts.claims }) : null,
      opts.accessToken ?? null,
    ],
  );
}

describe('readMemberStatusClaim — id_token status snapshot (item 07)', () => {
  it('present: status claim next to tier reaches the session context', async () => {
    const id = await insertUser(testDb.pool, 'has-status@sigo.test');
    await insertPortalAccount(testDb.pool, {
      userId: id,
      claims: { status: 'alumni', capabilities: [] },
    });
    expect(await readMemberStatusClaim(id)).toBe('alumni');
  });

  it('absent: id_token without the claim → null (portal has not shipped it)', async () => {
    const id = await insertUser(testDb.pool, 'no-status@sigo.test');
    await insertPortalAccount(testDb.pool, { userId: id, claims: {} });
    expect(await readMemberStatusClaim(id)).toBeNull();
  });

  it('no portal account row → null', async () => {
    const id = await insertUser(testDb.pool, 'no-account@sigo.test');
    expect(await readMemberStatusClaim(id)).toBeNull();
  });

  it('out-of-contract claim value → null (fail closed)', async () => {
    const id = await insertUser(testDb.pool, 'weird-status@sigo.test');
    await insertPortalAccount(testDb.pool, {
      userId: id,
      claims: { status: 'emeritus' },
    });
    expect(await readMemberStatusClaim(id)).toBeNull();
  });

  it('ignores accounts from other providers', async () => {
    const id = await insertUser(testDb.pool, 'other-provider@sigo.test');
    await insertPortalAccount(testDb.pool, {
      userId: id,
      claims: { status: 'active' },
      providerId: 'not-the-portal',
    });
    expect(await readMemberStatusClaim(id)).toBeNull();
  });
});

describe('readPortalAccessToken — Better Auth stored provider token', () => {
  it('returns the stored access token', async () => {
    const id = await insertUser(testDb.pool, 'token@sigo.test');
    await insertPortalAccount(testDb.pool, {
      userId: id,
      claims: {},
      accessToken: 'portal-access-token',
    });
    expect(await readPortalAccessToken(id)).toBe('portal-access-token');
  });

  it('null when no token is stored', async () => {
    const id = await insertUser(testDb.pool, 'no-token@sigo.test');
    await insertPortalAccount(testDb.pool, { userId: id, claims: {} });
    expect(await readPortalAccessToken(id)).toBeNull();
  });
});

describe('getMemberStatus / setMemberStatus — stored token → portal call', () => {
  it('GET authenticates with the stored access token against the discovery origin', async () => {
    vi.stubEnv('OIDC_DISCOVERY_URL', 'https://portal.test/.well-known/openid-configuration');
    const id = await insertUser(testDb.pool, 'get@sigo.test');
    await insertPortalAccount(testDb.pool, {
      userId: id,
      claims: {},
      accessToken: 'tok-get',
    });
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetch = (async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ status: 'active' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    expect(await getMemberStatus(id, { fetch })).toEqual({
      available: true,
      status: 'active',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://portal.test/api/member/status');
    expect((calls[0]!.init?.headers as Record<string, string>)['authorization']).toBe(
      'Bearer tok-get',
    );
  });

  it('PUT writes through with the stored token and the contract body', async () => {
    vi.stubEnv('OIDC_DISCOVERY_URL', 'https://portal.test/.well-known/openid-configuration');
    const id = await insertUser(testDb.pool, 'put@sigo.test');
    await insertPortalAccount(testDb.pool, {
      userId: id,
      claims: {},
      accessToken: 'tok-put',
    });
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetch = (async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    }) as typeof globalThis.fetch;

    expect(await setMemberStatus(id, 'alumni', { fetch })).toEqual({
      ok: true,
    });
    expect(calls[0]!.init?.method).toBe('PUT');
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ status: 'alumni' }));
    expect((calls[0]!.init?.headers as Record<string, string>)['authorization']).toBe(
      'Bearer tok-put',
    );
  });

  it('no stored token → unavailable without a network call', async () => {
    vi.stubEnv('OIDC_DISCOVERY_URL', 'https://portal.test/.well-known/openid-configuration');
    const id = await insertUser(testDb.pool, 'tokenless@sigo.test');
    const fetch = (async () => {
      throw new Error('should not be called');
    }) as unknown as typeof globalThis.fetch;
    expect(await getMemberStatus(id, { fetch })).toEqual({ available: false });
    expect(await setMemberStatus(id, 'active', { fetch })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});
