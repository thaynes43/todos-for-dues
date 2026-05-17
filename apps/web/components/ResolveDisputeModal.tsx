'use client';

import { useState, type FormEvent } from 'react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';

type ResolutionKind = 'closed' | 'cancelled' | 'false_alarm';

const RESOLUTION_TITLES: Record<ResolutionKind, string> = {
  closed: 'Mark dispute as closed',
  cancelled: 'Mark dispute as cancelled',
  false_alarm: 'Mark dispute as false-alarm (revert to payment-sent)',
};

export function ResolveDisputeModal({ jobId }: { jobId: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState<ResolutionKind | null>(null);
  const [note, setNote] = useState('');

  const closeAll = () => {
    setOpen(null);
    setNote('');
  };

  const onSettled = async () => {
    await utils.admin.listDisputed.invalidate();
    closeAll();
  };

  const resolveClosed = trpc.jobs.resolveDisputeAsClosed.useMutation({
    onSuccess: onSettled,
  });
  const resolveCancelled = trpc.jobs.resolveDisputeAsCancelled.useMutation({
    onSuccess: onSettled,
  });
  const resolvePaymentSent = trpc.jobs.resolveDisputeAsPaymentSent.useMutation({
    onSuccess: onSettled,
  });

  const activeMutation =
    open === 'closed'
      ? resolveClosed
      : open === 'cancelled'
        ? resolveCancelled
        : open === 'false_alarm'
          ? resolvePaymentSent
          : null;

  const canSubmit = note.trim().length >= 1 && !activeMutation?.isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit || !open) return;
    const trimmed = note.trim();
    if (open === 'closed') resolveClosed.mutate({ jobId, note: trimmed });
    else if (open === 'cancelled')
      resolveCancelled.mutate({ jobId, note: trimmed });
    else if (open === 'false_alarm')
      resolvePaymentSent.mutate({ jobId, note: trimmed });
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="resolve-dispute-buttons"
    >
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={() => {
          setOpen('closed');
          setNote('');
        }}
        data-testid="resolve-dispute-closed-button"
      >
        Mark closed
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen('cancelled');
          setNote('');
        }}
        data-testid="resolve-dispute-cancelled-button"
      >
        Mark cancelled
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen('false_alarm');
          setNote('');
        }}
        data-testid="resolve-dispute-false-alarm-button"
      >
        Mark false-alarm
      </Button>

      <Modal
        open={open !== null}
        onClose={() => {
          if (!activeMutation?.isPending) closeAll();
        }}
        title={open ? RESOLUTION_TITLES[open] : ''}
        testId="resolve-dispute-modal"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block space-y-1">
            <span className="block text-sm font-medium">
              Resolution note (recorded in the audit log)
            </span>
            <Textarea
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain the resolution for the audit log."
              data-testid="resolve-dispute-note"
            />
          </label>
          {activeMutation?.error ? (
            <p role="alert" className="text-sm text-red-700">
              {activeMutation.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={closeAll}
              disabled={activeMutation?.isPending}
              data-testid="resolve-dispute-cancel"
            >
              Back
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              data-testid="resolve-dispute-submit"
            >
              {activeMutation?.isPending ? 'Saving…' : 'Submit'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
