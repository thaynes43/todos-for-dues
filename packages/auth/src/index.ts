export { auth, oidcEnabled, type Auth } from './config';
export { enforceHdRestriction } from './hooks/hd-restriction';
export { getSessionRole } from './hooks/session-extension';
export { bootstrapAdminOnSignin } from './hooks/bootstrap-admin';
export { verifyInviteToken, findActiveInviteToken } from './invite-tokens/verify';
export { HdRestrictionError, InviteTokenError } from './errors';

import { auth } from './config';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getServerSession(headers: Headers): Promise<Session> {
  return auth.api.getSession({ headers });
}
