import {
  memberStatusUrl,
  parseMemberStatus,
  resolvePortalApiBaseUrl,
  type MemberStatus,
} from './portal-status';
import { PORTAL_PROVIDER_ID } from './portal-tiers';

/**
 * Server-side client for the portal's member-status API (ADR-014 /
 * sigo-alumni backlog item 07):
 *
 *   GET <portal>/api/member/status            → { status: 'active'|'alumni'|null }
 *   PUT <portal>/api/member/status            body { status: 'active'|'alumni' }
 *
 * Both authenticated with the user's OIDC access token from sign-in. The
 * portal side ships post-8/17 — until the route exists every call resolves
 * to `{ kind: 'unavailable' }` and the app falls back to local-only
 * Active/Alumni self-service, so nothing here blocks on the portal.
 *
 * Feature detection / 404 disambiguation (contract ambiguity, tolerant
 * reading): the contract's 404 for "no linked registry row" is
 * indistinguishable at the status-code level from a route-level 404 on a
 * portal that hasn't shipped the endpoint yet. Heuristic: a 404 whose body
 * is JSON with an `error`/`code`/`message` field is an APPLICATION 404 from
 * an existing route ⇒ `no-registry-row`; anything else (HTML error page,
 * empty body, plain text) is a ROUTE-LEVEL 404 ⇒ `unavailable` (feature
 * off). 409 is unambiguous (`no-registry-row`); 501 and network refusal ⇒
 * `unavailable`.
 */

export type MemberStatusReadResult =
  | { kind: 'ok'; status: MemberStatus }
  | { kind: 'undeclared' }
  | { kind: 'no-registry-row' }
  | { kind: 'unavailable' };

export type MemberStatusWriteResult =
  | { kind: 'ok' }
  | { kind: 'no-registry-row' }
  | { kind: 'unavailable' };

type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/** Upstream timeout — the profile page must not hang on a dead portal. */
const PORTAL_TIMEOUT_MS = 5_000;

function isJsonObjectWithErrorField(
  contentType: string | null,
  body: string,
): boolean {
  if (!contentType?.toLowerCase().includes('json')) return false;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return false;
    return 'error' in parsed || 'code' in parsed || 'message' in parsed;
  } catch {
    return false;
  }
}

function classifyFailure(
  status: number,
  contentType: string | null,
  body: string,
): 'no-registry-row' | 'unavailable' {
  if (status === 409) return 'no-registry-row';
  if (status === 404) {
    // Route-404 vs no-row-404 heuristic — see module doc.
    return isJsonObjectWithErrorField(contentType, body)
      ? 'no-registry-row'
      : 'unavailable';
  }
  // 501 (not implemented), auth failures, 5xx, anything unexpected: keep the
  // portal-backed path dormant rather than guessing.
  return 'unavailable';
}

/**
 * GET the member's current status. Pure transport + classification — token
 * acquisition lives in `getMemberStatus`; `fetchImpl` is injectable for unit
 * tests.
 */
export async function fetchMemberStatus(
  portalBaseUrl: string,
  accessToken: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<MemberStatusReadResult> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(memberStatusUrl(portalBaseUrl), {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(PORTAL_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'unavailable' }; // network refusal / timeout ⇒ feature off
  }
  const body = await res.text().catch(() => '');
  if (res.status === 200) {
    try {
      const parsed = JSON.parse(body) as { status?: unknown };
      const status = parseMemberStatus(parsed.status);
      if (status) return { kind: 'ok', status };
      // Tolerant reading: 200 with `status: null` (or absent) = linked row,
      // nothing declared yet.
      if (parsed.status === null || parsed.status === undefined) {
        return { kind: 'undeclared' };
      }
      return { kind: 'unavailable' }; // unrecognized value ⇒ contract drift, stay dormant
    } catch {
      return { kind: 'unavailable' };
    }
  }
  return { kind: classifyFailure(res.status, res.headers.get('content-type'), body) };
}

/** PUT a new status. Same auth + classification as the GET. */
export async function sendMemberStatus(
  portalBaseUrl: string,
  accessToken: string,
  status: MemberStatus,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<MemberStatusWriteResult> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(memberStatusUrl(portalBaseUrl), {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(PORTAL_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'unavailable' };
  }
  if (res.status >= 200 && res.status < 300) return { kind: 'ok' };
  const body = await res.text().catch(() => '');
  return { kind: classifyFailure(res.status, res.headers.get('content-type'), body) };
}

/**
 * Current portal access token for the user's `sigo-portal` account. Uses
 * Better Auth's `auth.api.getAccessToken` (v1.6 core endpoint), which the
 * genericOAuth plugin backs for its providers: it reads the stored `account`
 * row and — when the access token is within 5s of expiry and a refresh token
 * exists — refreshes against the portal's token endpoint and persists the
 * new tokens. Trusted server-side call: no headers ⇒ `userId` names the
 * subject directly. Null on any failure (no linked account, OIDC disabled,
 * refresh rejected) ⇒ callers treat the portal as unavailable.
 */
async function getPortalAccessToken(userId: string): Promise<string | null> {
  // Imported lazily to keep this module load-safe in scripts/tests that set
  // OIDC env vars after import time; `auth` reads env at first touch.
  const { auth } = await import('./config');
  try {
    const { accessToken } = await auth.api.getAccessToken({
      body: { providerId: PORTAL_PROVIDER_ID, userId },
    });
    return accessToken || null;
  } catch {
    return null;
  }
}

/** Read the user's current status from the portal registry (fresh — never cached). */
export async function getMemberStatus(
  userId: string,
): Promise<MemberStatusReadResult> {
  const baseUrl = resolvePortalApiBaseUrl(process.env.OIDC_DISCOVERY_URL);
  if (!baseUrl) return { kind: 'unavailable' };
  const token = await getPortalAccessToken(userId);
  if (!token) return { kind: 'unavailable' };
  return fetchMemberStatus(baseUrl, token);
}

/** Write the user's status to the portal registry (the only durable store). */
export async function putMemberStatus(
  userId: string,
  status: MemberStatus,
): Promise<MemberStatusWriteResult> {
  const baseUrl = resolvePortalApiBaseUrl(process.env.OIDC_DISCOVERY_URL);
  if (!baseUrl) return { kind: 'unavailable' };
  const token = await getPortalAccessToken(userId);
  if (!token) return { kind: 'unavailable' };
  return sendMemberStatus(baseUrl, token, status);
}
