import { z } from 'zod';
import {
  MEMBER_STATUSES,
  getMemberStatus,
  putMemberStatus,
  type MemberStatus,
} from '@app/auth';
import { authedProcedure, router } from '../trpc';

/**
 * ADR-015 — member status (`active`|`alumni`) via the portal registry
 * (sigo-alumni backlog item 07). The registry is the ONLY durable store, and
 * status is FULLY ORTHOGONAL to roles: this router reads/writes status and
 * NEVER touches `users.role`. `get` reads fresh from the portal on every call;
 * `set` PUTs then re-GETs. Nothing is cached app-side; no role transition is
 * ever fired from here (that was the coupling ADR-015 removed).
 *
 * Response `kind`:
 *   - `ok`             — a declared status (`active`|`alumni`);
 *   - `undeclared`     — linked registry row, nothing declared yet (null);
 *   - `no-registry-row`— authenticated member with no linked row (409) → the
 *                        UI hides the control;
 *   - `unavailable`    — portal down / not yet shipped → the UI hides the
 *                        control (there is no local fallback anymore).
 */

export interface MemberStatusState {
  kind: 'ok' | 'undeclared' | 'no-registry-row' | 'unavailable';
  /** Declared portal status; null unless kind === 'ok'. */
  status: MemberStatus | null;
}

export const memberStatusRouter = router({
  /** Fresh read from the portal registry (re-read on page load, never
   * persisted). Never writes anything — status is orthogonal to role. */
  get: authedProcedure.query(async ({ ctx }): Promise<MemberStatusState> => {
    const read = await getMemberStatus(ctx.userId);
    return {
      kind: read.kind,
      status: read.kind === 'ok' ? read.status : null,
    };
  }),

  /** PUT to the portal registry, then re-GET (contract: after PUT, re-read the
   * canonical value). No role effect whatsoever. */
  set: authedProcedure
    .input(z.object({ status: z.enum(MEMBER_STATUSES) }))
    .mutation(async ({ ctx, input }): Promise<MemberStatusState> => {
      const write = await putMemberStatus(ctx.userId, input.status);
      if (write.kind !== 'ok') {
        return { kind: write.kind, status: null };
      }
      const read = await getMemberStatus(ctx.userId);
      return {
        kind: read.kind,
        status: read.kind === 'ok' ? read.status : null,
      };
    }),
});
