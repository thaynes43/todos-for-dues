import type { JobState } from '@app/db/schema';

const JOB_STATE_DISPLAY: Record<JobState, string> = {
  awaiting_moderation: 'awaiting moderation',
  approved: 'approved',
  enrollment_open: 'enrollment-open',
  locked: 'locked',
  completed: 'completed',
  payment_sent: 'payment-sent',
  closed: 'closed',
  disputed: 'disputed',
  rejected: 'rejected',
  cancelled: 'cancelled',
};

export function stateDisplayName(state: JobState): string {
  return JOB_STATE_DISPLAY[state];
}

// PLAN-006 hardcodes the walking-skeleton chapter timezone until PLAN-010+ wires
// up the settings tRPC lookup. Replace with `settings.get('chapter_timezone')`
// once the Settings UI lands.
export const WALKING_SKELETON_TIMEZONE = 'America/New_York';

export function formatChapterLocal(
  utcIso: string | Date | null | undefined,
  timezone: string = WALKING_SKELETON_TIMEZONE,
): string {
  if (utcIso == null) return '';
  const d = typeof utcIso === 'string' ? new Date(utcIso) : utcIso;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}
