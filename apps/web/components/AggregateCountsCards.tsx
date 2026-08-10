import Link from 'next/link';
import { JOB_STATES, type JobState } from '@app/db/schema';
import { cardLinkBase } from '@/components/ui/styles';
import { cn } from '@/lib/utils';
import { stateDisplayName } from '@/lib/formatters';

export function AggregateCountsCards({
  counts,
}: {
  counts: Record<JobState, number>;
}) {
  return (
    <div
      data-testid="aggregate-counts-cards"
      className="grid grid-cols-2 gap-6 sm:grid-cols-3"
    >
      {JOB_STATES.map((state) => (
        <Link
          key={state}
          href={`/jobs?state=${state}`}
          data-testid={`aggregate-count-${state}`}
          data-state={state}
          className={cn(cardLinkBase, 'block p-6 text-left')}
        >
          <div className="text-sm opacity-70">{stateDisplayName(state)}</div>
          <div
            className="mt-1 text-3xl font-semibold"
            data-testid={`aggregate-count-value-${state}`}
          >
            {counts[state] ?? 0}
          </div>
        </Link>
      ))}
    </div>
  );
}
