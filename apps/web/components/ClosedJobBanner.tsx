import { StatusNote } from '@/components/StatusNote';

export function ClosedJobBanner({
  closedByDisplayName,
}: {
  closedByDisplayName: string | null | undefined;
}) {
  const who = closedByDisplayName ?? 'a chapter member';
  return (
    <StatusNote
      tone="info"
      role="region"
      aria-label="Closed"
      testId="closed-job-banner"
      className="p-4"
    >
      <h2 className="font-semibold">Loop closed</h2>
      <p className="mt-1">
        Closed by <strong data-testid="closed-by-name">{who}</strong>.
      </p>
    </StatusNote>
  );
}
