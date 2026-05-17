export interface ViewerCredit {
  confirmed: boolean;
  amount: string | null;
}

export function CompletedJobActiveView({
  viewerCredit,
}: {
  viewerCredit: ViewerCredit | null | undefined;
}) {
  if (!viewerCredit) return null;

  if (!viewerCredit.confirmed) {
    return (
      <section
        data-testid="completed-job-active-view"
        className="rounded-lg border bg-muted/40 p-4 text-sm"
      >
        <p data-testid="completed-not-confirmed">
          You weren&apos;t confirmed for this job; no dues credit recorded.
        </p>
      </section>
    );
  }

  const amount = viewerCredit.amount ?? '0.00';
  return (
    <section
      data-testid="completed-job-active-view"
      className="rounded-lg border bg-emerald-50 p-4 text-sm"
    >
      <p>
        <strong>Your dues credit:</strong>{' '}
        <span data-testid="completed-credit-amount">${amount}</span>
      </p>
      <p className="mt-1 text-muted-foreground">
        Look for this credit in the chapter dues books.
      </p>
    </section>
  );
}
