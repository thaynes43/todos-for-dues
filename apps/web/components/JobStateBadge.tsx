import { cn } from '@/lib/utils';
import { stateDisplayName } from '@/lib/formatters';
import type { JobState } from '@app/db/schema';

const STATE_CLASSES: Record<JobState, string> = {
  awaiting_moderation: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  approved: 'bg-blue-100 text-blue-900 border-blue-300',
  enrollment_open: 'bg-green-100 text-green-900 border-green-300',
  locked: 'bg-purple-100 text-purple-900 border-purple-300',
  completed: 'bg-cyan-100 text-cyan-900 border-cyan-300',
  payment_sent: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  closed: 'bg-slate-200 text-slate-900 border-slate-400',
  disputed: 'bg-orange-100 text-orange-900 border-orange-300',
  rejected: 'bg-red-100 text-red-900 border-red-300',
  cancelled: 'bg-gray-100 text-gray-900 border-gray-300',
};

export function JobStateBadge({ state }: { state: JobState }) {
  return (
    <span
      data-testid="job-state-badge"
      data-state={state}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        STATE_CLASSES[state],
      )}
    >
      {stateDisplayName(state)}
    </span>
  );
}
