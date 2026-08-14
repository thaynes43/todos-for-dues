import { describe, expect, it } from 'vitest';
import { fetchMemberStatus, sendMemberStatus } from '../src/portal-client';

/**
 * ADR-014 feature-detection heuristics against a stubbed transport. The
 * classification is the load-bearing part of the contract's tolerant
 * reading: route-404 ⇒ unavailable (portal hasn't shipped the endpoint),
 * JSON-error-404 / 409 ⇒ no-registry-row (route exists, user has no row).
 */

type StubResponse = {
  status: number;
  contentType?: string;
  body?: string;
};

function stubFetch(response: StubResponse) {
  return async () => ({
    status: response.status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type'
          ? (response.contentType ?? null)
          : null,
    },
    text: async () => response.body ?? '',
  });
}

function refusingFetch() {
  return async () => {
    throw new TypeError('fetch failed: ECONNREFUSED');
  };
}

const BASE = 'https://portal.test';
const TOKEN = 'at-test';

describe('fetchMemberStatus — GET /api/member/status classification', () => {
  it('200 with a declared status → ok', async () => {
    await expect(
      fetchMemberStatus(
        BASE,
        TOKEN,
        stubFetch({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'active' }),
        }),
      ),
    ).resolves.toEqual({ kind: 'ok', status: 'active' });
    await expect(
      fetchMemberStatus(
        BASE,
        TOKEN,
        stubFetch({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'alumni' }),
        }),
      ),
    ).resolves.toEqual({ kind: 'ok', status: 'alumni' });
  });

  it('200 with null (or absent) status → undeclared', async () => {
    await expect(
      fetchMemberStatus(
        BASE,
        TOKEN,
        stubFetch({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: null }),
        }),
      ),
    ).resolves.toEqual({ kind: 'undeclared' });
    await expect(
      fetchMemberStatus(
        BASE,
        TOKEN,
        stubFetch({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        }),
      ),
    ).resolves.toEqual({ kind: 'undeclared' });
  });

  it('200 with an unrecognized status value → unavailable (contract drift stays dormant)', async () => {
    await expect(
      fetchMemberStatus(
        BASE,
        TOKEN,
        stubFetch({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'emeritus' }),
        }),
      ),
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('404 with a JSON error body → no-registry-row (route exists, no linked row)', async () => {
    await expect(
      fetchMemberStatus(
        BASE,
        TOKEN,
        stubFetch({
          status: 404,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ error: 'no_registry_row' }),
        }),
      ),
    ).resolves.toEqual({ kind: 'no-registry-row' });
  });

  it('404 without a JSON error body → unavailable (route-level 404, portal not shipped)', async () => {
    await expect(
      fetchMemberStatus(
        BASE,
        TOKEN,
        stubFetch({ status: 404, contentType: 'text/html', body: '<h1>404</h1>' }),
      ),
    ).resolves.toEqual({ kind: 'unavailable' });
    await expect(
      fetchMemberStatus(BASE, TOKEN, stubFetch({ status: 404 })),
    ).resolves.toEqual({ kind: 'unavailable' });
    // JSON content-type but not an error-shaped object still reads as route-level.
    await expect(
      fetchMemberStatus(
        BASE,
        TOKEN,
        stubFetch({
          status: 404,
          contentType: 'application/json',
          body: '"Not Found"',
        }),
      ),
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('409 → no-registry-row (contract: 404/409 for users with no linked row)', async () => {
    await expect(
      fetchMemberStatus(
        BASE,
        TOKEN,
        stubFetch({ status: 409, contentType: 'application/json', body: '{}' }),
      ),
    ).resolves.toEqual({ kind: 'no-registry-row' });
  });

  it('501 / 5xx / auth failures → unavailable (feature off, never guess)', async () => {
    for (const status of [501, 500, 502, 401, 403]) {
      await expect(
        fetchMemberStatus(BASE, TOKEN, stubFetch({ status })),
      ).resolves.toEqual({ kind: 'unavailable' });
    }
  });

  it('network refusal → unavailable', async () => {
    await expect(
      fetchMemberStatus(BASE, TOKEN, refusingFetch()),
    ).resolves.toEqual({ kind: 'unavailable' });
  });
});

describe('sendMemberStatus — PUT /api/member/status classification', () => {
  it('2xx → ok', async () => {
    await expect(
      sendMemberStatus(
        BASE,
        TOKEN,
        'alumni',
        stubFetch({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'alumni' }),
        }),
      ),
    ).resolves.toEqual({ kind: 'ok' });
    await expect(
      sendMemberStatus(BASE, TOKEN, 'active', stubFetch({ status: 204 })),
    ).resolves.toEqual({ kind: 'ok' });
  });

  it('404 JSON-error / 409 → no-registry-row; route-404 → unavailable', async () => {
    await expect(
      sendMemberStatus(
        BASE,
        TOKEN,
        'active',
        stubFetch({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'no_registry_row' }),
        }),
      ),
    ).resolves.toEqual({ kind: 'no-registry-row' });
    await expect(
      sendMemberStatus(
        BASE,
        TOKEN,
        'active',
        stubFetch({ status: 409, contentType: 'application/json', body: '{}' }),
      ),
    ).resolves.toEqual({ kind: 'no-registry-row' });
    await expect(
      sendMemberStatus(BASE, TOKEN, 'active', stubFetch({ status: 404 })),
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('network refusal / 501 → unavailable', async () => {
    await expect(
      sendMemberStatus(BASE, TOKEN, 'active', refusingFetch()),
    ).resolves.toEqual({ kind: 'unavailable' });
    await expect(
      sendMemberStatus(BASE, TOKEN, 'active', stubFetch({ status: 501 })),
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('sends the contract body shape', async () => {
    let seen: { url?: string; method?: string; body?: string } = {};
    const spy = async (
      url: string,
      init: { method: string; body?: string; headers: Record<string, string> },
    ) => {
      seen = { url, method: init.method, body: init.body };
      return {
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => '{"status":"active"}',
      };
    };
    await sendMemberStatus(BASE, TOKEN, 'active', spy);
    expect(seen.url).toBe('https://portal.test/api/member/status');
    expect(seen.method).toBe('PUT');
    expect(JSON.parse(seen.body ?? '{}')).toEqual({ status: 'active' });
  });
});
