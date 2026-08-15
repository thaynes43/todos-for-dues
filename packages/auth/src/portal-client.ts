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
 * Both authenticated with the user's OIDC access token from sign-in.
 *
 * Response classification is pinned to the portal's shipped route contract
 * (sigo-alumni backlog item 07, verified against the portal source):
 *   - GET 200 `{ status: 'active'|'alumni'|null }` ⇒ `ok` / `undeclared`;
 *   - PUT any 2xx ⇒ `ok` (the caller re-GETs);
 *   - **409 JSON `{ code: 'no_registry_row' }`** ⇒ `no-registry-row`: an
 *     authenticated member with no linked registry row (Pending) — consumers
 *     hide the control;
 *   - 404 is reserved for route-absent, so 404/401/501/5xx/non-JSON all ⇒
 *     `unavailable` (portal down / not yet shipped) — consumers hide the
 *     control and never fall back to any local role write (there is no local
 *     status store anymore, ADR-015).
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

function classifyFailure(status: number): 'no-registry-row' | 'unavailable' {
  // Pinned contract: 409 is the ONLY no-registry-row signal (authenticated
  // member, no linked row). 404 is reserved for route-absent, so it — like
  // 401/501/5xx/anything unexpected — classifies `unavailable`: hide the
  // control, write nothing.
  if (status === 409) return 'no-registry-row';
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
  return { kind: classifyFailure(res.status) };
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
  return { kind: classifyFailure(res.status) };
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

/**
 * Collapsed member status for ACCESS GATING (ADR-015). The job-board gates key
 * on this value directly — status `active` can claim/enroll, status `alumni`
 * can post — never on role. Everything that is not a declared status (`null`
 * undeclared, `no-registry-row` for a member with no linked row, `unavailable`
 * when the portal is down/unshipped) collapses to a state that can do neither;
 * gating fails closed. A user with no registry row is treated like undeclared.
 */
export type MemberStatusGate =
  | MemberStatus
  | 'undeclared'
  | 'no-registry-row'
  | 'unavailable';

/** Resolve the gating status for a user — one fresh portal read (ADR-015). */
export async function getMemberStatusGate(
  userId: string,
): Promise<MemberStatusGate> {
  const read = await getMemberStatus(userId);
  switch (read.kind) {
    case 'ok':
      return read.status;
    case 'undeclared':
      return 'undeclared';
    case 'no-registry-row':
      return 'no-registry-row';
    case 'unavailable':
      return 'unavailable';
  }
}

/** True iff the resolved status permits claiming/enrolling in jobs (ADR-015). */
export function statusCanClaim(gate: MemberStatusGate): boolean {
  return gate === 'active';
}

/** True iff the resolved status permits posting jobs (ADR-015). */
export function statusCanPost(gate: MemberStatusGate): boolean {
  return gate === 'alumni';
}
