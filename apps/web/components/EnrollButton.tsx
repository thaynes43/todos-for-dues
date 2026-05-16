'use client';

import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import type { JobState } from '@app/db/schema';

export function EnrollButton({
  jobId,
  state,
}: {
  jobId: string;
  state: JobState;
}) {
  const utils = trpc.useUtils();
  const enroll = trpc.jobs.enroll.useMutation({
    onSuccess: async () => {
      await utils.jobs.getById.invalidate({ jobId });
    },
  });

  const disabled = state !== 'enrollment_open' || enroll.isPending;
  return (
    <div className="space-y-1">
      <Button
        type="button"
        disabled={disabled}
        onClick={() => enroll.mutate({ jobId })}
        data-testid="enroll-button"
      >
        {enroll.isPending ? 'Enrolling…' : 'Enroll'}
      </Button>
      {enroll.error ? (
        <p role="alert" className="text-sm text-red-700">
          {enroll.error.message}
        </p>
      ) : null}
    </div>
  );
}
