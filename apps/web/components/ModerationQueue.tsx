'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc-client';
import { ApproveRejectButtons } from './ApproveRejectButtons';
import { JobStateBadge } from './JobStateBadge';
import { formatChapterLocal } from '@/lib/formatters';

export function ModerationQueue() {
  const queue = trpc.jobs.listModerationQueue.useQuery();

  if (queue.isLoading) return <p data-testid="queue-loading">Loading queue…</p>;
  if (queue.error) {
    return (
      <div role="alert" className="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-900">
        {queue.error.message}
      </div>
    );
  }

  const rows = queue.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        The moderation queue is empty.
      </p>
    );
  }

  return (
    <ul className="space-y-3" data-testid="moderation-queue">
      {rows.map((j) => (
        <li
          key={j.id}
          className="rounded-lg border bg-card p-4 shadow-sm"
          data-testid="moderation-queue-row"
          data-job-id={j.id}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                {j.description}
              </Link>
              <p className="text-sm text-muted-foreground">
                Dues: <strong className="text-foreground">${j.duesAmount}</strong> · Recommended:{' '}
                <strong className="text-foreground">{j.recommendedPeopleCount}</strong> people ·
                Submitted: {formatChapterLocal(j.createdAt)}
              </p>
            </div>
            <JobStateBadge state={j.state} />
          </div>
          <div className="mt-3">
            <ApproveRejectButtons jobId={j.id} />
          </div>
        </li>
      ))}
    </ul>
  );
}
