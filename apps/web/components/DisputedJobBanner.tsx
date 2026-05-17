export function DisputedJobBanner({
  reason,
}: {
  reason?: string | null | undefined;
}) {
  return (
    <section
      role="region"
      aria-label="Disputed"
      data-testid="disputed-job-banner"
      className="rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm"
    >
      <h2 className="text-base font-semibold text-orange-900">
        Job disputed
      </h2>
      <p className="mt-1 text-orange-900">
        This job is disputed. An Admin is reviewing.
      </p>
      {reason ? (
        <p className="mt-2 text-orange-900">
          <strong>Reason:</strong>{' '}
          <span data-testid="disputed-job-reason">{reason}</span>
        </p>
      ) : null}
    </section>
  );
}
