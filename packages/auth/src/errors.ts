export class HdRestrictionError extends Error {
  readonly code = 'HD_RESTRICTION_FAILED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'HdRestrictionError';
  }
}

export class InviteTokenError extends Error {
  readonly code = 'INVITE_TOKEN_INVALID' as const;
  constructor(
    public reason: 'not_found' | 'revoked',
    message: string,
  ) {
    super(message);
    this.name = 'InviteTokenError';
  }
}
