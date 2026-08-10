'use client';

import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import type { JobState } from '@app/db/schema';

export function UnenrollButton({
  jobId,
  state,
}: {
  jobId: string;
  state: JobState;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const unenroll = trpc.jobs.unenroll.useMutation({
    onSuccess: async () => {
      await utils.jobs.getById.invalidate({ jobId });
      await utils.jobs.listMyEnrolled.invalidate();
      router.refresh();
    },
  });

  const disabled = state !== 'enrollment_open' || unenroll.isPending;

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="neutral"
        disabled={disabled}
        onClick={() => unenroll.mutate({ jobId })}
        data-testid="unenroll-button"
      >
        {unenroll.isPending ? 'Unenrolling…' : 'Unenroll'}
      </Button>
      {unenroll.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {unenroll.error.message}
        </p>
      ) : null}
    </div>
  );
}
