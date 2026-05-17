export function ClosedJobBanner({
  closedByDisplayName,
}: {
  closedByDisplayName: string | null | undefined;
}) {
  const who = closedByDisplayName ?? 'a chapter member';
  return (
    <section
      role="region"
      aria-label="Closed"
      data-testid="closed-job-banner"
      className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm"
    >
      <h2 className="text-base font-semibold">Loop closed</h2>
      <p className="mt-1">
        Closed by <strong data-testid="closed-by-name">{who}</strong>.
      </p>
    </section>
  );
}
