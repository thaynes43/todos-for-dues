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

export function isPostgresCheckViolation(
  err: unknown,
): err is { code: '23514'; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23514'
  );
}
