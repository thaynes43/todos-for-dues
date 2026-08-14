import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEMBER_STATUSES,
  fetchMemberStatusFromPortal,
  getMemberStatus,
  memberStatusEndpoint,
  memberStatusFromClaims,
  parseMemberStatus,
  pushMemberStatusToPortal,
  setMemberStatus,
} from '../src/member-status';

const ENDPOINT = 'https://portal.test/api/member/status';
const TOKEN = 'access-token-123';

beforeEach(() => {
  // Keep expected-unavailable log lines out of the test output.
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fakeFetch(res: Response | Error): {
  fetch: typeof fetch;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (res instanceof Error) throw res;
    return res;
  }) as typeof fetch;
  return { fetch: impl, calls };
}

describe('parseMemberStatus (item 07 contract values)', () => {
  it('accepts exactly active and alumni', () => {
    for (const s of MEMBER_STATUSES) {
      expect(parseMemberStatus(s)).toBe(s);
    }
  });

  it('rejects everything else (fail closed)', () => {
    expect(parseMemberStatus('Active')).toBeNull();
    expect(parseMemberStatus('ALUMNI')).toBeNull();
    expect(parseMemberStatus('pending')).toBeNull();
    expect(parseMemberStatus('')).toBeNull();
    expect(parseMemberStatus(null)).toBeNull();
    expect(parseMemberStatus(undefined)).toBeNull();
    expect(parseMemberStatus(42)).toBeNull();
  });
});

describe('memberStatusFromClaims — status claim mapping', () => {
  it('present: reads the status claim next to tier/capabilities', () => {
    expect(
      memberStatusFromClaims({
        sub: 'u1',
        tier: 'brother',
        capabilities: [],
        status: 'alumni',
      }),
    ).toBe('alumni');
    expect(memberStatusFromClaims({ status: 'active' })).toBe('active');
  });

  it('absent: null-safe when the claim is missing (portal has not shipped it)', () => {
    expect(memberStatusFromClaims({ sub: 'u1', tier: 'brother' })).toBeNull();
  });

  it('null claim value = undeclared', () => {
    expect(memberStatusFromClaims({ status: null })).toBeNull();
  });

  it('unknown claim value reads as undeclared, not a crash', () => {
    expect(memberStatusFromClaims({ status: 'emeritus' })).toBeNull();
  });

  it('null claims (undecodable id_token) → null', () => {
    expect(memberStatusFromClaims(null)).toBeNull();
  });
});

describe('memberStatusEndpoint — derived from OIDC discovery plumbing', () => {
  it('uses the OIDC_DISCOVERY_URL origin, never a hardcoded host', () => {
    vi.stubEnv('OIDC_DISCOVERY_URL', 'https://sigoalumni.org/.well-known/openid-configuration');
    expect(memberStatusEndpoint()).toBe('https://sigoalumni.org/api/member/status');

    vi.stubEnv(
      'OIDC_DISCOVERY_URL',
      'https://frontpage-abc123.a.run.app/.well-known/openid-configuration',
    );
    expect(memberStatusEndpoint()).toBe('https://frontpage-abc123.a.run.app/api/member/status');
  });

  it('null when OIDC is unconfigured or the URL is invalid', () => {
    vi.stubEnv('OIDC_DISCOVERY_URL', '');
    expect(memberStatusEndpoint()).toBeNull();
    vi.stubEnv('OIDC_DISCOVERY_URL', 'not a url');
    expect(memberStatusEndpoint()).toBeNull();
  });
});

