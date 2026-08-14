import { and, desc, eq } from 'drizzle-orm';
import { db, account } from '@app/db';
import { decodeJwtClaims } from './hooks/claim-sync';
import { PORTAL_PROVIDER_ID } from './portal-tiers';

/**
 * Member status — Active / Alumni (sigo-alumni backlog item 07, decided
 * 2026-08-14). A roster FACT, not a role: the single source of truth is the
 * portal's member registry. This app stores NOTHING durable — the id_token
 * `status` claim is a sign-in snapshot for initial render, and current truth
 * comes from `GET <portal>/api/member/status` on every page load. Writes go
 * through `PUT <portal>/api/member/status`, authenticated with the user's
 * stored OIDC access token.
 *
 * The portal side of this API is NOT built yet (post-2026-08-17, main-site
 * workstream). Everything here feature-detects at runtime: any response that
 * is not the contract shape reads as "unavailable", and callers hide the UI.
 */

export const MEMBER_STATUSES = ['active', 'alumni'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export function parseMemberStatus(value: unknown): MemberStatus | null {
  return typeof value === 'string' && (MEMBER_STATUSES as readonly string[]).includes(value)
    ? (value as MemberStatus)
    : null;
}

/** Pull the `status` claim out of decoded id_token claims. Absent / null /
 * unrecognized values all read as null (= undeclared) — nullable-safe by
 * contract, since the claim only ships once the portal builds item 07. */
export function memberStatusFromClaims(
  claims: Record<string, unknown> | null,
): MemberStatus | null {
  return claims ? parseMemberStatus(claims['status']) : null;
}

/**
 * Sign-in snapshot of the member status from the stored sigo-portal id_token
 * (mirrors `readPortalTier`). Fine for initial render; NOT authoritative
 * after edits — use `getMemberStatus` for current truth.
 */
export async function readMemberStatusClaim(userId: string): Promise<MemberStatus | null> {
  const [row] = await db
    .select({ idToken: account.idToken })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, PORTAL_PROVIDER_ID)))
    .orderBy(desc(account.updatedAt))
    .limit(1);
  if (!row?.idToken) return null;
  return memberStatusFromClaims(decodeJwtClaims(row.idToken));
}

// ---------------------------------------------------------------------------
// Portal member-status API client (item 07 contract)
// ---------------------------------------------------------------------------

export type MemberStatusView =
  { available: true; status: MemberStatus | null } | { available: false };

export type MemberStatusWriteResult =
  { ok: true } | { ok: false; reason: 'unavailable' | 'no-registry-row' };

/**
 * The portal API origin comes from the existing OIDC plumbing: the origin of
 * OIDC_DISCOVERY_URL (today the portal's Cloud Run origin, sigoalumni.org
 * after cutover) — no hardcoded host, and e2e/mock servers inherit it for
 * free. Read lazily so tests can set the env per-case.
 */
export function memberStatusEndpoint(): string | null {
  const discoveryUrl = process.env.OIDC_DISCOVERY_URL;
  if (!discoveryUrl) return null;
  try {
    return `${new URL(discoveryUrl).origin}/api/member/status`;
  } catch {
    return null;
  }
}

/** The user's OIDC access token, as stored by Better Auth's genericOAuth
 * plugin in the account table on sign-in. Null when the user has no portal
 * account row or no stored token (nothing to authenticate with). */
export async function readPortalAccessToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ accessToken: account.accessToken })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, PORTAL_PROVIDER_ID)))
    .orderBy(desc(account.updatedAt))
    .limit(1);
  return row?.accessToken ?? null;
}

export interface PortalFetchDeps {
  fetch?: typeof globalThis.fetch;
}

/**
 * GET the current status from the portal registry. Feature-detects: only a
 * 200 with a JSON body carrying a `status` key (value active/alumni/null)
 * counts as available. Everything else — missing route (404 page), 501,
 * 5xx, HTML fallbacks, network failure — reads as unavailable, which keeps
 * the UI control hidden until the portal ships the API.
 */
