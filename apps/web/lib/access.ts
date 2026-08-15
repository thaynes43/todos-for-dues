import 'server-only';
import { cache } from 'react';
import {
  getMemberStatusGate,
  statusCanClaim,
  statusCanPost,
  type MemberStatusGate,
} from '@app/auth';

/**
 * ADR-015 — access gating keys on MEMBER STATUS (a portal-only roster fact),
 * never on role. Status `active` can claim/enroll; status `alumni` can post;
 * anything undeclared / no-registry-row / portal-unavailable can do neither and
 * is prompted to declare on /profile. Roles (Member/Moderator/Admin) are
 * orthogonal — privileged surfaces stay role-gated (see the caller sites).
 *
 * `cache()` dedupes the fresh portal read within a single server render pass so
 * the layout nav + the page gate share one round-trip. No durable storage,
 * bounded to the request (the pinned "no cache beyond the session" contract).
 */
const cachedGate = cache(getMemberStatusGate);

export interface MemberCapabilities {
  status: MemberStatusGate;
  /** status `active` → may claim/enroll. */
  canClaim: boolean;
  /** status `alumni` → may post. */
  canPost: boolean;
  /** No declared status yet (undeclared / no-registry-row / unavailable):
   * can do neither, shown a one-sentence prompt linking to /profile. */
  undeclared: boolean;
}

export async function getMemberCapabilities(
  userId: string,
): Promise<MemberCapabilities> {
  const status = await cachedGate(userId);
  const canClaim = statusCanClaim(status);
  const canPost = statusCanPost(status);
  return { status, canClaim, canPost, undeclared: !canClaim && !canPost };
}
