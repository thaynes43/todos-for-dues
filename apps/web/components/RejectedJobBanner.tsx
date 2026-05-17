import Link from 'next/link';

export function RejectedJobBanner({
  reason,
  canPostNew = false,
}: {
  reason: string | null | undefined;
  canPostNew?: boolean;
}) {
  return (
    <section
      role="region"
      aria-label="Rejected"
      data-testid="rejected-job-banner"
      className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm"
    >
      <h2 className="text-base font-semibold text-red-900">Posting rejected</h2>
      <p className="mt-1 text-red-900">
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
            className="font-medium text-red-900 underline underline-offset-2 hover:text-red-700"
          >
            Post a new job →
          </Link>
        </p>
      ) : null}
    </section>
  );
}