export async function fetchMemberStatusFromPortal(
  accessToken: string,
  endpoint: string,
  deps: PortalFetchDeps = {},
): Promise<MemberStatusView> {
  const doFetch = deps.fetch ?? globalThis.fetch;
  try {
    const res = await doFetch(endpoint, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
    });
    if (!res.ok) {
      // 404 covers both "route not built" and "no registry row" — the
      // contract hides the control in either case. 409/501/5xx likewise.
      console.debug(`[member-status] GET ${endpoint} → ${res.status}; treating as unavailable`);
      return { available: false };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      console.debug(
        `[member-status] GET ${endpoint} → 200 but non-JSON body; treating as unavailable`,
      );
      return { available: false };
    }
    if (typeof body !== 'object' || body === null || !('status' in body)) {
      console.debug(
        `[member-status] GET ${endpoint} → 200 but no status field; treating as unavailable`,
      );
      return { available: false };
    }
    const raw = (body as Record<string, unknown>)['status'];
    if (raw === null || raw === undefined) {
      return { available: true, status: null };
    }
    const status = parseMemberStatus(raw);
    if (!status) {
      // A status value outside the decided contract — fail closed rather
      // than guess (contract changes are versioned portal-side).
      console.error(
        `[member-status] GET ${endpoint} → unrecognized status value; treating as unavailable`,
      );
      return { available: false };
    }
    return { available: true, status };
  } catch (err) {
    console.error(`[member-status] GET ${endpoint} failed at fetch: ${String(err)}`);
    return { available: false };
  }
}

/** PUT a new status to the portal registry. 404/409 mean the user has no
 * linked registry row (contract) — callers hide the control. */
export async function pushMemberStatusToPortal(
  accessToken: string,
  endpoint: string,
  status: MemberStatus,
  deps: PortalFetchDeps = {},
): Promise<MemberStatusWriteResult> {
  const doFetch = deps.fetch ?? globalThis.fetch;
  try {
    const res = await doFetch(endpoint, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 404 || res.status === 409) {
      console.debug(`[member-status] PUT ${endpoint} → ${res.status}; no registry row`);
      return { ok: false, reason: 'no-registry-row' };
    }
    console.error(`[member-status] PUT ${endpoint} failed with status ${res.status}`);
    return { ok: false, reason: 'unavailable' };
  } catch (err) {
    console.error(`[member-status] PUT ${endpoint} failed at fetch: ${String(err)}`);
    return { ok: false, reason: 'unavailable' };
  }
}

/** Current-truth read for a user: stored access token + derived endpoint →
 * portal GET. Unavailable when OIDC is unconfigured or no token is stored. */
export async function getMemberStatus(
  userId: string,
  deps: PortalFetchDeps = {},
): Promise<MemberStatusView> {
  const endpoint = memberStatusEndpoint();
  if (!endpoint) return { available: false };
  const accessToken = await readPortalAccessToken(userId);
  if (!accessToken) {
    console.debug(`[member-status] no stored portal access token for user ${userId}`);
    return { available: false };
  }
  return fetchMemberStatusFromPortal(accessToken, endpoint, deps);
}

/** Self-set write for a user (contract: members set their OWN status). */
export async function setMemberStatus(
  userId: string,
  status: MemberStatus,
  deps: PortalFetchDeps = {},
): Promise<MemberStatusWriteResult> {
  const endpoint = memberStatusEndpoint();
  if (!endpoint) return { ok: false, reason: 'unavailable' };
  const accessToken = await readPortalAccessToken(userId);
  if (!accessToken) {
    console.debug(`[member-status] no stored portal access token for user ${userId}`);
    return { ok: false, reason: 'unavailable' };
  }
  return pushMemberStatusToPortal(accessToken, endpoint, status, deps);
}
