import type { Page } from '@playwright/test';
import { Pool } from 'pg';
import { transitionRole } from '@app/domain';
import type { Role } from '@app/db/schema';
import {
  createPool,
  newSuffix,
  reAuth,
  seedCast,
  seedPersona,
  type Cast,
  type SeededPersona,
} from '../mvp/support';

export {
  createPool,
  newSuffix,
  reAuth,
  seedCast,
  seedPersona,
};
export type { Cast, SeededPersona };

/**
 * Mirrors the PLAN-011 pattern from `e2e/admin/support.ts`. Every role spec
 * must install this listener so an uncaught browser error fails the spec
 * rather than silently passing — VALIDATION-012 §6 gate.
 */
export function installPageerrorListener(page: Page): Error[] {
  const errors: Error[] = [];
  page.on('pageerror', (err) => errors.push(err));
  return errors;
}

/**
 * Demote every Admin in the caller's per-spec seeded set except `keepAdminId`.
 * PLAN-013 §3.1 #1 lean: the previous chapter-wide variant (`WHERE role =
 * 'Admin' AND id <> $keepId`) demoted concurrent specs' seeded admins under
 * `fullyParallel: true`, so those specs' layouts saw their user as Alumni →
 * assertion churn. Scope-narrowing the SELECT to `id = ANY($seededUserIds)`
 * makes the helper safe for cross-spec parallelism: the only admins this
 * helper touches are ones the caller seeded itself.
 *
 * Trade-off: the helper no longer guarantees CHAPTER-WIDE sole-Admin state
 * (the global Bootstrap Admin from `seedFixtures` + other specs' seeded
 * admins remain Admin). Callers that need to trigger the min-Admin invariant
 * via UI must either (a) be the only Playwright invocation running, or (b)
 * include the Bootstrap Admin's ID in `seededUserIds` (knowing they'll
 * temporarily clobber the global persona for the duration of the test —
 * walking-skeleton + auth specs may flake until restore).
 *
 * Uses the domain helper (`transitionRole`) per ADR-011 / PRD-008 R-05 so the
 * single-writer invariant (`no-direct-state-writes` test in packages/domain)
 * stays intact. Restore via `restoreAdmins` after the test.
 */
export async function demoteAllOtherAdmins(
  pool: Pool,
  seededUserIds: readonly string[],
  keepAdminId: string,
): Promise<string[]> {
  if (seededUserIds.length === 0) return [];
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'Admin' AND id = ANY($1::uuid[]) AND id <> $2`,
    [seededUserIds, keepAdminId],
  );
  const ids = rows.map((r) => r.id);
  for (const id of ids) {
    await transitionRole({
      targetUserId: id,
      expectedFromRole: 'Admin',
      toRole: 'Alumni',
      initiator: { id: keepAdminId, kind: 'admin' },
    });
  }
  return ids;
}

/**
 * Look up the globally-seeded chapter Admin row(s) by `E2E_SEED_ADMIN_EMAIL`
 * (globalSetup's portal-linked Admin persona — ADR-013 removed
 * BOOTSTRAP_ADMIN_EMAIL) so the per-spec ID allowlist passed to
 * `demoteAllOtherAdmins` can include the chapter-wide Admin persona
 * (otherwise the post-COMMIT chapter admin count remains ≥ 2 even after the
 * demote, and the min-Admin trigger never fires).
 */
export async function fetchBootstrapAdminIds(pool: Pool): Promise<string[]> {
  const bootstrapEmail = process.env.E2E_SEED_ADMIN_EMAIL;
  if (!bootstrapEmail) return [];
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [bootstrapEmail],
  );
  return rows.map((r) => r.id);
}

/**
 * Restore the Admins we demoted in `demoteAllOtherAdmins`. Run after the
 * test body so subsequent specs see the original roster shape. Promotes
 * via the domain helper too — same reasoning as `demoteAllOtherAdmins`.
 */
export async function restoreAdmins(
  pool: Pool,
  adminIds: readonly string[],
): Promise<void> {
  if (adminIds.length === 0) return;
  const { rows } = await pool.query<{ id: string; role: string }>(
    `SELECT id, role FROM users WHERE id = ANY($1::uuid[])`,
    [adminIds],
  );
  for (const row of rows) {
    if (row.role === 'Admin') continue;
    await transitionRole({
      targetUserId: row.id,
      expectedFromRole: row.role as Role,
      toRole: 'Admin',
      initiator: { id: null, kind: 'system' },
    });
  }
}

export async function getRoleFromDb(
  pool: Pool,
  userId: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.role ?? null;
}

export async function countRoleTransitions(
  pool: Pool,
  userId: string,
): Promise<number> {
  const { rows } = await pool.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM user_role_transitions WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.c ?? 0;
}
