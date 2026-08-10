'use client';

import { trpc } from '@/lib/trpc-client';
import { JobCard } from '@/components/JobCard';
import { StatusNote } from '@/components/StatusNote';
import { EmptyState } from '@/components/EmptyState';
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
        <StatusNote tone="error">
          Couldn&apos;t load jobs — try a refresh.
        </StatusNote>
      );
    }
    const rows = filtered.data ?? [];
    return (
      <section data-testid="jobs-filtered-list" data-state-filter={stateFilter}>
        <h2 className="mb-4 text-2xl font-semibold sm:text-3xl">
          Filter: {stateFilter ? stateDisplayName(stateFilter) : ''}
        </h2>
        {rows.length === 0 ? (
          <EmptyState bordered testId="jobs-filtered-empty">
            No jobs in this state.
          </EmptyState>
        ) : (
          <ul className="space-y-4">
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
      <StatusNote tone="error">
        Couldn&apos;t load jobs — try a refresh.
      </StatusNote>
    );
  }

  const open = list.data ?? [];
  const posted = myPosted.data ?? [];

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 text-2xl font-semibold sm:text-3xl">
          Open for enrollment
        </h2>
        {open.length === 0 ? (
          <EmptyState bordered>
            No jobs are open right now — check back soon.
          </EmptyState>
        ) : (
          <ul className="space-y-4">
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
          <h2 className="mb-4 text-2xl font-semibold sm:text-3xl">
            My postings
          </h2>
          {myPosted.isLoading ? (
            <p>Loading…</p>
          ) : posted.length === 0 ? (
            <EmptyState>
              Nothing posted yet — post a job and it shows up here.
            </EmptyState>
          ) : (
            <ul className="space-y-4">
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
