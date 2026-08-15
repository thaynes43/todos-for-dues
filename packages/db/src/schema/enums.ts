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

// ADR-015: member status (active|alumni) is a portal-only roster fact, fully
// orthogonal to roles. Roles are Member | Moderator | Admin — the old
// ambiguous "Alumni" role is renamed to "Member" and the "Active" role is
// gone; both were retired in migration 0012. Status no longer lives here.
export const ROLES = ['Member', 'Moderator', 'Admin'] as const;
export type Role = (typeof ROLES)[number];

export const ACTOR_KINDS = ['user', 'system'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const ROLE_INITIATOR_KINDS = ['user', 'admin', 'system'] as const;
export type RoleInitiatorKind = (typeof ROLE_INITIATOR_KINDS)[number];
