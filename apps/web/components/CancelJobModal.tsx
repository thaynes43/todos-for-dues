'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';

export function CancelJobModal({ jobId }: { jobId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const cancel = trpc.jobs.cancel.useMutation({
    onSuccess: async () => {
      await utils.jobs.getById.invalidate({ jobId });
      setOpen(false);
      setReason('');
      router.refresh();
    },
  });

  const canSubmit = reason.trim().length >= 1 && !cancel.isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    cancel.mutate({ jobId, reason: reason.trim() });
  };

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        data-testid="cancel-job-button"
      >
        Cancel job
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!cancel.isPending) setOpen(false);
        }}
        title="Cancel this job?"
        testId="cancel-job-modal"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block space-y-1">
            <span className="block text-sm font-medium">
              Reason (visible to enrolled Actives)
            </span>
            <Textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you cancelling this job?"
              data-testid="cancel-job-reason"
            />
          </label>
          {cancel.error ? (
            <p role="alert" className="text-sm text-red-700">
              {cancel.error.message}
            </p>
          ) : null}
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={cancel.isPending}
              data-testid="cancel-job-cancel"
            >
              Back
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!canSubmit}
              data-testid="cancel-job-submit"
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel job'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
