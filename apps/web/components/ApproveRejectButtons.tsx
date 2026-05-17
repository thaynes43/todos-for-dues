'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { RejectModal } from './RejectModal';

export function ApproveRejectButtons({
  jobId,
  onApproved,
  onRejected,
}: {
  jobId: string;
  onApproved?: () => void;
  onRejected?: () => void;
}) {
  const utils = trpc.useUtils();
  const [rejectOpen, setRejectOpen] = useState(false);

  const approve = trpc.jobs.approve.useMutation({
    onSuccess: async () => {
      await utils.jobs.listModerationQueue.invalidate();
      await utils.jobs.getById.invalidate({ jobId });
      await utils.jobs.listByState.invalidate();
      onApproved?.();
    },
  });

  const reject = trpc.jobs.reject.useMutation({
    onSuccess: async () => {
      await utils.jobs.listModerationQueue.invalidate();
      await utils.jobs.getById.invalidate({ jobId });
      await utils.jobs.listByState.invalidate();
      setRejectOpen(false);
      onRejected?.();
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
      <Button
        type="button"
        variant="outline"
        disabled={reject.isPending}
        onClick={() => setRejectOpen(true)}
        data-testid="reject-button"
      >
        Reject
      </Button>
      {approve.error ? (
        <p role="alert" className="text-sm text-red-700">
          {approve.error.message}
        </p>
      ) : null}
      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onSubmit={(reason) => reject.mutate({ jobId, reason })}
        isPending={reject.isPending}
        error={reject.error?.message ?? null}
      />
    </div>
  );
}
