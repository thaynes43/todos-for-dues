import Link from 'next/link';
import { JOB_STATES, type JobState } from '@app/db/schema';
import { stateDisplayName } from '@/lib/formatters';

export function AggregateCountsCards({
  counts,
}: {
  counts: Record<JobState, number>;
}) {
  return (
    <div
      data-testid="aggregate-counts-cards"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {JOB_STATES.map((state) => (
        <Link
          key={state}
          href={`/jobs?state=${state}`}
          data-testid={`aggregate-count-${state}`}
          data-state={state}
          className="rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted"
        >
          <div className="text-xs text-muted-foreground">
            {stateDisplayName(state)}
          </div>
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
