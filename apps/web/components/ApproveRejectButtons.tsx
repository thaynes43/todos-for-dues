'use client';

import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';

export function ApproveRejectButtons({
  jobId,
  onApproved,
}: {
  jobId: string;
  onApproved?: () => void;
}) {
  const utils = trpc.useUtils();
  const approve = trpc.jobs.approve.useMutation({
    onSuccess: async () => {
      await utils.jobs.listModerationQueue.invalidate();
      await utils.jobs.getById.invalidate({ jobId });
      await utils.jobs.listByState.invalidate();
      onApproved?.();
    },
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        disabled={approve.isPending}
        onClick={() => approve.mutate({ jobId })}
        data-testid="approve-button"
      >
        {approve.isPending ? 'Approving…' : 'Approve'}
      </Button>
      {approve.error ? (
        <p role="alert" className="text-sm text-red-700">
          {approve.error.message}
        </p>
      ) : null}
    </div>
  );
}
