'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export function RescheduleButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const reschedule = trpc.jobs.reschedule.useMutation({
    onSuccess: async () => {
      await utils.jobs.getById.invalidate({ jobId });
      setOpen(false);
      router.refresh();
    },
  });

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="reschedule-button"
      >
        Reschedule
      </Button>
      {reschedule.error ? (
        <p role="alert" className="text-sm text-red-700">
          {reschedule.error.message}
        </p>
      ) : null}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Reschedule this job?"
        testId="reschedule-modal"
      >
        <p className="text-sm">
          Existing enrollments stay on the roster — Actives can self-unenroll if
          the new date won&apos;t work for them. (You&apos;ll pick a new date by
          locking again.)
        </p>
        {reschedule.error ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {reschedule.error.message}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={reschedule.isPending}
            onClick={() => setOpen(false)}
            data-testid="reschedule-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={reschedule.isPending}
            onClick={() => reschedule.mutate({ jobId })}
            data-testid="reschedule-confirm"
          >
            {reschedule.isPending ? 'Rescheduling…' : 'Reschedule'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
