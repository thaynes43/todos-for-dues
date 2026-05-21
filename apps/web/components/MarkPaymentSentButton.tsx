'use client';

import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';

export function MarkPaymentSentButton({
  jobId,
  treasurerRecipient,
}: {
  jobId: string;
  treasurerRecipient?: string | null;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const mark = trpc.jobs.markPaymentSent.useMutation({
    onSuccess: async () => {
      await utils.jobs.getById.invalidate({ jobId });
      router.refresh();
    },
  });

  return (
    <div className="space-y-1">
      {treasurerRecipient ? (
        <p className="text-sm text-muted-foreground">
          Treasurer:{' '}
          <strong className="text-foreground">{treasurerRecipient}</strong>
        </p>
      ) : null}
      <Button
        type="button"
        disabled={mark.isPending}
        onClick={() => mark.mutate({ jobId })}
        data-testid="mark-payment-sent-button"
      >
        {mark.isPending ? 'Sending…' : 'Mark payment sent'}
      </Button>
      {mark.error ? (
        <p role="alert" className="text-sm text-red-700">
          {mark.error.message}
        </p>
      ) : null}
    </div>
  );
}
