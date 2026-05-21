/**
 * Wire format for the chapter event bus — published by every mutation
 * procedure after txn commit, fanned out via SSE per ADR-012.
 *
 * Privacy invariant (PRD-012 R-07 / ADR-012 C-07): IDs + shallow metadata
 * only. NEVER add `description`, contact info, dues amount, Active names,
 * or any other content/PII field — clients re-query tRPC for the details
 * and pick up role projection automatically.
 *
 * The launch chapter is single-tenant per deploy (`chapter_id = 'default'`).
 * The field is reserved on the wire so multi-tenant routing later does not
 * change the payload shape.
 */
export type ChapterEventKind =
  | 'job.posted'
  | 'job.approved'
  | 'job.rejected'
  | 'job.edited'
  | 'job.enrolled'
  | 'job.unenrolled'
  | 'job.locked'
  | 'job.rescheduled'
  | 'job.completed'
  | 'job.revert_completion'
  | 'job.payment_sent'
  | 'job.confirmed_received'
  | 'job.disputed'
  | 'job.dispute_resolved'
  | 'job.cancelled';

export interface ChapterEvent {
  event_id: string;
  chapter_id: string;
  job_id: string;
  event_kind: ChapterEventKind;
  actor_id: string;
  occurred_at: string;
}

/**
 * Single-tenant MVP per PRD-012 §6.1 + Q-02 deferral. ADR-012 C-05 keeps
 * the channel chapter-scoped; multi-tenant routing replaces this constant
 * with a per-request chapter lookup without changing the wire format.
 */
export const DEFAULT_CHAPTER_ID = 'default';
