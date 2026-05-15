export const JOB_STATES = [
  'awaiting_moderation',
  'approved',
  'enrollment_open',
  'locked',
  'completed',
  'payment_sent',
  'closed',
  'disputed',
  'rejected',
  'cancelled',
] as const;
export type JobState = (typeof JOB_STATES)[number];

export const ROLES = ['Active', 'Alumni', 'Moderator', 'Admin'] as const;
export type Role = (typeof ROLES)[number];

export const INVITE_TOKEN_ROLES = ['Active', 'Alumni'] as const;
export type InviteTokenRole = (typeof INVITE_TOKEN_ROLES)[number];

export const ACTOR_KINDS = ['user', 'system'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const ROLE_INITIATOR_KINDS = ['user', 'admin', 'system'] as const;
export type RoleInitiatorKind = (typeof ROLE_INITIATOR_KINDS)[number];
