import { StatusNote } from '@/components/StatusNote';

export function CancelledJobBanner({
  reason,
}: {
  reason: string | null | undefined;
}) {
  return (
    <StatusNote
      tone="info"
      role="region"
      aria-label="Cancelled"
      testId="cancelled-job-banner"
      className="p-4"
    >
      <h2 className="font-semibold">Job cancelled</h2>
      <p className="mt-1">
        <strong>Reason:</strong>{' '}
        <span data-testid="cancelled-job-reason">
          {reason ?? '(no reason given)'}
        </span>
      </p>
    </StatusNote>
  );
}
