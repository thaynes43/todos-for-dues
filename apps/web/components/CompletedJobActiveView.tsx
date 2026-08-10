import { StatusNote } from '@/components/StatusNote';

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
      <StatusNote
        tone="info"
        testId="completed-job-active-view"
        className="p-4"
      >
        <p data-testid="completed-not-confirmed">
          You weren&apos;t confirmed for this job; no dues credit recorded.
        </p>
      </StatusNote>
    );
  }

  const amount = viewerCredit.amount ?? '0.00';
  return (
    <StatusNote
      tone="success"
      testId="completed-job-active-view"
      className="p-4"
    >
      <p>
        <strong>Your dues credit:</strong>{' '}
        <span data-testid="completed-credit-amount">${amount}</span>
      </p>
      <p className="mt-1 opacity-80">
        Look for this credit in the chapter dues books.
      </p>
    </StatusNote>
  );
}
