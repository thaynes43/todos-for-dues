export class FsmViolationError extends Error {
  readonly code = 'FSM_VIOLATION' as const;
}

export class ConcurrentTransitionError extends Error {
  readonly code = 'CONCURRENT_TRANSITION' as const;
}

export class MinAdminInvariantError extends Error {
  readonly code = 'MIN_ADMIN_INVARIANT_VIOLATED' as const;
}

// PRD-011 R-04: edit attempted on a job that isn't in an editable state
// (`awaiting_moderation`, `approved`, `enrollment_open`).
export class JobNotEditableError extends Error {
  readonly code = 'JOB_NOT_EDITABLE_IN_STATE' as const;
}

// PRD-011: edit submitted with no actual changes vs. the current row.
export class NoEditChangesError extends Error {
  readonly code = 'NO_EDIT_CHANGES' as const;
}

export interface PostgresCheckViolation {
  code: '23514';
  message: string;
}

/**
 * Find a Postgres CHECK-violation (ERRCODE 23514) anywhere in an error's
 * `cause` chain. drizzle-orm ≥0.44 wraps driver errors in DrizzleQueryError
 * (e.g. `Failed query: commit` for a DEFERRABLE trigger firing at COMMIT)
 * with the original pg DatabaseError as `cause`, so the raw error is no
 * longer the thrown value itself.
 */
export function findPostgresCheckViolation(
  err: unknown,
): PostgresCheckViolation | null {
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    if (
      'code' in current &&
      (current as { code?: unknown }).code === '23514'
    ) {
      return current as PostgresCheckViolation;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}
