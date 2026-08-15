/**
 * Portal member status — `active` | `alumni` (sigo-alumni backlog item 07,
 * consumed per ADR-015). A roster fact, NOT a permission, and FULLY ORTHOGONAL
 * to roles/tiers: an Admin/Moderator/Member can each be active or alumni.
 * Setting status never reads from or writes to any role field. The single
 * source of truth is the portal's member registry; this app stores nothing
 * durable — status is read fresh from the portal on page load
 * (GET /api/member/status) and written back on change (PUT). Access gates
 * (post vs. claim) key on the status value directly (ADR-015), never on role.
 */

/** Member statuses carried by the portal registry + `status` claim. */
export const MEMBER_STATUSES = ['active', 'alumni'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Null/absent = undeclared (registry column is nullable). */
export function parseMemberStatus(value: unknown): MemberStatus | null {
  return typeof value === 'string' &&
    (MEMBER_STATUSES as readonly string[]).includes(value)
    ? (value as MemberStatus)
    : null;
}

/**
 * The portal API base URL is the ORIGIN of `OIDC_DISCOVERY_URL` — no new
 * required env var, and the member-status endpoints automatically follow the
 * issuer cutover (ADR-013 C-03). Returns null when the discovery URL is
 * unset or unparseable (OIDC disabled ⇒ the portal feature is off too).
 */
export function resolvePortalApiBaseUrl(
  discoveryUrl: string | undefined,
): string | null {
  if (!discoveryUrl) return null;
  try {
    return new URL(discoveryUrl).origin;
  } catch {
    return null;
  }
}

/** `GET`/`PUT` endpoint for member status (sigo-alumni backlog 07 contract). */
export function memberStatusUrl(portalBaseUrl: string): string {
  return `${portalBaseUrl}/api/member/status`;
}
