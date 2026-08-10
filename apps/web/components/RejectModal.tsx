'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';

export function RejectModal({
  open,
  onClose,
  onSubmit,
  isPending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isPending: boolean;
  error?: string | null;
}) {
  const [reason, setReason] = useState('');
  const canSubmit = reason.trim().length >= 1 && !isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(reason.trim());
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reject this posting"
      testId="reject-modal"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="grid gap-1.5 text-sm font-medium">
          <span>
            Reason (visible to the Alumni who posted)
          </span>
          <Textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Briefly explain why this post is being rejected."
            data-testid="reject-reason-textarea"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="neutral"
            onClick={onClose}
            disabled={isPending}
            data-testid="reject-cancel"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit}
            data-testid="reject-submit"
          >
            {isPending ? 'Rejecting…' : 'Reject'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
