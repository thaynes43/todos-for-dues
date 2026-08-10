'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc-client';
import { ApproveRejectButtons } from './ApproveRejectButtons';
import { EmptyState } from './EmptyState';
import { JobStateBadge } from './JobStateBadge';
import { formatChapterLocal } from '@/lib/formatters';

export function ModerationQueue() {
  const queue = trpc.jobs.listModerationQueue.useQuery();

  if (queue.isLoading) return <p data-testid="queue-loading">Loading queue…</p>;
  if (queue.error) {
    return (
      <div role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-red-900 dark:bg-red-950 dark:text-red-200">
        {queue.error.message}
      </div>
    );
  }

  const rows = queue.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState bordered>
        Nothing waiting for review — all caught up.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-4" data-testid="moderation-queue">
      {rows.map((j) => (
        <li
          key={j.id}
          className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
          data-testid="moderation-queue-row"
          data-job-id={j.id}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link
                href={`/jobs/${j.id}`}
                className="text-xl leading-tight font-semibold hover:underline"
              >
                {j.description}
              </Link>
              <p className="mt-1 text-sm opacity-70">
                ${j.duesAmount} dues · {j.recommendedPeopleCount} people
                recommended · submitted {formatChapterLocal(j.createdAt)}
              </p>
            </div>
            <JobStateBadge state={j.state} />
          </div>
          <div className="mt-4">
            <ApproveRejectButtons jobId={j.id} />
          </div>
        </li>
      ))}
    </ul>
  );
}
