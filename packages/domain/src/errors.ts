export class FsmViolationError extends Error {
  readonly code = 'FSM_VIOLATION' as const;
}

export class ConcurrentTransitionError extends Error {
  readonly code = 'CONCURRENT_TRANSITION' as const;
}

export class MinAdminInvariantError extends Error {
  readonly code = 'MIN_ADMIN_INVARIANT_VIOLATED' as const;
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
