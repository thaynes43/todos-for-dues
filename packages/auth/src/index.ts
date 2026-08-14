export { auth, oidcEnabled, type Auth } from './config';
export { getSessionRole } from './hooks/session-extension';
export {
  decodeJwtClaims,
  readPortalTier,
  refuseNonMemberUserCreate,
  syncPortalClaimsOnSessionCreate,
  syncRoleFromPortalTier,
  type ClaimSyncOutcome,
} from './hooks/claim-sync';
export {
  PORTAL_PROVIDER_ID,
  PORTAL_TIERS,
  isAppRole,
  mapTierToRole,
  parsePortalTier,
  tierAllowsRole,
  type PortalTier,
} from './portal-tiers';
export {
  MEMBER_STATUSES,
  fetchMemberStatusFromPortal,
  getMemberStatus,
  memberStatusEndpoint,
  memberStatusFromClaims,
  parseMemberStatus,
  pushMemberStatusToPortal,
  readMemberStatusClaim,
  readPortalAccessToken,
  setMemberStatus,
  type MemberStatus,
  type MemberStatusView,
  type MemberStatusWriteResult,
  type PortalFetchDeps,
} from './member-status';

import { auth } from './config';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getServerSession(headers: Headers): Promise<Session> {
  return auth.api.getSession({ headers });
}
