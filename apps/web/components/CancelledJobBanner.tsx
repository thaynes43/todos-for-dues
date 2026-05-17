export function CancelledJobBanner({
  reason,
}: {
  reason: string | null | undefined;
}) {
  return (
    <section
      role="region"
      aria-label="Cancelled"
      data-testid="cancelled-job-banner"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"
    >
      <h2 className="text-base font-semibold text-amber-900">Job cancelled</h2>
      <p className="mt-1 text-amber-900">
        <strong>Reason:</strong>{' '}
        <span data-testid="cancelled-job-reason">
          {reason ?? '(no reason given)'}
        </span>
      </p>
    </section>
  );
}
