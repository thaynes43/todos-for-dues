import { cn } from '@/lib/utils';
import { pillBase, statusTones, type StatusTone } from '@/components/ui/styles';
import { stateDisplayName } from '@/lib/formatters';
import type { JobState } from '@app/db/schema';

// Design-system status tones only: green = good, amber = waiting on someone,
// red = needs attention, stone = neutral/terminal. The label carries the rest.
const STATE_TONES: Record<JobState, StatusTone> = {
  awaiting_moderation: 'warning',
  approved: 'info',
  enrollment_open: 'success',
  locked: 'info',
  completed: 'success',
  payment_sent: 'warning',
  closed: 'info',
  disputed: 'error',
  rejected: 'error',
  cancelled: 'info',
};

export function JobStateBadge({ state }: { state: JobState }) {
  return (
    <span
      data-testid="job-state-badge"
      data-state={state}
      className={cn(pillBase, statusTones[STATE_TONES[state]])}
    >
      {stateDisplayName(state)}
    </span>
  );
}
