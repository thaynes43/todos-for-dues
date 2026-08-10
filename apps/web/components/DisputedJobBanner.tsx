import { StatusNote } from '@/components/StatusNote';

export function DisputedJobBanner({
  reason,
}: {
  reason?: string | null | undefined;
}) {
  return (
    <StatusNote
      tone="error"
      role="region"
      aria-label="Disputed"
      testId="disputed-job-banner"
      className="p-4"
    >
      <h2 className="font-semibold">Job disputed</h2>
      <p className="mt-1">An Admin is reviewing.</p>
      {reason ? (
        <p className="mt-2">
          <strong>Reason:</strong>{' '}
          <span data-testid="disputed-job-reason">{reason}</span>
        </p>
      ) : null}
    </StatusNote>
  );
}