describe('fetchMemberStatusFromPortal — GET feature detection', () => {
  it('200 with a contract-shaped body → available', async () => {
    const { fetch, calls } = fakeFetch(jsonResponse({ status: 'active' }));
    const view = await fetchMemberStatusFromPortal(TOKEN, ENDPOINT, { fetch });
    expect(view).toEqual({ available: true, status: 'active' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(ENDPOINT);
    expect(calls[0]!.init?.method).toBe('GET');
    expect((calls[0]!.init?.headers as Record<string, string>)['authorization']).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it('200 with status null → available, undeclared', async () => {
    const { fetch } = fakeFetch(jsonResponse({ status: null }));
    expect(await fetchMemberStatusFromPortal(TOKEN, ENDPOINT, { fetch })).toEqual({
      available: true,
      status: null,
    });
  });

  it('404 (missing route OR no registry row) → unavailable', async () => {
    const { fetch } = fakeFetch(new Response('Not found', { status: 404 }));
    expect(await fetchMemberStatusFromPortal(TOKEN, ENDPOINT, { fetch })).toEqual({
      available: false,
    });
  });

  it.each([409, 501, 500, 401])('%i → unavailable', async (status) => {
    const { fetch } = fakeFetch(new Response('nope', { status }));
    expect(await fetchMemberStatusFromPortal(TOKEN, ENDPOINT, { fetch })).toEqual({
      available: false,
    });
  });

  it('200 with an HTML body (SPA fallback page) → unavailable', async () => {
    const { fetch } = fakeFetch(
      new Response('<!doctype html><h1>Sigo</h1>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    expect(await fetchMemberStatusFromPortal(TOKEN, ENDPOINT, { fetch })).toEqual({
      available: false,
    });
  });

  it('200 JSON without a status key → unavailable', async () => {
    const { fetch } = fakeFetch(jsonResponse({ ok: true }));
    expect(await fetchMemberStatusFromPortal(TOKEN, ENDPOINT, { fetch })).toEqual({
      available: false,
    });
  });

  it('200 with an out-of-contract status value → unavailable (fail closed)', async () => {
    const { fetch } = fakeFetch(jsonResponse({ status: 'emeritus' }));
    expect(await fetchMemberStatusFromPortal(TOKEN, ENDPOINT, { fetch })).toEqual({
      available: false,
    });
  });

  it('network failure → unavailable', async () => {
    const { fetch } = fakeFetch(new Error('ETIMEDOUT'));
    expect(await fetchMemberStatusFromPortal(TOKEN, ENDPOINT, { fetch })).toEqual({
      available: false,
    });
  });
});

describe('pushMemberStatusToPortal — PUT', () => {
  it('sends the contract body with bearer auth and reports ok', async () => {
    const { fetch, calls } = fakeFetch(jsonResponse({ status: 'alumni' }));
    const result = await pushMemberStatusToPortal(TOKEN, ENDPOINT, 'alumni', {
      fetch,
    });
    expect(result).toEqual({ ok: true });
    expect(calls[0]!.init?.method).toBe('PUT');
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ status: 'alumni' }));
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers['authorization']).toBe(`Bearer ${TOKEN}`);
    expect(headers['content-type']).toBe('application/json');
  });

  it('204 → ok', async () => {
    const { fetch } = fakeFetch(new Response(null, { status: 204 }));
    expect(await pushMemberStatusToPortal(TOKEN, ENDPOINT, 'active', { fetch })).toEqual({
      ok: true,
    });
  });

  it.each([404, 409])(
    '%i → no-registry-row (contract: user has no linked registry row)',
    async (status) => {
      const { fetch } = fakeFetch(new Response('no row', { status }));
      expect(await pushMemberStatusToPortal(TOKEN, ENDPOINT, 'active', { fetch })).toEqual({
        ok: false,
        reason: 'no-registry-row',
      });
    },
  );

  it.each([500, 501, 401])('%i → unavailable', async (status) => {
    const { fetch } = fakeFetch(new Response('nope', { status }));
    expect(await pushMemberStatusToPortal(TOKEN, ENDPOINT, 'active', { fetch })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('network failure → unavailable', async () => {
    const { fetch } = fakeFetch(new Error('ECONNREFUSED'));
    expect(await pushMemberStatusToPortal(TOKEN, ENDPOINT, 'active', { fetch })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});

describe('getMemberStatus / setMemberStatus without OIDC configured', () => {
  it('read is unavailable and never touches the network', async () => {
    vi.stubEnv('OIDC_DISCOVERY_URL', '');
    const { fetch, calls } = fakeFetch(jsonResponse({ status: 'active' }));
    expect(await getMemberStatus('user-1', { fetch })).toEqual({
      available: false,
    });
    expect(calls).toHaveLength(0);
  });

  it('write is unavailable and never touches the network', async () => {
    vi.stubEnv('OIDC_DISCOVERY_URL', '');
    const { fetch, calls } = fakeFetch(jsonResponse({ status: 'active' }));
    expect(await setMemberStatus('user-1', 'alumni', { fetch })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(calls).toHaveLength(0);
  });
});
