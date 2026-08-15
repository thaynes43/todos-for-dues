import { describe, expect, it } from 'vitest';
import { fetchMemberStatus, sendMemberStatus } from '../src/portal-client';

/**
 * ADR-015 response classification against a stubbed transport. Pinned to the
 * portal's shipped route contract: **409 JSON `{code:'no_registry_row'}`** is
 * the ONLY no-registry-row signal (route exists, user has no linked row); 404
 * is reserved for route-absent, so it — like 401/501/5xx/non-JSON — classifies
 * `unavailable` (portal down / not yet shipped). The old JSON-body-404
 * heuristic is gone.
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

  it('404 (any body) → unavailable — 404 is route-absent per the pin', async () => {
    // JSON error body no longer means no-registry-row (that is 409 now).
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
    ).resolves.toEqual({ kind: 'unavailable' });
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
  });

  it('409 JSON {code:no_registry_row} → no-registry-row (the only no-row signal)', async () => {
    await expect(
      fetchMemberStatus(
        BASE,
        TOKEN,
        stubFetch({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'no_registry_row' }),
        }),
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

  it('409 → no-registry-row; 404 (any body) → unavailable (route-absent)', async () => {
    await expect(
      sendMemberStatus(
        BASE,
        TOKEN,
        'active',
        stubFetch({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'no_registry_row' }),
        }),
      ),
    ).resolves.toEqual({ kind: 'no-registry-row' });
    // 404 is route-absent now — even with a JSON error body.
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
    ).resolves.toEqual({ kind: 'unavailable' });
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
