'use client';

import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';

export function ConfirmReceivedButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const confirm = trpc.jobs.confirmReceipt.useMutation({
    onSuccess: async () => {
      await utils.jobs.getById.invalidate({ jobId });
      router.refresh();
    },
  });

  return (
    <div className="space-y-1">
      <Button
        type="button"
        disabled={confirm.isPending}
        onClick={() => confirm.mutate({ jobId })}
        data-testid="confirm-received-button"
      >
        {confirm.isPending ? 'Confirming…' : 'Confirm received'}
      </Button>
      {confirm.error ? (
        <p role="alert" className="text-sm text-red-700">
          {confirm.error.message}
        </p>
      ) : null}
    </div>
  );
}
