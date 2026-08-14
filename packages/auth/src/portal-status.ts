/**
 * Portal member status — `active` | `alumni` (sigo-alumni backlog item 07,
 * consumed per ADR-014). A roster fact, NOT a permission: the single source
 * of truth is the portal's member registry. This app stores nothing durable —
 * status is read from the portal on page load (GET /api/member/status),
 * written back on change (PUT), and only *projected* onto the app's
 * Active/Alumni role partition through `transitionRole`.
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
 * Status → app-role projection (ADR-014). Only meaningful on the
 * Active/Alumni partition — privileged roles (Moderator/Admin) are driven by
 * portal *tier*, never by status.
 */
export function statusToRole(status: MemberStatus): 'Active' | 'Alumni' {
  return status === 'active' ? 'Active' : 'Alumni';
}

/** Inverse projection — used to display a current selection when the portal
 * row is undeclared (the app role is the access truth in that case). */
export function roleToStatus(role: string): MemberStatus | null {
  if (role === 'Active') return 'active';
  if (role === 'Alumni') return 'alumni';
  return null;
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
