'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export function RevertCompletionButton({ jobId }: { jobId: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const revert = trpc.jobs.revertCompletion.useMutation({
    onSuccess: async () => {
      await utils.jobs.getById.invalidate({ jobId });
      setOpen(false);
    },
  });

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="revert-completion-button"
      >
        Revert completion
      </Button>
      {revert.error ? (
        <p role="alert" className="text-sm text-red-700">
          {revert.error.message}
        </p>
      ) : null}
      <Modal
        open={open}
        onClose={() => {
          if (!revert.isPending) setOpen(false);
        }}
        title="Revert completion?"
        testId="revert-completion-modal"
      >
        <p className="text-sm">
          This clears the confirmed-attendees list — you&apos;ll need to
          re-confirm before marking payment-sent.
        </p>
        {revert.error ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {revert.error.message}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={revert.isPending}
            onClick={() => setOpen(false)}
            data-testid="revert-completion-cancel"
          >
            Back
          </Button>
          <Button
            type="button"
            disabled={revert.isPending}
            onClick={() => revert.mutate({ jobId })}
            data-testid="revert-completion-confirm"
          >
            {revert.isPending ? 'Reverting…' : 'Revert'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
