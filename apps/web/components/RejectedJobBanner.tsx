import Link from 'next/link';
import { StatusNote } from '@/components/StatusNote';

export function RejectedJobBanner({
  reason,
  canPostNew = false,
}: {
  reason: string | null | undefined;
  canPostNew?: boolean;
}) {
  return (
    <StatusNote
      tone="error"
      role="region"
      aria-label="Rejected"
      testId="rejected-job-banner"
      className="p-4"
    >
      <h2 className="font-semibold">Posting rejected</h2>
      <p className="mt-1">
        <strong>Reason:</strong>{' '}
        <span data-testid="rejected-job-reason">
          {reason ?? '(no reason given)'}
        </span>
      </p>
      {canPostNew ? (
        <p className="mt-3">
          <Link
            href="/jobs/new"
            data-testid="rejected-post-new-cta"
            className="font-medium underline underline-offset-4"
          >
            Post a new job →
          </Link>
        </p>
      ) : null}
    </StatusNote>
  );
}
