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
 * Demote every Admin in the chapter except the one we want to keep, so the
 * deferred-CHECK trigger sees exactly one Admin at commit time. Uses the
 * domain helper (`transitionRole`) per ADR-011 / PRD-008 R-05 so the
 * single-writer invariant (`no-direct-state-writes` test in packages/domain)
 * stays intact.
 *
 * This is destructive to the chapter's roster — last-Admin specs MUST run
 * under `--workers=1` so concurrent specs do not observe the briefly-empty
 * Admin set. Restore via `restoreAdmins` after the test.
 */
export async function demoteAllOtherAdmins(
  pool: Pool,
  keepAdminId: string,
): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'Admin' AND id <> $1`,
    [keepAdminId],
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
