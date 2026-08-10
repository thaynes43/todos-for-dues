import { ROLES, type Role } from '@app/db/schema';

/**
 * Portal OIDC provider id (ADR-013). Also the last path segment of the
 * registered redirect URI:
 *   https://todos-for-dues.haynesops.com/api/auth/oauth2/callback/sigo-portal
 * Renaming it invalidates the portal-side client registration.
 */
export const PORTAL_PROVIDER_ID = 'sigo-portal';

/** Portal membership tiers (sigo-alumni ADR 0006, carried in the `tier` claim). */
export const PORTAL_TIERS = ['pending', 'brother', 'operator', 'admin'] as const;
export type PortalTier = (typeof PORTAL_TIERS)[number];

export function parsePortalTier(value: unknown): PortalTier | null {
  return typeof value === 'string' &&
    (PORTAL_TIERS as readonly string[]).includes(value)
    ? (value as PortalTier)
    : null;
}

export function isAppRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * ADR-013 tier → app-role mapping (adopted by default per the modernization
 * plan §2.0 — TODO(tom): bless or amend in ADR-013):
 *
 *   admin    → Admin
 *   operator → Moderator
 *   brother  → Alumni
 *   pending  → 'refused' (sign-in denied — membership pending)
 *
 * `Active` (undergrads doing the work) is app-granted on top of a `brother`
 * tier — the portal registry has no actives — so `brother` tolerates BOTH
 * Alumni and Active (see tierAllowsRole). An unknown/missing tier maps to
 * 'refused' at the call sites (fail closed).
 */
export function mapTierToRole(tier: PortalTier): Role | 'refused' {
  switch (tier) {
    case 'admin':
      return 'Admin';
    case 'operator':
      return 'Moderator';
    case 'brother':
      return 'Alumni';
    case 'pending':
      return 'refused';
  }
}

/** Whether the user's current app role is consistent with the portal tier (no claim-sync transition needed). */
export function tierAllowsRole(tier: PortalTier, role: Role): boolean {
  if (tier === 'brother') return role === 'Alumni' || role === 'Active';
  return mapTierToRole(tier) === role;
}
