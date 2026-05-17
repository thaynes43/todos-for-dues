'use client';

import { useState, type FormEvent } from 'react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';

export function DisputeJobModal({ jobId }: { jobId: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const dispute = trpc.jobs.dispute.useMutation({
    onSuccess: async () => {
      await utils.jobs.getById.invalidate({ jobId });
      setOpen(false);
      setReason('');
    },
  });

  const canSubmit = reason.trim().length >= 1 && !dispute.isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    dispute.mutate({ jobId, reason: reason.trim() });
  };

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        data-testid="dispute-button"
      >
        Dispute
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!dispute.isPending) setOpen(false);
        }}
        title="Dispute this job"
        testId="dispute-modal"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            An Admin will review. Tell them what went wrong.
          </p>
          <label className="block space-y-1">
            <span className="block text-sm font-medium">Reason</span>
            <Textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What went wrong with this payment?"
              data-testid="dispute-reason"
            />
          </label>
          {dispute.error ? (
            <p role="alert" className="text-sm text-red-700">
              {dispute.error.message}
            </p>
          ) : null}
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={dispute.isPending}
              data-testid="dispute-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!canSubmit}
              data-testid="dispute-submit"
            >
              {dispute.isPending ? 'Submitting…' : 'Submit dispute'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
