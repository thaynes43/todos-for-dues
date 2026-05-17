'use client';

import { trpc } from '@/lib/trpc-client';
import { JobCard } from '@/components/JobCard';
import { stateDisplayName } from '@/lib/formatters';
import type { JobState, Role } from '@app/db/schema';

export function JobsList({
  role,
  stateFilter,
}: {
  role: Role;
  stateFilter?: JobState | null;
}) {
  const filteredEnabled =
    stateFilter != null && (role === 'Admin' || role === 'Moderator');

  const filtered = trpc.jobs.listByState.useQuery(
    {
      state: stateFilter ?? 'enrollment_open',
      limit: 50,
      offset: 0,
    },
    { enabled: filteredEnabled },
  );

  const list = trpc.jobs.listByState.useQuery(
    {
      state: 'enrollment_open',
      limit: 50,
      offset: 0,
    },
    { enabled: !filteredEnabled },
  );

  const myPosted = trpc.jobs.listMyPosted.useQuery(undefined, {
    enabled:
      !filteredEnabled &&
      (role === 'Alumni' || role === 'Moderator' || role === 'Admin'),
  });

  if (filteredEnabled) {
    if (filtered.isLoading) {
      return <p data-testid="jobs-list-loading">Loading jobs…</p>;
    }
    if (filtered.error) {
      return (
        <div role="alert" className="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-900">
          Failed to load jobs: {filtered.error.message}
        </div>
      );
    }
    const rows = filtered.data ?? [];
    return (
      <section data-testid="jobs-filtered-list" data-state-filter={stateFilter}>
        <h2 className="mb-3 text-lg font-semibold">
          Filter: {stateFilter ? stateDisplayName(stateFilter) : ''}
        </h2>
        {rows.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="jobs-filtered-empty"
          >
            No jobs in this state.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((j) => (
              <JobCard
                key={j.id}
                id={j.id}
                description={j.description}
                duesAmount={j.duesAmount}
                recommendedPeopleCount={j.recommendedPeopleCount}
                state={j.state}
              />
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (list.isLoading) {
    return <p data-testid="jobs-list-loading">Loading jobs…</p>;
  }
  if (list.error) {
    return (
      <div role="alert" className="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-900">
        Failed to load jobs: {list.error.message}
      </div>
    );
  }

  const open = list.data ?? [];
  const posted = myPosted.data ?? [];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Open for enrollment</h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No jobs are open right now — check back soon.
          </p>
        ) : (
          <ul className="space-y-3">
            {open.map((j) => (
              <JobCard
                key={j.id}
                id={j.id}
                description={j.description}
                duesAmount={j.duesAmount}
                recommendedPeopleCount={j.recommendedPeopleCount}
                state={j.state}
              />
            ))}
          </ul>
        )}
      </section>

      {(role === 'Alumni' || role === 'Moderator' || role === 'Admin') && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">My postings</h2>
          {myPosted.isLoading ? (
            <p>Loading…</p>
          ) : posted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven&apos;t posted any jobs yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {posted.map((j) => (
                <JobCard
                  key={j.id}
                  id={j.id}
                  description={j.description}
                  duesAmount={j.duesAmount}
                  recommendedPeopleCount={j.recommendedPeopleCount}
                  state={j.state}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
